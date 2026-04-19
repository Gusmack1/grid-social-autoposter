// lib/admin/evergreen.mjs — owns mark-evergreen / unmark-evergreen /
// get-evergreen / recycle-post (extracted from admin.mjs).
import { db } from '../db/index.mjs';
import { logger } from '../logger.mjs';
import { json, badRequest, notFound } from '../http.mjs';

export async function handleMarkEvergreen(req, ctx) {
  const { clientId } = ctx;
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

export async function handleUnmarkEvergreen(req, ctx) {
  const { clientId } = ctx;
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

// eslint-disable-next-line no-unused-vars
export async function handleGetEvergreen(req, ctx) {
  const { clientId } = ctx;
  const list = await db.getPosts(clientId);
  const evergreen = list.filter(p => p.evergreen === true);
  return json(evergreen);
}

export async function handleRecyclePost(req, ctx) {
  const { clientId } = ctx;
  const body = await req.json();
  if (!body.postId || !body.scheduledFor) return badRequest('postId and scheduledFor required');
  const list = await db.getPosts(clientId);
  const original = list.find(p => p.id === body.postId);
  if (!original) return notFound('Post not found');
  const newPost = {
    id: 'post_' + Date.now(),
    clientId,
    caption: original.caption,
    imageUrl: original.imageUrl || null,
    videoUrl: original.videoUrl || null,
    imageUrls: original.imageUrls || null,
    postType: original.postType || 'feed',
    platforms: original.platforms || [],
    status: 'scheduled',
    scheduledFor: body.scheduledFor,
    approvalStatus: original.approvalStatus,
    approvalMode: original.approvalMode,
    evergreen: original.evergreen || false,
    createdAt: new Date().toISOString(),
    publishedAt: null,
    results: null,
  };
  list.push(newPost);
  await db.savePosts(clientId, list);
  logger.info('Recycled post', { clientId, originalPostId: body.postId, newPostId: newPost.id });
  return json({ success: true, post: newPost });
}
