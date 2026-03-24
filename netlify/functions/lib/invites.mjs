// Invite & approval links — generate and verify signed JWT tokens
import { signJWT, verifyJWT } from './crypto/jwt.mjs';

const INVITE_EXPIRY_DAYS = 7;
const APPROVAL_EXPIRY_DAYS = 14;

// ── CONNECT PORTAL INVITES ──

export async function generateInviteLink(clientId, clientName, baseUrl) {
  const secret = process.env.JWT_SECRET || 'gridsocial-jwt-secret-2026';
  const token = await signJWT({
    type: 'invite',
    clientId,
    clientName,
    exp: Math.floor(Date.now() / 1000) + INVITE_EXPIRY_DAYS * 24 * 3600,
  }, secret);
  return {
    token,
    url: `${baseUrl}/connect?invite=${token}`,
    expiresIn: `${INVITE_EXPIRY_DAYS} days`,
  };
}

export async function verifyInviteToken(token) {
  const secret = process.env.JWT_SECRET || 'gridsocial-jwt-secret-2026';
  const payload = await verifyJWT(token, secret);
  if (!payload || payload.type !== 'invite') return null;
  return payload;
}

// ── APPROVAL MAGIC LINKS ──

export async function generateApprovalLink(clientId, clientName, baseUrl) {
  const secret = process.env.JWT_SECRET || 'gridsocial-jwt-secret-2026';
  const token = await signJWT({
    type: 'approval',
    clientId,
    clientName,
    exp: Math.floor(Date.now() / 1000) + APPROVAL_EXPIRY_DAYS * 24 * 3600,
  }, secret);
  return {
    token,
    url: `${baseUrl}/approve?token=${token}`,
    expiresIn: `${APPROVAL_EXPIRY_DAYS} days`,
  };
}

export async function verifyApprovalToken(token) {
  const secret = process.env.JWT_SECRET || 'gridsocial-jwt-secret-2026';
  const payload = await verifyJWT(token, secret);
  if (!payload || payload.type !== 'approval') return null;
  return payload;
}
