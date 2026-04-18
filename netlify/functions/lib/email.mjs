// Email notifications — sends approval and status emails via Resend
// Requires RESEND_API_KEY env var
// Gracefully no-ops if not configured (notifications are optional)
import { logger } from './logger.mjs';

const RESEND_URL = 'https://api.resend.com/emails';
const FROM_EMAIL = 'Grid Social <notifications@gridsocial.co.uk>';

async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logger.info('Email skipped (RESEND_API_KEY not set)', { to, subject });
    return { sent: false, reason: 'not_configured' };
  }

  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
      }),
    });

    const data = await res.json();
    if (res.ok) {
      logger.info('Email sent', { to, subject, id: data.id });
      return { sent: true, id: data.id };
    } else {
      logger.error('Email send failed', { to, subject, error: data });
      return { sent: false, error: data.message || 'Unknown error' };
    }
  } catch (e) {
    logger.error('Email send error', { to, subject, error: e.message });
    return { sent: false, error: e.message };
  }
}

// ── Approval notification templates ──

export async function notifyClientPostsReady({ clientEmail, clientName, approvalUrl, postCount }) {
  return sendEmail({
    to: clientEmail,
    subject: `${postCount} new post${postCount > 1 ? 's' : ''} ready for your review — Grid Social`,
    html: emailTemplate({
      heading: `Hi ${clientName}!`,
      body: `Your agency has prepared <strong>${postCount} new post${postCount > 1 ? 's' : ''}</strong> for your social media accounts. Please review and approve them so they can be published on schedule.`,
      ctaText: 'Review Posts',
      ctaUrl: approvalUrl,
      footer: `If you don't respond within 72 hours, posts in passive-approval mode will be published automatically. If you have any questions, contact your account manager.`,
    }),
  });
}

export async function notifyAdminPostApproved({ adminEmail, clientName, postCaption, postId }) {
  return sendEmail({
    to: adminEmail,
    subject: `✓ ${clientName} approved a post — Grid Social`,
    html: emailTemplate({
      heading: 'Post Approved',
      body: `<strong>${clientName}</strong> approved a post:<br><br><em>"${truncate(postCaption, 150)}"</em>`,
      footer: 'The post will be published at its scheduled time.',
    }),
  });
}

export async function notifyAdminPostRejected({ adminEmail, clientName, postCaption, clientComment, postId }) {
  return sendEmail({
    to: adminEmail,
    subject: `✎ ${clientName} requested changes — Grid Social`,
    html: emailTemplate({
      heading: 'Changes Requested',
      body: `<strong>${clientName}</strong> requested changes on a post:<br><br>
        <em>"${truncate(postCaption, 150)}"</em><br><br>
        ${clientComment ? `<strong>Their feedback:</strong><br>"${escapeHtml(clientComment)}"` : 'No specific feedback provided.'}`,
      footer: 'Please update the post and resubmit for approval, or contact the client directly.',
    }),
  });
}

export async function notifyAdminPublishFailure({ adminEmail, clientName, postId, failures }) {
  // failures: array of { platform, error }
  const rows = (failures || []).map(f =>
    `<tr><td style="padding:6px 10px;color:#f87171;font-weight:600;">${escapeHtml(f.platform)}</td><td style="padding:6px 10px;color:#d1d5db;">${escapeHtml(f.error || 'Unknown error')}</td></tr>`
  ).join('');
  return sendEmail({
    to: adminEmail,
    subject: `[Grid Social] Publish failure: ${clientName} · post ${postId}`,
    html: emailTemplate({
      heading: 'Publish failure',
      body: `One or more platforms failed to publish for <strong>${escapeHtml(clientName)}</strong> (post <code>${escapeHtml(String(postId))}</code>):<br><br>
        <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:#0f1117;border:1px solid #1e2028;border-radius:8px;">
          <thead><tr><th style="text-align:left;padding:8px 10px;color:#9ca3af;font-size:12px;">Platform</th><th style="text-align:left;padding:8px 10px;color:#9ca3af;font-size:12px;">Error</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`,
      footer: 'Check the Netlify function logs for the full stack trace. The post has been marked published; failed platforms will not retry automatically.',
    }),
  });
}

export async function notifyClientTokenExpiring({ clientEmail, clientName, platform, daysUntilExpiry }) {
  return sendEmail({
    to: clientEmail,
    subject: `⚠️ Your ${platform} connection expires soon — Grid Social`,
    html: emailTemplate({
      heading: `Hi ${clientName}`,
      body: `Your <strong>${platform}</strong> connection expires in <strong>${daysUntilExpiry} days</strong>. Please reconnect to ensure your scheduled posts continue publishing.`,
      ctaText: 'Reconnect Now',
      ctaUrl: 'https://grid-social-autoposter.netlify.app/connect',
      footer: 'If you need a new connection link, please contact your account manager.',
    }),
  });
}

// ── Email HTML template ──

function emailTemplate({ heading, body, ctaText, ctaUrl, footer }) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0c10;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0c10;padding:40px 20px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#111318;border-radius:12px;border:1px solid #1e2028;">
  <tr><td style="padding:32px 28px 0;">
    <div style="font-size:14px;font-weight:700;color:#3b82f6;margin-bottom:20px;letter-spacing:-0.5px;">Grid Social</div>
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#ffffff;">${heading}</h1>
    <div style="font-size:14px;line-height:1.7;color:#d1d5db;margin-bottom:24px;">${body}</div>
    ${ctaText && ctaUrl ? `
    <a href="${ctaUrl}" style="display:inline-block;padding:14px 32px;background:#3b82f6;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;margin-bottom:24px;">${ctaText}</a>
    ` : ''}
  </td></tr>
  ${footer ? `
  <tr><td style="padding:0 28px 28px;">
    <div style="border-top:1px solid #1e2028;padding-top:16px;margin-top:8px;">
      <div style="font-size:12px;color:#6b7280;line-height:1.5;">${footer}</div>
    </div>
  </td></tr>` : ''}
</table>
</td></tr>
</table>
</body></html>`;
}

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.substring(0, len) + '...' : str;
}

function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
