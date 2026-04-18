// image-check.mjs — pre-publish HEAD-request gate for media URLs (task #49).
//
// Runs AFTER the voice gate and BEFORE any Meta Graph dispatch in
// lib/publisher.mjs. Fail-closed: if the HEAD check returns non-2xx, a zero
// content-length, a non-allowlisted content-type, or times out, the publish
// is aborted and the post is marked status='image_rejected'.
//
// Pure function, no side effects — the caller owns DB writes.

const IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);
const VIDEO_MIMES = new Set(['video/mp4']);

const HEAD_TIMEOUT_MS = 3000;

/**
 * HEAD-check a media URL before publishing.
 *
 * @param {string} url        — post.imageUrl or post.videoUrl
 * @param {string} postType   — 'feed' | 'story' | 'reel' | 'carousel' | 'text'
 * @returns {Promise<{pass: boolean, reason: string, contentType: string, contentLength: number}>}
 */
export async function checkImage(url, postType) {
  const type = (postType || 'feed').toLowerCase();

  // Text-only posts skip the media check entirely.
  if (type === 'text') {
    return { pass: true, reason: 'skipped-text-post', contentType: '', contentLength: 0 };
  }

  if (!url || typeof url !== 'string' || url.trim() === '') {
    // Only image feed/story/carousel/reel paths reach this gate; empty url is
    // only acceptable if we explicitly said postType='text'.
    return { pass: false, reason: 'missing-url', contentType: '', contentLength: 0 };
  }

  const allowedMimes = type === 'reel' ? VIDEO_MIMES : IMAGE_MIMES;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEAD_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
    });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      return { pass: false, reason: 'head-timeout-3s', contentType: '', contentLength: 0 };
    }
    return {
      pass: false,
      reason: `head-fetch-error:${err && err.message ? err.message : 'unknown'}`,
      contentType: '',
      contentLength: 0,
    };
  } finally {
    clearTimeout(timer);
  }

  if (res.status >= 400) {
    return {
      pass: false,
      reason: `http-${res.status}`,
      contentType: res.headers.get('content-type') || '',
      contentLength: Number(res.headers.get('content-length') || 0),
    };
  }
  if (res.status < 200 || res.status >= 300) {
    return {
      pass: false,
      reason: `non-2xx-${res.status}`,
      contentType: res.headers.get('content-type') || '',
      contentLength: Number(res.headers.get('content-length') || 0),
    };
  }

  const rawContentType = res.headers.get('content-type') || '';
  // Strip parameters (e.g. "image/jpeg; charset=binary") before mime check.
  const contentType = rawContentType.split(';')[0].trim().toLowerCase();
  const contentLengthHeader = res.headers.get('content-length');
  const contentLength = contentLengthHeader === null ? -1 : Number(contentLengthHeader);

  if (contentLengthHeader !== null && contentLengthHeader === '0') {
    return { pass: false, reason: 'content-length-zero', contentType, contentLength: 0 };
  }

  if (!allowedMimes.has(contentType)) {
    return {
      pass: false,
      reason: `unsupported-mime:${contentType || 'none'}`,
      contentType,
      contentLength: contentLength === -1 ? 0 : contentLength,
    };
  }

  return {
    pass: true,
    reason: 'ok',
    contentType,
    contentLength: contentLength === -1 ? 0 : contentLength,
  };
}
