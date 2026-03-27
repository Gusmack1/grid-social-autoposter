// Post management routes
import { db } from '../db/index.mjs';
import { publishToAll, deleteFromPlatforms } from '../publisher.mjs';
import { notifyClientPostsReady } from '../email.mjs';
import { checkPlanLimit, countMonthlyPosts } from '../plan-limits.mjs';
import { json, badRequest, notFound, serverError } from '../http.mjs';
import { logger } from '../logger.mjs';
import { cachePostImages } from '../image-cache.mjs';
import { schedulePost, isQStashEnabled } from '../qstash.mjs';

export async function getPosts(url, clientId) {
  const allPosts = await db.getPosts(clientId);
  const limit = parseInt(url.searchParams.get('limit')) || 0;
  const offset = parseInt(url.searchParams.get('offset')) || 0;
  if (limit > 0) {
    return json({ posts: allPosts.slice(offset, offset + limit), total: allPosts.length, offset, limit });
  }
  return json(allPosts);
}

export async function addPost(req, url, clientId, user) {
  const body = await req.json();
  if (!body.caption) return badRequest('Caption required');
  const clients = await db.getClients();
  const client = clients.find(c => c.id === clientId);
  const userPlan = user.plan || 'free';
  const allClientIds = clients.map(c => c.id);
  const monthlyPosts = await countMonthlyPosts(db.getPosts.bind(db), allClientIds);
  const limitCheck = await checkPlanLimit(userPlan, 'add-post', { monthlyPosts });
  if (!limitCheck.allowed) return json({ error: limitCheck.reason, usage: limitCheck.usage }, 403);

  const list = await db.getPosts(clientId);
  const approvalMode = client?.approvalMode || 'auto';
  let approvalStatus = 'approved';
  if (approvalMode === 'manual' || approvalMode === 'passive') approvalStatus = 'pending';
  const np = {
    id: 'post_' + crypto.randomUUID(), clientId, caption: body.caption,
    imageUrl: body.imageUrl || null, videoUrl: body.videoUrl || null,
    imageUrls: body.imageUrls || null,
    postType: body.postType || 'feed', platforms: body.platforms || ['facebook'],
    status: body.scheduledFor ? 'scheduled' : 'queued',
    scheduledFor: body.scheduledFor || null,
    approvalStatus, approvalMode,
    passiveDeadline: approvalMode === 'passive' ? new Date(Date.now() + (client?.passiveApprovalHours || 72) * 3600 * 1000).toISOString() : null,
    createdAt: new Date().toISOString(), publishedAt: null, results: null,
  };
  // Cache external image URLs to permanent storage (R2/GitHub) at queue time
  await cachePostImages(np);
  list.push(np);
  await db.savePosts(clientId, list);

  // If scheduled and QStash is enabled, schedule via QStash for precise timing
  let qstashResult = null;
  if (np.scheduledFor && approvalStatus === 'approved' && isQStashEnabled()) {
    qstashResult = await schedulePost(np.id, clientId, np.scheduledFor);
    if (qstashResult.scheduled) {
      np.qstashMessageId = qstashResult.messageId;
      // Update the post with the QStash message ID
      const idx = list.findIndex(p => p.id === np.id);
      list[idx].qstashMessageId = qstashResult.messageId;
      await db.savePosts(clientId, list);
    }
  }

  if (approvalStatus === 'pending' && client?.clientEmail) {
    await notifyClientPostsReady({ clientEmail: client.clientEmail, clientName: client.name, approvalUrl: `${url.origin}/approve`, postCount: 1 }).catch(e => logger.warn('Approval email failed', { error: e.message }));
  }
  return json({ success: true, post: np, qstash: qstashResult });
}

export async function updatePost(req, clientId) {
  const body = await req.json();
  const list = await db.getPosts(clientId);
  const idx = list.findIndex(p => p.id === body.postId);
  if (idx === -1) return notFound('Post not found');
  Object.assign(list[idx], body);
  await db.savePosts(clientId, list);
  return json({ success: true, post: list[idx] });
}

