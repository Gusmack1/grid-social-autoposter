// Cloudflare R2 media upload — falls back to GitHub if R2 not configured
import { logger } from './logger.mjs';

export function isR2Enabled() {
  return !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY && process.env.R2_SECRET_KEY && process.env.R2_BUCKET);
}

export async function uploadMedia(filename, contentBase64) {
  if (isR2Enabled()) {
    return uploadToR2(filename, contentBase64);
  }
  return uploadToGitHub(filename, contentBase64);
}

async function uploadToR2(filename, contentBase64) {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY, R2_BUCKET } = process.env;
  const path = `media/${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '')}`;

  try {
    // S3-compatible PUT to R2
    const url = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${path}`;
    const body = Buffer.from(contentBase64, 'base64');

    // Simplified — for production, use AWS SDK v3 or S3 client with R2 endpoint
    // For now, fall back to GitHub if R2 signing isn't set up
    logger.info('R2 upload placeholder — falling back to GitHub', { path });
    return uploadToGitHub(filename, contentBase64);
  } catch (err) {
    logger.error('R2 upload failed, falling back to GitHub', { error: err.message });
    return uploadToGitHub(filename, contentBase64);
  }
}

async function uploadToGitHub(filename, contentBase64) {
  const ghToken = process.env.GITHUB_TOKEN;
  if (!ghToken) throw new Error('GITHUB_TOKEN not set');

  const path = `public/photos/${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '')}`;
  const res = await fetch(`https://api.github.com/repos/Gusmack1/grid-social-autoposter/contents/${path}`, {
    method: 'PUT',
    headers: { Authorization: `token ${ghToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `Upload ${filename}`, content: contentBase64 }),
  });
  const data = await res.json();
  if (data.content?.download_url) {
    return { url: data.content.download_url, path, provider: 'github' };
  }
  throw new Error(data.message || 'GitHub upload failed');
}
