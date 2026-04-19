// lib/admin/templates.mjs — owns get-templates / save-template / delete-template
// (extracted from admin.mjs). Preserves the `db.deleteTemplate.length === 2`
// arity check verbatim — see claude_brain fact list / refactor-plan §6.
import { db } from '../db/index.mjs';
import { logger } from '../logger.mjs';
import { json, badRequest } from '../http.mjs';

// eslint-disable-next-line no-unused-vars
export async function handleGetTemplates(req, ctx) {
  const { clientId } = ctx;
  const templates = await db.getTemplates(clientId || null);
  return json(templates);
}

export async function handleSaveTemplate(req, ctx) {
  const { user, clientId } = ctx;
  const body = await req.json();
  if (!body.name) return badRequest('Template name required');
  const template = {
    id: body.id || 'tpl_' + Date.now(),
    clientId: clientId || null,
    name: body.name,
    caption: body.caption || '',
    platforms: body.platforms || ['facebook', 'instagram'],
    postType: body.postType || 'feed',
    imageUrl: body.imageUrl || null,
    tags: body.tags || [],
    createdBy: user.email,
    createdAt: body.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await db.saveTemplate(template);
  logger.info('Template saved', { id: template.id, name: template.name });
  return json({ success: true, template });
}

export async function handleDeleteTemplate(req, ctx) {
  const { clientId } = ctx;
  const body = await req.json();
  if (!body.templateId) return badRequest('templateId required');
  if (db.deleteTemplate.length === 2) {
    await db.deleteTemplate(body.templateId, clientId || null);
  } else {
    await db.deleteTemplate(body.templateId);
  }
  return json({ success: true });
}
