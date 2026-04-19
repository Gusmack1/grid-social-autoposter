// Admin API v4 — Modular, uses shared lib
import { db } from './lib/db/index.mjs';
import { verifyJWT } from './lib/crypto/jwt.mjs';
import { encrypt, decrypt } from './lib/crypto/encryption.mjs';
import { publishToAll, deleteFromPlatforms } from './lib/publisher.mjs';
import { uploadMedia } from './lib/r2.mjs';
import { migrateTokens } from './lib/migrate-tokens.mjs';
import { generateInviteLink, generateApprovalLink } from './lib/invites.mjs';
import { notifyClientPostsReady } from './lib/email.mjs';
import { json, cors, unauthorized, forbidden, badRequest, notFound, serverError } from './lib/http.mjs';
import { logger } from './lib/logger.mjs';
import { checkPlanLimit, countMonthlyPosts } from './lib/plan-limits.mjs';
// Phase-1 refactor: extracted handlers live under lib/admin/. Router dispatches
// here. Do not inline these action bodies again — keep them in their modules.
import { handleConfig } from './lib/admin/meta.mjs';
import { handlePlanUsage } from './lib/admin/billing.mjs';
import { handleExportAnalytics } from './lib/admin/analytics.mjs';
import { handleCheckTokenHealth } from './lib/admin/tokens.mjs';
import { handleGetTemplates, handleSaveTemplate, handleDeleteTemplate } from './lib/admin/templates.mjs';
import { handleMarkEvergreen, handleUnmarkEvergreen, handleGetEvergreen, handleRecyclePost } from './lib/admin/evergreen.mjs';

// Authenticate request — returns user object or null
async function authenticate(req) {
  const adminKey = process.env.ADMIN_KEY;
  const jwtSecret = process.env.JWT_SECRET || 'gridsocial-jwt-secret-2026';
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return null;
  if (token === adminKey) return { role: 'admin', email: 'admin', plan: 'enterprise', assignedClients: [] };
  const payload = await verifyJWT(token, jwtSecret);
  if (!payload) return null;
  const effectivePlan = payload.role === 'admin' ? 'enterprise' : (payload.plan || 'free');
  return { id: payload.sub, email: payload.email, name: payload.name, role: payload.role, plan: effectivePlan, assignedClients: payload.assignedClients || [] };
}

