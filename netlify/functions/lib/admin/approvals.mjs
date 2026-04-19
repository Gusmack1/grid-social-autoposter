// lib/admin/approvals.mjs — owns set-approval-mode / set-approval-status /
// generate-approval-link (extracted from admin.mjs Phase 2).
// Note: generate-approval-link is owned here (approval concern) but the JWT
// minting helper still lives in lib/invites.mjs — that file is NOT migrated
// in this PR (Phase 2b, deferred pending customer-flow work on Sorn).
import { db } from '../db/index.mjs';
import { generateApprovalLink } from '../invites.mjs';
import { json, badRequest, notFound } from '../http.mjs';

export async function handleSetApprovalMode(req, ctx) {
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

export async function handleSetApprovalStatus(req, ctx) {
  const { user, clientId } = ctx;
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

export async function handleGenerateApprovalLink(req, ctx) {
  const body = await req.json();
  if (!body.clientId) return badRequest('clientId required');
  const clients = await db.getClients();
  const client = clients.find(c => c.id === body.clientId);
  if (!client) return notFound('Client not found');
  const url = new URL(req.url);
  const approval = await generateApprovalLink(body.clientId, client.name, url.origin);
  return json({ success: true, ...approval });
}
