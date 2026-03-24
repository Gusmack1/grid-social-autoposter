// Retry with exponential backoff — 3 attempts, 1s/2s/4s delays
import { logger } from './logger.mjs';

export async function withRetry(fn, { maxAttempts = 3, baseDelay = 1000, label = 'operation' } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        logger.warn(`${label} attempt ${attempt} failed, retrying in ${delay}ms`, { error: err.message });
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  logger.error(`${label} failed after ${maxAttempts} attempts`, { error: lastError.message });
  throw lastError;
}
