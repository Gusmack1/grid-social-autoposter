// lib/admin/media.mjs — owns upload-image (extracted from admin.mjs Phase 3).
// Body-too-large branch must return 413 with the "Try a smaller image" message;
// frontend (AnalyticsPdfExport.jsx / post editor) keys off status 413, not body.
// Size estimate math: base64 → bytes ≈ length * 0.75. Keep verbatim.
import { uploadMedia } from '../r2.mjs';
import { json, badRequest, serverError } from '../http.mjs';

// eslint-disable-next-line no-unused-vars
export async function handleUploadImage(req, ctx) {
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
