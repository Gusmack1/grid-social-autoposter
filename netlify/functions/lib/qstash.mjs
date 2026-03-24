// QStash per-post scheduling — falls back to cron if QSTASH_TOKEN not set
import { logger } from './logger.mjs';

const QSTASH_URL = 'https://qstash.upstash.io/v2/publish';

export function isQStashEnabled() {
  return !!process.env.QSTASH_TOKEN;
}

// Schedule a post to be published at a specific time via QStash webhook
export async function schedulePost(postId, clientId, publishAt) {
  if (!isQStashEnabled()) {
    logger.info('QStash not configured, falling back to cron', { postId });
    return { scheduled: false, fallback: 'cron' };
  }

  const webhookUrl = `${process.env.URL || 'https://grid-social-autoposter.netlify.app'}/.netlify/functions/publish-webhook`;
  const delay = Math.max(0, Math.floor((new Date(publishAt).getTime() - Date.now()) / 1000));

  try {
    const res = await fetch(QSTASH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.QSTASH_TOKEN}`,
        'Content-Type': 'application/json',
        'Upstash-Destination': webhookUrl,
        'Upstash-Delay': `${delay}s`,
        'Upstash-Retries': '3',
      },
      body: JSON.stringify({ postId, clientId }),
    });

    const data = await res.json();
    if (data.messageId) {
      logger.info('Post scheduled via QStash', { postId, clientId, delay, messageId: data.messageId });
      return { scheduled: true, messageId: data.messageId };
    }
    logger.warn('QStash scheduling failed', { postId, response: data });
    return { scheduled: false, fallback: 'cron', error: data };
  } catch (err) {
    logger.error('QStash error', { postId, error: err.message });
    return { scheduled: false, fallback: 'cron', error: err.message };
  }
}