export async function deletePost(req, clientId) {
  const body = await req.json();
  let list = await db.getPosts(clientId);
  list = list.filter(p => p.id !== body.postId);
  await db.savePosts(clientId, list);
  return json({ success: true });
}

export async function postNow(req, clientId, user) {
  const body = await req.json();
  if (!body.caption) return badRequest('Caption required');
  const clients = await db.getClients();
  const client = clients.find(c => c.id === clientId);
  if (!client) return notFound('Client not found');
  const userPlan = user.plan || 'free';
  const allClientIds = clients.map(c => c.id);
  const monthlyPosts = await countMonthlyPosts(db.getPosts.bind(db), allClientIds);
  const limitCheck = await checkPlanLimit(userPlan, 'add-post', { monthlyPosts });
  if (!limitCheck.allowed) return json({ error: limitCheck.reason, usage: limitCheck.usage }, 403);
  const np = {
    id: 'post_' + crypto.randomUUID(), clientId, caption: body.caption,
    imageUrl: body.imageUrl || null, videoUrl: body.videoUrl || null,
    imageUrls: body.imageUrls || null,
    postType: body.postType || 'feed', platforms: body.platforms || ['facebook'],
    status: 'publishing', createdAt: new Date().toISOString(), publishedAt: null, results: null,
  };
  await cachePostImages(np);
  const results = await publishToAll(client, np);
  np.status = 'published';
  np.publishedAt = new Date().toISOString();
  np.results = results;
  const list = await db.getPosts(clientId);
  list.push(np);
  await db.savePosts(clientId, list);
  return json({ success: true, post: np, results });
}

export async function publishNow(req, clientId) {
  const body = await req.json();
  const clients = await db.getClients();
  const client = clients.find(c => c.id === clientId);
  if (!client) return badRequest('Client not configured');
  const pl = await db.getPosts(clientId);
  const post = pl.find(p => p.id === body.postId);
  if (!post) return notFound('Post not found');
  const results = await publishToAll(client, post);
  const pi = pl.findIndex(p => p.id === body.postId);
  pl[pi].status = 'published';
  pl[pi].publishedAt = new Date().toISOString();
  pl[pi].results = results;
  await db.savePosts(clientId, pl);
  return json({ success: true, results });
}

export async function deleteFromPlatform(req, clientId) {
  const body = await req.json();
  const clients = await db.getClients();
  const client = clients.find(c => c.id === clientId);
  if (!client) return notFound('Client not found');
  const pl = await db.getPosts(clientId);
  const post = pl.find(p => p.id === body.postId);
  if (!post) return notFound('Post not found');
  if (!post.results) return badRequest('No publish results');
  const dr = await deleteFromPlatforms(client, post);
  const pi = pl.findIndex(p => p.id === body.postId);
  pl[pi].status = 'deleted';
  pl[pi].deletedAt = new Date().toISOString();
  pl[pi].deleteResults = dr;
  await db.savePosts(clientId, pl);
  return json({ success: true, deleteResults: dr });
}

export async function bulkImport(req, clientId, user) {
  const body = await req.json();
  if (!body.posts || !Array.isArray(body.posts)) return badRequest('posts array required');
  const allClients = await db.getClients();
  const userPlan = user.plan || 'free';
  const allClientIds = allClients.map(c => c.id);
  const monthlyPosts = await countMonthlyPosts(db.getPosts.bind(db), allClientIds);
  const limitCheck = await checkPlanLimit(userPlan, 'bulk-import', { monthlyPosts, importCount: body.posts.length });
  if (!limitCheck.allowed) return json({ error: limitCheck.reason, usage: limitCheck.usage }, 403);
  const list = await db.getPosts(clientId);
  const client = allClients.find(c => c.id === clientId);
  const approvalMode = client?.approvalMode || 'auto';
  let imported = 0;
  for (const p of body.posts) {
    if (!p.caption) continue;
    let approvalStatus = 'approved';
    if (approvalMode === 'manual' || approvalMode === 'passive') approvalStatus = 'pending';
    const newPost = {
      id: 'post_' + crypto.randomUUID(), clientId, caption: p.caption,
      imageUrl: p.imageUrl || null, videoUrl: null, imageUrls: null,
      postType: p.postType || 'feed', platforms: p.platforms || ['facebook'],
      status: p.scheduledFor ? 'scheduled' : 'queued', scheduledFor: p.scheduledFor || null,
      approvalStatus, approvalMode, createdAt: new Date().toISOString(), publishedAt: null, results: null,
    };
    await cachePostImages(newPost);
    list.push(newPost);
    imported++;
  }
  await db.savePosts(clientId, list);
  logger.info('Bulk import', { clientId, imported });
  return json({ success: true, imported });
}

