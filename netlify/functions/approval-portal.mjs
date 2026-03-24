// Approval Portal — client-facing page for reviewing and approving/rejecting posts
// GET /approve?token=TOKEN → shows pending posts for approval
// POST /approve?token=TOKEN&action=approve&postId=ID → approve a post
// POST /approve?token=TOKEN&action=reject&postId=ID → reject a post (with comment)
// POST /approve?token=TOKEN&action=bulk-approve → approve all pending
import { db } from './lib/db/index.mjs';
import { verifyApprovalToken } from './lib/invites.mjs';
import { json, cors } from './lib/http.mjs';
import { logger } from './lib/logger.mjs';

export default async (req) => {
  if (req.method === 'OPTIONS') return cors();

  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  const action = url.searchParams.get('action');
  const postId = url.searchParams.get('postId');

  if (!token) {
    return renderPage('Approval Portal',
      `<h2>Post Approval</h2>
       <p>You need a valid approval link to review posts. Please check your email or contact your account manager.</p>`
    );
  }

  // Verify magic link token
  const payload = await verifyApprovalToken(token);
  if (!payload) {
    return renderPage('Link Expired',
      `<h2>Link Expired or Invalid</h2>
       <p>This approval link has expired or is no longer valid. Please contact your account manager for a new link.</p>`
    );
  }

  const { clientId, clientName } = payload;
  const posts = await db.getPosts(clientId);
  const client = await db.getClient(clientId);

  // ── HANDLE ACTIONS (POST requests) ──
  if (req.method === 'POST') {
    if (action === 'approve' && postId) {
      const idx = posts.findIndex(p => p.id === postId);
      if (idx !== -1 && posts[idx].approvalStatus === 'pending') {
        posts[idx].approvalStatus = 'approved';
        posts[idx].approvedAt = new Date().toISOString();
        posts[idx].approvedBy = 'client';
        await db.savePosts(clientId, posts);
        logger.info('Post approved by client', { clientId, postId });
      }
      return Response.redirect(`${url.origin}/approve?token=${token}&msg=approved`, 302);
    }

    if (action === 'reject' && postId) {
      let body = {};
      try { body = await req.json(); } catch {
        // Form submission fallback
        try {
          const text = await req.text();
          const params = new URLSearchParams(text);
          body = { comment: params.get('comment') || '' };
        } catch {}
      }
      const idx = posts.findIndex(p => p.id === postId);
      if (idx !== -1 && posts[idx].approvalStatus === 'pending') {
        posts[idx].approvalStatus = 'changes_requested';
        posts[idx].rejectedAt = new Date().toISOString();
        posts[idx].rejectedBy = 'client';
        posts[idx].clientComment = body.comment || '';
        await db.savePosts(clientId, posts);
        logger.info('Post rejected by client', { clientId, postId, comment: body.comment });
      }
      return Response.redirect(`${url.origin}/approve?token=${token}&msg=feedback`, 302);
    }

    if (action === 'bulk-approve') {
      let count = 0;
      for (let i = 0; i < posts.length; i++) {
        if (posts[i].approvalStatus === 'pending') {
          posts[i].approvalStatus = 'approved';
          posts[i].approvedAt = new Date().toISOString();
          posts[i].approvedBy = 'client';
          count++;
        }
      }
      await db.savePosts(clientId, posts);
      logger.info('Bulk approval by client', { clientId, count });
      return Response.redirect(`${url.origin}/approve?token=${token}&msg=bulk-${count}`, 302);
    }

    return json({ error: 'Unknown action' }, 400);
  }

  // ── RENDER APPROVAL PAGE (GET) ──
  const pendingPosts = posts.filter(p => p.approvalStatus === 'pending');
  const approvedPosts = posts.filter(p => p.approvalStatus === 'approved' && !p.publishedAt);
  const rejectedPosts = posts.filter(p => p.approvalStatus === 'changes_requested');
  const msg = url.searchParams.get('msg');

  let toast = '';
  if (msg === 'approved') toast = '<div class="toast toast-ok">✓ Post approved!</div>';
  else if (msg === 'feedback') toast = '<div class="toast toast-warn">Feedback sent to your agency</div>';
  else if (msg?.startsWith('bulk-')) toast = `<div class="toast toast-ok">✓ ${msg.split('-')[1]} posts approved!</div>`;

  const postCards = pendingPosts.map(p => {
    const platforms = (p.platforms || []).map(pl => `<span class="tag">${pl}</span>`).join('');
    const date = p.scheduledFor ? new Date(p.scheduledFor).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Not scheduled';
    const img = p.imageUrl ? `<img src="${p.imageUrl}" class="post-img" alt="" loading="lazy"/>` : '';
    const postTypeLabel = p.postType === 'story' ? '📱 Story' : p.postType === 'reel' ? '🎬 Reel' : '📄 Feed';

    return `<div class="post-card" id="post-${p.id}">
      ${img}
      <div class="post-body">
        <div class="post-meta">
          <span class="post-type">${postTypeLabel}</span>
          ${platforms}
          <span class="post-date">📅 ${date}</span>
        </div>
        <div class="post-caption">${escapeHtml(p.caption)}</div>
        <div class="post-actions">
          <button class="btn-approve" onclick="approvePost('${p.id}')">✓ Approve</button>
          <button class="btn-feedback" onclick="showFeedback('${p.id}')">✎ Request Changes</button>
        </div>
        <div class="feedback-form" id="feedback-${p.id}" style="display:none;">
          <textarea id="comment-${p.id}" placeholder="What would you like changed?" rows="3"></textarea>
          <div class="feedback-actions">
            <button class="btn-send" onclick="rejectPost('${p.id}')">Send Feedback</button>
            <button class="btn-cancel" onclick="hideFeedback('${p.id}')">Cancel</button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');

  const summary = [];
  if (approvedPosts.length) summary.push(`<span class="stat-ok">${approvedPosts.length} approved</span>`);
  if (rejectedPosts.length) summary.push(`<span class="stat-warn">${rejectedPosts.length} awaiting changes</span>`);

  const bulkBtn = pendingPosts.length > 1
    ? `<button class="btn-bulk" onclick="bulkApprove()">Approve All ${pendingPosts.length} Posts</button>`
    : '';

  const noPostsMsg = pendingPosts.length === 0
    ? `<div class="empty-state">
         <p>🎉 No posts waiting for approval!</p>
         <p class="dim">All caught up. Your agency will send new posts for review soon.</p>
       </div>`
    : '';

  return renderPage(
    `${clientName} — Post Approval`,
    `${toast}
     <div class="header">
       <h2>Hi ${escapeHtml(clientName)}!</h2>
       <p class="dim">Review the posts your agency has prepared. Approve them to go live, or send feedback for changes.</p>
       ${summary.length ? `<p class="summary">${summary.join(' · ')}</p>` : ''}
     </div>
     ${bulkBtn}
     ${noPostsMsg}
     <div class="post-list">${postCards}</div>
     <div class="footer">
       <p>Posts you approve will be published at their scheduled time. If you don't respond within 72 hours, posts in passive-approval mode will be published automatically.</p>
     </div>
     <script>
     const TOKEN = '${token}';
     function approvePost(id) {
       const card = document.getElementById('post-' + id);
       card.style.opacity = '0.5';
       const form = document.createElement('form');
       form.method = 'POST';
       form.action = '/approve?token=' + TOKEN + '&action=approve&postId=' + id;
       document.body.appendChild(form);
       form.submit();
     }
     function showFeedback(id) {
       document.getElementById('feedback-' + id).style.display = 'block';
       document.getElementById('comment-' + id).focus();
     }
     function hideFeedback(id) {
       document.getElementById('feedback-' + id).style.display = 'none';
     }
     function rejectPost(id) {
       const comment = document.getElementById('comment-' + id).value;
       const form = document.createElement('form');
       form.method = 'POST';
       form.action = '/approve?token=' + TOKEN + '&action=reject&postId=' + id;
       const input = document.createElement('input');
       input.type = 'hidden'; input.name = 'comment'; input.value = comment;
       form.appendChild(input);
       document.body.appendChild(form);
       form.submit();
     }
     function bulkApprove() {
       if (!confirm('Approve all ${pendingPosts.length} pending posts?')) return;
       const form = document.createElement('form');
       form.method = 'POST';
       form.action = '/approve?token=' + TOKEN + '&action=bulk-approve';
       document.body.appendChild(form);
       form.submit();
     }
     </script>`
  );
};

function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderPage(title, body) {
  return new Response(`<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — Grid Social</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',system-ui,sans-serif;background:#0a0c10;color:#e5e7eb;min-height:100vh;padding:20px}
.wrap{max-width:640px;margin:0 auto}
h2{font-size:24px;font-weight:700;color:#fff;margin-bottom:4px}
p{font-size:14px;line-height:1.6;margin-bottom:6px}
.dim{color:#6b7280}
.summary{font-size:13px;margin-top:8px}
.stat-ok{color:#4ade80;font-weight:600}
.stat-warn{color:#f59e0b;font-weight:600}

/* Toast */
.toast{padding:12px 20px;border-radius:10px;margin-bottom:20px;font-size:14px;font-weight:600;animation:fadeIn .3s ease}
.toast-ok{background:#0f1a14;border:1px solid #166534;color:#4ade80}
.toast-warn{background:#1a1508;border:1px solid #854d0e;color:#f59e0b}

/* Post cards */
.post-list{display:flex;flex-direction:column;gap:16px;margin-top:20px}
.post-card{background:#111318;border:1px solid #1e2028;border-radius:14px;overflow:hidden;transition:all .2s}
.post-card:hover{border-color:#2d3140}
.post-img{width:100%;max-height:300px;object-fit:cover;display:block}
.post-body{padding:16px}
.post-meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:10px}
.post-type{font-size:12px;font-weight:600;color:#a5b4fc}
.tag{font-size:11px;padding:2px 8px;background:#1a1d24;border-radius:4px;color:#6b7280;text-transform:capitalize}
.post-date{font-size:12px;color:#4b5563;margin-left:auto}
.post-caption{font-size:14px;line-height:1.6;color:#d1d5db;white-space:pre-wrap;margin-bottom:14px;max-height:200px;overflow-y:auto}
.post-actions{display:flex;gap:8px}
.btn-approve{padding:10px 24px;background:#166534;color:#4ade80;border:1px solid #22c55e30;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:all .15s;flex:1}
.btn-approve:hover{background:#15803d}
.btn-feedback{padding:10px 24px;background:#1e2028;color:#9ca3af;border:1px solid #2d3140;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:all .15s;flex:1}
.btn-feedback:hover{background:#262a36;color:#fff}

/* Feedback form */
.feedback-form{margin-top:12px;animation:fadeIn .2s ease}
.feedback-form textarea{width:100%;background:#0a0c10;color:#e5e7eb;border:1px solid #2d3140;border-radius:8px;padding:10px;font-family:inherit;font-size:13px;resize:vertical}
.feedback-form textarea:focus{outline:none;border-color:#3b82f6}
.feedback-actions{display:flex;gap:8px;margin-top:8px}
.btn-send{padding:8px 20px;background:#f59e0b;color:#000;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer}
.btn-send:hover{background:#d97706}
.btn-cancel{padding:8px 20px;background:transparent;color:#6b7280;border:1px solid #2d3140;border-radius:8px;font-size:13px;cursor:pointer}

/* Bulk approve */
.btn-bulk{width:100%;padding:14px;background:#166534;color:#4ade80;border:1px solid #22c55e30;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;margin-top:16px;transition:all .15s}
.btn-bulk:hover{background:#15803d}

/* Empty state */
.empty-state{text-align:center;padding:40px 20px;background:#111318;border-radius:14px;border:1px solid #1e2028;margin-top:20px}
.empty-state p:first-child{font-size:18px;color:#fff;font-weight:600}

/* Footer */
.footer{margin-top:32px;padding-top:20px;border-top:1px solid #1e2028}
.footer p{font-size:12px;color:#4b5563}

/* Logo */
.logo{font-size:14px;font-weight:700;color:#3b82f6;margin-bottom:24px;letter-spacing:-0.5px}

@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
@media(max-width:480px){
  .post-actions{flex-direction:column}
  .post-date{margin-left:0;margin-top:4px;width:100%}
}
</style>
</head><body>
<div class="wrap">
  <div class="logo">Grid Social</div>
  ${body}
</div>
</body></html>`, { status: 200, headers: { 'Content-Type': 'text/html' } });
}

export const config = { path: '/approve' };
