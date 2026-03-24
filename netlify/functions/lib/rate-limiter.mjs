// IP-based rate limiter — 10 attempts per 15 minutes
import { db } from './db/index.mjs';

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export async function checkRateLimit(ip) {
  const key = `rl_${ip.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const data = await db.getRateLimit(key);
  const now = Date.now();

  if (!data || now - data.windowStart > WINDOW_MS) {
    // New window
    await db.saveRateLimit(key, { windowStart: now, attempts: 1 });
    return { allowed: true, remaining: MAX_ATTEMPTS - 1 };
  }

  if (data.attempts >= MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((data.windowStart + WINDOW_MS - now) / 1000);
    return { allowed: false, remaining: 0, retryAfter };
  }

  data.attempts++;
  await db.saveRateLimit(key, data);
  return { allowed: true, remaining: MAX_ATTEMPTS - data.attempts };
}