export async function duplicatePost(req, clientId) {
  const body = await req.json();
  if (!body.postId) return badRequest('postId required');
  const list = await db.getPosts(clientId);
  const original = list.find(p => p.id === body.postId);
  if (!original) return notFound('Post not found');
  const dup = {
    id: 'post_' + crypto.randomUUID(), clientId, caption: original.caption,
    imageUrl: original.imageUrl || null, videoUrl: original.videoUrl || null,
    imageUrls: original.imageUrls || null, postType: original.postType || 'feed',
    platforms: [...(original.platforms || ['facebook'])], status: 'queued',
    scheduledFor: null, approvalStatus: 'approved', approvalMode: 'auto',
    createdAt: new Date().toISOString(), publishedAt: null, results: null,
  };
  list.push(dup);
  await db.savePosts(clientId, list);
  logger.info('Post duplicated', { originalId: body.postId, newId: dup.id, clientId });
  return json({ success: true, post: dup });
}

export async function bulkDelete(req, clientId) {
  const body = await req.json();
  if (!Array.isArray(body.postIds) || body.postIds.length === 0) return badRequest('postIds[] required');
  let list = await db.getPosts(clientId);
  const before = list.length;
  list = list.filter(p => !body.postIds.includes(p.id));
  await db.savePosts(clientId, list);
  const deleted = before - list.length;
  logger.info('Bulk delete', { clientId, deleted, requested: body.postIds.length });
  return json({ success: true, deleted });
}

export async function bulkPublish(req, clientId) {
  const body = await req.json();
  if (!Array.isArray(body.postIds) || body.postIds.length === 0) return badRequest('postIds[] required');
  const clients = await db.getClients();
  const client = clients.find(c => c.id === clientId);
  if (!client) return notFound('Client not found');
  const list = await db.getPosts(clientId);
  const results = [];
  for (const pid of body.postIds) {
    const post = list.find(p => p.id === pid);
    if (!post || post.status === 'published') continue;
    if (post.approvalStatus === 'pending' || post.approvalStatus === 'changes_requested') continue;
    try {
      const pubResults = await publishToAll(client, post);
      const idx = list.findIndex(p => p.id === pid);
      list[idx].status = 'published';
      list[idx].publishedAt = new Date().toISOString();
      list[idx].results = pubResults;
      results.push({ postId: pid, success: true, results: pubResults });
    } catch (e) {
      results.push({ postId: pid, success: false, error: e.message });
    }
  }
  await db.savePosts(clientId, list);
  logger.info('Bulk publish', { clientId, published: results.filter(r => r.success).length, total: body.postIds.length });
  return json({ success: true, results });
}

export async function bulkReschedule(req, clientId) {
  const body = await req.json();
  if (!Array.isArray(body.postIds) || !body.scheduledFor) return badRequest('postIds[] and scheduledFor required');
  const list = await db.getPosts(clientId);
  let updated = 0;
  for (const pid of body.postIds) {
    const idx = list.findIndex(p => p.id === pid);
    if (idx === -1 || list[idx].status === 'published') continue;
    list[idx].scheduledFor = body.scheduledFor;
    list[idx].status = 'scheduled';
    updated++;
  }
  await db.savePosts(clientId, list);
  // Schedule via QStash if enabled
  if (isQStashEnabled()) {
    for (const pid of body.postIds) {
      const post = list.find(p => p.id === pid && p.status === 'scheduled');
      if (post && (!post.approvalStatus || post.approvalStatus === 'approved')) {
        schedulePost(pid, clientId, body.scheduledFor).catch(e => logger.warn('QStash reschedule failed', { postId: pid, error: e.message }));
      }
    }
  }
  logger.info('Bulk reschedule', { clientId, updated, scheduledFor: body.scheduledFor });
  return json({ success: true, updated });
}