export default async (req) => {
  if (req.method === 'OPTIONS') return cors();

  const user = await authenticate(req);
  if (!user) return unauthorized();

  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  const clientId = url.searchParams.get('clientId');

  // Permission checks
  const writeActions = ['add-post', 'update-post', 'delete-post', 'publish-now', 'post-now', 'upload-image', 'delete-from-platform', 'bulk-import', 'save-template', 'delete-template', 'duplicate-post', 'bulk-delete', 'bulk-publish', 'bulk-reschedule', 'mark-evergreen', 'unmark-evergreen', 'recycle-post'];
  const publishActions = ['publish-now', 'post-now', 'bulk-publish', 'delete-from-platform'];
  const readOnlyActions = ['get-clients', 'get-posts', 'config', 'get-templates', 'check-token-health', 'export-analytics', 'plan-usage', 'check-api-key', 'get-evergreen', 'generate-share-link'];
  const selfServiceActions = ['save-api-key', 'remove-api-key', 'check-api-key'];

  // Viewer role = read-only
  if (user.role === 'viewer' && !readOnlyActions.includes(action)) {
    return forbidden('Viewer accounts have read-only access');
  }

  // Editor role = can compose/edit but not publish
  if (user.role === 'editor' && publishActions.includes(action)) {
    return forbidden('Editor accounts cannot publish — ask an admin to publish');
  }

  if (!['admin'].includes(user.role) && clientId && writeActions.includes(action)) {
    if (!user.assignedClients.includes(clientId)) return forbidden("You don't have permission for this client");
  }
  const adminActions = ['add-client', 'update-client', 'delete-client', 'migrate-tokens', 'generate-invite', 'check-token-health', 'generate-approval-link', 'set-approval-mode', 'set-approval-status', 'migrate-to-supabase', 'reorder-queue'];
  if (user.role !== 'admin' && adminActions.includes(action) && !selfServiceActions.includes(action)) return forbidden('Admin access required');

  // Shared context passed to lib/admin/* handlers (Phase-1 refactor).
  const ctx = { user, url, clientId, userId: user.id };

  try {
    // ── CLIENT MANAGEMENT ──
    if (action === 'get-clients') {
      const clients = await db.getClients();
      // Strip decrypted tokens from response (show only whether they exist)
      return json(clients.map(c => ({
        ...c,
        pageAccessToken: c.pageAccessToken ? '••••' + (decrypt(c.pageAccessToken) || '').slice(-6) : null,
        twitterApiKey: c.twitterApiKey ? '••••' : null,
        twitterApiSecret: c.twitterApiSecret ? '••••' : null,
        twitterAccessToken: c.twitterAccessToken ? '••••' : null,
        twitterAccessSecret: c.twitterAccessSecret ? '••••' : null,
        linkedinAccessToken: c.linkedinAccessToken ? '••••' : null,
        gbpAccessToken: c.gbpAccessToken ? '••••' : null,
        tiktokAccessToken: c.tiktokAccessToken ? '••••' : null,
        threadsAccessToken: c.threadsAccessToken ? '••••' : null,
        blueskyAppPassword: c.blueskyAppPassword ? '••••' : null,
        linkedinRefreshToken: c.linkedinRefreshToken ? '••••' : null,
        pinterestAccessToken: c.pinterestAccessToken ? '••••' : null,
        pinterestRefreshToken: c.pinterestRefreshToken ? '••••' : null,
        _hasTokens: !!(c.pageAccessToken || c.twitterAccessToken || c.linkedinAccessToken || c.gbpAccessToken || c.tiktokAccessToken || c.threadsAccessToken || c.blueskyAppPassword || c.pinterestAccessToken),
      })));
    }

    if (action === 'add-client' && req.method === 'POST') {
      const body = await req.json();
      if (!body.name) return badRequest('Client name required');
      const list = await db.getClients();

      // Plan limit check
      const userPlan = user.plan || 'free';
      const limitCheck = await checkPlanLimit(userPlan, 'add-client', { clientCount: list.length });
      if (!limitCheck.allowed) return json({ error: limitCheck.reason, usage: limitCheck.usage }, 403);

      // Encrypt tokens on save
      const nc = { id: 'client_' + Date.now(), ...body, createdAt: new Date().toISOString() };
      if (nc.pageAccessToken) nc.pageAccessToken = encrypt(nc.pageAccessToken);
      if (nc.twitterApiKey) nc.twitterApiKey = encrypt(nc.twitterApiKey);
      if (nc.twitterApiSecret) nc.twitterApiSecret = encrypt(nc.twitterApiSecret);
      if (nc.twitterAccessToken) nc.twitterAccessToken = encrypt(nc.twitterAccessToken);
      if (nc.twitterAccessSecret) nc.twitterAccessSecret = encrypt(nc.twitterAccessSecret);
      if (nc.linkedinAccessToken) nc.linkedinAccessToken = encrypt(nc.linkedinAccessToken);
      if (nc.gbpAccessToken) nc.gbpAccessToken = encrypt(nc.gbpAccessToken);
      if (nc.tiktokAccessToken) nc.tiktokAccessToken = encrypt(nc.tiktokAccessToken);
      if (nc.threadsAccessToken) nc.threadsAccessToken = encrypt(nc.threadsAccessToken);
      if (nc.blueskyAppPassword) nc.blueskyAppPassword = encrypt(nc.blueskyAppPassword);
      if (nc.linkedinRefreshToken) nc.linkedinRefreshToken = encrypt(nc.linkedinRefreshToken);
      if (nc.pinterestAccessToken) nc.pinterestAccessToken = encrypt(nc.pinterestAccessToken);
      if (nc.pinterestRefreshToken) nc.pinterestRefreshToken = encrypt(nc.pinterestRefreshToken);
      list.push(nc);
      await db.saveClients(list);
      return json({ success: true, client: nc });
    }

    if (action === 'update-client' && req.method === 'PUT') {
      const body = await req.json();
      const list = await db.getClients();
      const idx = list.findIndex(c => c.id === body.id);
      if (idx === -1) return notFound('Client not found');
      // Encrypt any new token values (skip masked values)
      const tokenFields = ['pageAccessToken', 'twitterApiKey', 'twitterApiSecret', 'twitterAccessToken', 'twitterAccessSecret', 'linkedinAccessToken', 'linkedinRefreshToken', 'gbpAccessToken', 'tiktokAccessToken', 'threadsAccessToken', 'blueskyAppPassword', 'pinterestAccessToken', 'pinterestRefreshToken'];
      for (const f of tokenFields) {
        if (body[f] && !body[f].startsWith('••••') && !body[f].startsWith('enc:')) {
          body[f] = encrypt(body[f]);
        } else if (body[f]?.startsWith('••••')) {
          delete body[f]; // Don't overwrite with masked value
        }
      }
      list[idx] = { ...list[idx], ...body, updatedAt: new Date().toISOString() };
      await db.saveClients(list);
      return json({ success: true, client: list[idx] });
    }

    if (action === 'delete-client' && req.method === 'DELETE') {
      const body = await req.json();
      let list = await db.getClients();
      list = list.filter(c => c.id !== body.id);
      await db.saveClients(list);
      return json({ success: true });
    }

    // ── POST MANAGEMENT ──
    if (!clientId && ['get-posts', 'add-post', 'update-post', 'delete-post', 'publish-now', 'post-now', 'delete-from-platform'].includes(action)) {
      return badRequest('clientId required');
    }

    if (action === 'get-posts') return json(await db.getPosts(clientId));

    if (action === 'add-post' && req.method === 'POST') {
      const body = await req.json();
      if (!body.caption) return badRequest('Caption required');

      // Plan limit check
      const clients = await db.getClients();
      const client = clients.find(c => c.id === clientId);
      const userPlan = user.plan || 'free';
      const allClientIds = clients.map(c => c.id);
      const monthlyPosts = await countMonthlyPosts(db.getPosts.bind(db), allClientIds);
      const limitCheck = await checkPlanLimit(userPlan, 'add-post', { monthlyPosts });
      if (!limitCheck.allowed) return json({ error: limitCheck.reason, usage: limitCheck.usage }, 403);

      const list = await db.getPosts(clientId);
      const approvalMode = client?.approvalMode || 'auto';
      let approvalStatus = 'approved'; // auto mode = no approval needed
      if (approvalMode === 'manual') approvalStatus = 'pending';
      if (approvalMode === 'passive') approvalStatus = 'pending';
      const np = {
        id: 'post_' + Date.now(), clientId, caption: body.caption,
        imageUrl: body.imageUrl || null, videoUrl: body.videoUrl || null,
        imageUrls: body.imageUrls || null,
        postType: body.postType || 'feed', platforms: body.platforms || ['facebook'],
        status: body.scheduledFor ? 'scheduled' : 'queued',
        scheduledFor: body.scheduledFor || null,
        approvalStatus,
        approvalMode,
        passiveDeadline: approvalMode === 'passive' ? new Date(Date.now() + (client?.passiveApprovalHours || 72) * 3600 * 1000).toISOString() : null,
        createdAt: new Date().toISOString(), publishedAt: null, results: null,
      };
      list.push(np);
      await db.savePosts(clientId, list);

      // Email client if post needs approval
      if (approvalStatus === 'pending' && client?.clientEmail) {
        const approvalUrl = `${url.origin}/approve`;
        await notifyClientPostsReady({
          clientEmail: client.clientEmail,
          clientName: client.name,
          approvalUrl,
          postCount: 1,
        }).catch(e => logger.warn('Approval email failed', { error: e.message }));
      }

      return json({ success: true, post: np });
    }

    if (action === 'update-post' && req.method === 'PUT') {
      const body = await req.json();
      const list = await db.getPosts(clientId);
      const idx = list.findIndex(p => p.id === body.postId);
      if (idx === -1) return notFound('Post not found');
      Object.assign(list[idx], body);
      await db.savePosts(clientId, list);
      return json({ success: true, post: list[idx] });
    }

    if (action === 'delete-post' && req.method === 'DELETE') {
      const body = await req.json();
      let list = await db.getPosts(clientId);
      list = list.filter(p => p.id !== body.postId);
      await db.savePosts(clientId, list);
      return json({ success: true });
    }

    if (action === 'post-now' && req.method === 'POST') {
      const body = await req.json();
      if (!body.caption) return badRequest('Caption required');
      const clients = await db.getClients();
      const client = clients.find(c => c.id === clientId);
      if (!client) return notFound('Client not found');

      // Plan limit check
      const userPlan = user.plan || 'free';
      const allClientIds = clients.map(c => c.id);
      const monthlyPosts = await countMonthlyPosts(db.getPosts.bind(db), allClientIds);
      const limitCheck = await checkPlanLimit(userPlan, 'add-post', { monthlyPosts });
      if (!limitCheck.allowed) return json({ error: limitCheck.reason, usage: limitCheck.usage }, 403);

      const np = {
        id: 'post_' + Date.now(), clientId, caption: body.caption,
        imageUrl: body.imageUrl || null, videoUrl: body.videoUrl || null,
        imageUrls: body.imageUrls || null,
        postType: body.postType || 'feed', platforms: body.platforms || ['facebook'],
        status: 'publishing', createdAt: new Date().toISOString(), publishedAt: null, results: null,
      };
      const results = await publishToAll(client, np);
      np.status = 'published';
      np.publishedAt = new Date().toISOString();
      np.results = results;
      const list = await db.getPosts(clientId);
      list.push(np);
      await db.savePosts(clientId, list);
      return json({ success: true, post: np, results });
    }

    if (action === 'publish-now' && req.method === 'POST') {
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

    if (action === 'delete-from-platform' && req.method === 'POST') {
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

    // ── BULK IMPORT (CSV) ──
    if (action === 'bulk-import' && req.method === 'POST') {
      const body = await req.json();
      if (!body.posts || !Array.isArray(body.posts)) return badRequest('posts array required');

      // Plan limit check
      const allClients = await db.getClients();
      const userPlan = user.plan || 'free';
      const allClientIds = allClients.map(c => c.id);
      const monthlyPosts = await countMonthlyPosts(db.getPosts.bind(db), allClientIds);
      const limitCheck = await checkPlanLimit(userPlan, 'bulk-import', { monthlyPosts, importCount: body.posts.length });
      if (!limitCheck.allowed) return json({ error: limitCheck.reason, usage: limitCheck.usage }, 403);

      const list = await db.getPosts(clientId);
      const clients = allClients;
      const client = clients.find(c => c.id === clientId);
      const approvalMode = client?.approvalMode || 'auto';
      let imported = 0;
      for (const p of body.posts) {
        if (!p.caption) continue;
        let approvalStatus = 'approved';
        if (approvalMode === 'manual' || approvalMode === 'passive') approvalStatus = 'pending';
        list.push({
          id: 'post_' + Date.now() + '_' + imported,
          clientId,
          caption: p.caption,
          imageUrl: p.imageUrl || null,
          videoUrl: null,
          imageUrls: null,
          postType: p.postType || 'feed',
          platforms: p.platforms || ['facebook'],
          status: p.scheduledFor ? 'scheduled' : 'queued',
          scheduledFor: p.scheduledFor || null,
          approvalStatus,
          approvalMode,
          createdAt: new Date().toISOString(),
          publishedAt: null,
          results: null,
        });
        imported++;
      }
      await db.savePosts(clientId, list);
      logger.info('Bulk import', { clientId, imported });
      return json({ success: true, imported });
    }

    // ── IMAGE UPLOAD ──
    if (action === 'upload-image' && req.method === 'POST') {
      let body;
      try { body = await req.json(); } catch { return json({ error: 'Request body too large or invalid JSON. Try a smaller image.' }, 413); }
      if (!body.filename || !body.content) return badRequest('filename and content required');
      const estSize = Math.round(body.content.length * 0.75 / 1024);
      if (body.content.length > 6 * 1024 * 1024) return json({ error: `Image too large (${estSize}KB). Max ~4MB after compression.` }, 413);
      try {
        const result = await uploadMedia(body.filename, body.content);
        return json({ success: true, url: result.url, path: result.path, size: `${estSize}KB`, provider: result.provider });
      } catch (e) { return serverError(e.message); }
    }

    // ── CONFIG ── (handler: lib/admin/meta.mjs)
    if (action === 'config') return handleConfig(req, ctx);

    // ── TOKEN MIGRATION (one-time admin action) ──
    if (action === 'migrate-tokens' && req.method === 'POST') {
      const result = await migrateTokens();
      return json({ success: true, ...result });
    }

    // ── GENERATE INVITE LINK ──
    if (action === 'generate-invite' && req.method === 'POST') {
      const body = await req.json();
      if (!body.clientId) return badRequest('clientId required');
      const clients = await db.getClients();
      const client = clients.find(c => c.id === body.clientId);
      if (!client) return notFound('Client not found');
      const url = new URL(req.url);
      const invite = await generateInviteLink(body.clientId, client.name, url.origin);
      return json({ success: true, ...invite });
    }

    // ── GENERATE APPROVAL LINK ──
    if (action === 'generate-approval-link' && req.method === 'POST') {
      const body = await req.json();
      if (!body.clientId) return badRequest('clientId required');
      const clients = await db.getClients();
      const client = clients.find(c => c.id === body.clientId);
      if (!client) return notFound('Client not found');
      const url = new URL(req.url);
      const approval = await generateApprovalLink(body.clientId, client.name, url.origin);
      return json({ success: true, ...approval });
    }

    // ── SET CLIENT APPROVAL MODE ──
    if (action === 'set-approval-mode' && req.method === 'PUT') {
      const body = await req.json();
      if (!body.clientId || !body.approvalMode) return badRequest('clientId and approvalMode required');
      const validModes = ['auto', 'manual', 'passive'];
      if (!validModes.includes(body.approvalMode)) return badRequest('approvalMode must be: auto, manual, or passive');
      const clients = await db.getClients();
      const idx = clients.findIndex(c => c.id === body.clientId);
      if (idx === -1) return notFound('Client not found');
      clients[idx].approvalMode = body.approvalMode;
      clients[idx].passiveApprovalHours = body.passiveApprovalHours || 72;
      await db.saveClients(clients);
      return json({ success: true, approvalMode: body.approvalMode });
    }

    // ── SET POST APPROVAL STATUS ──
    if (action === 'set-approval-status' && req.method === 'PUT') {
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

    // ── CHECK TOKEN HEALTH (manual trigger) ── (handler: lib/admin/tokens.mjs)
    if (action === 'check-token-health') return handleCheckTokenHealth(req, ctx);

    // ── TEMPLATES ── (handler: lib/admin/templates.mjs)
    if (action === 'get-templates') return handleGetTemplates(req, ctx);
    if (action === 'save-template' && req.method === 'POST') return handleSaveTemplate(req, ctx);
    if (action === 'delete-template' && req.method === 'DELETE') return handleDeleteTemplate(req, ctx);

    // ── QUEUE REORDER ──
    if (action === 'reorder-queue' && req.method === 'PUT') {
      const body = await req.json();
      if (!clientId || !Array.isArray(body.order)) return badRequest('clientId and order[] required');
      const list = await db.getPosts(clientId);
      // body.order = ['post_123', 'post_456', ...] — new order of queued post IDs
      const orderMap = {};
      body.order.forEach((id, i) => { orderMap[id] = i; });
      for (const post of list) {
        if (orderMap[post.id] !== undefined) {
          post.sortOrder = orderMap[post.id];
        }
      }
      await db.savePosts(clientId, list);
      logger.info('Queue reordered', { clientId, count: body.order.length });
      return json({ success: true });
    }

    // ── MIGRATE TO SUPABASE ──
    if (action === 'migrate-to-supabase' && req.method === 'POST') {
      if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
        return badRequest('SUPABASE_URL and SUPABASE_ANON_KEY env vars required');
      }
      const { migrateToSupabase } = await import('./lib/migrate-supabase.mjs');
      const result = await migrateToSupabase();
      return json({ success: true, ...result });
    }

    // ── ANALYTICS PDF EXPORT ── (handler: lib/admin/analytics.mjs)
    if (action === 'export-analytics') return handleExportAnalytics(req, ctx);

    // ── DUPLICATE POST ──
    if (action === 'duplicate-post' && req.method === 'POST') {
      const body = await req.json();
      if (!body.postId) return badRequest('postId required');
      const list = await db.getPosts(clientId);
      const original = list.find(p => p.id === body.postId);
      if (!original) return notFound('Post not found');
      const dup = {
        id: 'post_' + Date.now(),
        clientId,
        caption: original.caption,
        imageUrl: original.imageUrl || null,
        videoUrl: original.videoUrl || null,
        imageUrls: original.imageUrls || null,
        postType: original.postType || 'feed',
        platforms: [...(original.platforms || ['facebook'])],
        status: 'queued',
        scheduledFor: null,
        approvalStatus: 'approved',
        approvalMode: 'auto',
        createdAt: new Date().toISOString(),
        publishedAt: null,
        results: null,
      };
      list.push(dup);
      await db.savePosts(clientId, list);
      logger.info('Post duplicated', { originalId: body.postId, newId: dup.id, clientId });
      return json({ success: true, post: dup });
    }

    // ── BULK DELETE ──
    if (action === 'bulk-delete' && req.method === 'POST') {
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

    // ── BULK PUBLISH ──
    if (action === 'bulk-publish' && req.method === 'POST') {
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

    // ── BULK RESCHEDULE ──
    if (action === 'bulk-reschedule' && req.method === 'POST') {
      const body = await req.json();
      if (!Array.isArray(body.postIds) || !body.scheduledFor) return badRequest('postIds[] and scheduledFor required');
      const list = await db.getPosts(clientId);
      let updated = 0;
      for (const pid of body.postIds) {
        const idx = list.findIndex(p => p.id === pid);
        if (idx === -1) continue;
        if (list[idx].status === 'published') continue;
        list[idx].scheduledFor = body.scheduledFor;
        list[idx].status = 'scheduled';
        updated++;
      }
      await db.savePosts(clientId, list);
      logger.info('Bulk reschedule', { clientId, updated, scheduledFor: body.scheduledFor });
      return json({ success: true, updated });
    }

    // ── PLAN USAGE ── (handler: lib/admin/billing.mjs)
    if (action === 'plan-usage') return handlePlanUsage(req, ctx);

    // ── SAVE USER API KEY (Anthropic) ──
    if (action === 'save-api-key' && req.method === 'POST') {
      const body = await req.json();
      const { apiKey } = body;
      if (!apiKey || !apiKey.startsWith('sk-ant-')) {
        return badRequest('Invalid Anthropic API key. It should start with sk-ant-');
      }
      const emailKey = user.email.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const userData = await db.getUser(emailKey) || { email: user.email };
      userData.anthropicApiKey = encrypt(apiKey);
      userData.apiKeySetAt = new Date().toISOString();
      await db.saveUser(emailKey, userData);
      logger.info('User saved Anthropic API key', { email: user.email });
      return json({ success: true, hasKey: true });
    }

    // ── REMOVE USER API KEY ──
    if (action === 'remove-api-key' && req.method === 'DELETE') {
      const emailKey = user.email.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const userData = await db.getUser(emailKey);
      if (userData) {
        delete userData.anthropicApiKey;
        delete userData.apiKeySetAt;
        await db.saveUser(emailKey, userData);
      }
      return json({ success: true, hasKey: false });
    }

    // ── CHECK IF USER HAS API KEY ──
    if (action === 'check-api-key') {
      const emailKey = user.email.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const userData = await db.getUser(emailKey);
      return json({
        hasKey: !!(userData?.anthropicApiKey),
        setAt: userData?.apiKeySetAt || null,
      });
    }


    // ── EVERGREEN ── (handler: lib/admin/evergreen.mjs)
    if (action === 'mark-evergreen' && req.method === 'POST') return handleMarkEvergreen(req, ctx);
    if (action === 'unmark-evergreen' && req.method === 'POST') return handleUnmarkEvergreen(req, ctx);
    if (action === 'get-evergreen') return handleGetEvergreen(req, ctx);
    if (action === 'recycle-post' && req.method === 'POST') return handleRecyclePost(req, ctx);

    // ── GENERATE SHARE LINK ──
    if (action === 'generate-share-link' && req.method === 'POST') {
      const { signJWT } = await import('./lib/crypto/jwt.mjs');
      const body = await req.json();
      if (!body.clientId) return badRequest('clientId required');
      const clients = await db.getClients();
      const client = clients.find(c => c.id === body.clientId);
      if (!client) return notFound('Client not found');
      const jwtSecret = process.env.JWT_SECRET || 'gridsocial-jwt-secret-2026';
      const payload = {
        clientId: client.id,
        clientName: client.name,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (7 * 24 * 3600), // 7 days
      };
      const token = await signJWT(payload, jwtSecret);
      const url = new URL(req.url);
      const shareUrl = `${url.origin}/api/client-analytics?token=${token}`;
      logger.info('Generated share link', { clientId: client.id, expiresIn: '7 days' });
      return json({ success: true, shareUrl, token, expiresAt: new Date(payload.exp * 1000).toISOString() });
    }

    return badRequest('Unknown action: ' + action);
  } catch (err) {
    logger.error('Admin API error', { action, error: err.message, stack: err.stack });
    return serverError(err.message);
  }
};