export async function setApprovalStatus(req, clientId, user) {
  const body = await req.json();
  if (!clientId || !body.postId || !body.approvalStatus) return badRequest('clientId, postId, and approvalStatus required');
  const validStatuses = ['pending', 'approved', 'changes_requested'];
  if (!validStatuses.includes(body.approvalStatus)) return badRequest('Invalid approval status');
  const posts = await db.getPosts(clientId);
  const idx = posts.findIndex(p => p.id === body.postId);
  if (idx === -1) return notFound('Post not found');
  posts[idx].approvalStatus = body.approvalStatus;
  if (body.approvalStatus === 'approved') {
    posts[idx].approvedAt = new Date().toISOString();
    posts[idx].approvedBy = user.email;
  }
  await db.savePosts(clientId, posts);
  return json({ success: true, post: posts[idx] });
}

export async function reorderQueue(req, clientId) {
  const body = await req.json();
  if (!clientId || !Array.isArray(body.order)) return badRequest('clientId and order[] required');
  const list = await db.getPosts(clientId);
  const orderMap = {};
  body.order.forEach((id, i) => { orderMap[id] = i; });
  for (const post of list) {
    if (orderMap[post.id] !== undefined) post.sortOrder = orderMap[post.id];
  }
  await db.savePosts(clientId, list);
  logger.info('Queue reordered', { clientId, count: body.order.length });
  return json({ success: true });
}

export async function markEvergreen(req, clientId) {
  const body = await req.json();
  if (!body.postId) return badRequest('postId required');
  const list = await db.getPosts(clientId);
  const idx = list.findIndex(p => p.id === body.postId);
  if (idx === -1) return notFound('Post not found');
  list[idx].evergreen = true;
  await db.savePosts(clientId, list);
  logger.info('Marked post as evergreen', { clientId, postId: body.postId });
  return json({ success: true });
}

export async function unmarkEvergreen(req, clientId) {
  const body = await req.json();
  if (!body.postId) return badRequest('postId required');
  const list = await db.getPosts(clientId);
  const idx = list.findIndex(p => p.id === body.postId);
  if (idx === -1) return notFound('Post not found');
  list[idx].evergreen = false;
  await db.savePosts(clientId, list);
  logger.info('Unmarked post as evergreen', { clientId, postId: body.postId });
  return json({ success: true });
}

export async function getEvergreen(clientId) {
  const list = await db.getPosts(clientId);
  return json(list.filter(p => p.evergreen === true));
}

export async function recyclePost(req, clientId) {
  const body = await req.json();
  if (!body.postId || !body.scheduledFor) return badRequest('postId and scheduledFor required');
  const list = await db.getPosts(clientId);
  const original = list.find(p => p.id === body.postId);
  if (!original) return notFound('Post not found');
  const newPost = {
    id: 'post_' + crypto.randomUUID(), clientId, caption: original.caption,
    imageUrl: original.imageUrl || null, videoUrl: original.videoUrl || null,
    imageUrls: original.imageUrls || null, postType: original.postType || 'feed',
    platforms: original.platforms || [], status: 'scheduled', scheduledFor: body.scheduledFor,
    approvalStatus: original.approvalStatus, approvalMode: original.approvalMode,
    evergreen: original.evergreen || false, createdAt: new Date().toISOString(), publishedAt: null, results: null,
  };
  list.push(newPost);
  await db.savePosts(clientId, list);
  // Schedule recycled post via QStash
  if (isQStashEnabled() && newPost.scheduledFor && (!newPost.approvalStatus || newPost.approvalStatus === 'approved')) {
    const qr = await schedulePost(newPost.id, clientId, newPost.scheduledFor);
    if (qr.scheduled) {
      const idx = list.findIndex(p => p.id === newPost.id);
      list[idx].qstashMessageId = qr.messageId;
      await db.savePosts(clientId, list);
    }
  }
  logger.info('Recycled post', { clientId, originalPostId: body.postId, newPostId: newPost.id });
  return json({ success: true, post: newPost });
}
