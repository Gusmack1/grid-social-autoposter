// Auth API v4 — Rate-limited, uses shared lib
import { db } from './lib/db/index.mjs';
import { hashPassword, verifyPassword } from './lib/crypto/password.mjs';
import { signJWT, verifyJWT } from './lib/crypto/jwt.mjs';
import { checkRateLimit } from './lib/rate-limiter.mjs';
import { json, cors, unauthorized, badRequest } from './lib/http.mjs';
import { logger } from './lib/logger.mjs';

function emailKey(email) {
  return email.toLowerCase().trim().replace(/[^a-z0-9@._-]/g, '_');
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return cors();

  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  const JWT_SECRET = process.env.JWT_SECRET || 'gridsocial-jwt-secret-2026';

  try {
    // ── REGISTER ──
    if (action === 'register' && req.method === 'POST') {
      const { email, password, name } = await req.json();
      if (!email || !password || !name) return badRequest('All fields required');
      if (password.length < 6) return badRequest('Password must be at least 6 characters');
      const key = emailKey(email);
      const existing = await db.getUser(key);
      if (existing) return json({ error: 'An account with this email already exists' }, 409);
      const user = {
        id: `user_${Date.now()}`, email: email.toLowerCase().trim(), name: name.trim(),
        password: await hashPassword(password), role: 'member', status: 'pending',
        assignedClients: [], createdAt: new Date().toISOString(),
      };
      await db.saveUser(key, user);
      return json({ success: true, message: 'Account created. Waiting for admin approval.' });
    }

    // ── LOGIN (rate-limited) ──
    if (action === 'login' && req.method === 'POST') {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-nf-client-connection-ip') || 'unknown';
      const rl = await checkRateLimit(ip);
      if (!rl.allowed) {
        logger.warn('Rate limit exceeded', { ip, retryAfter: rl.retryAfter });
        return json({ error: `Too many attempts. Try again in ${Math.ceil(rl.retryAfter / 60)} minutes.` }, 429);
      }

      const { email, password } = await req.json();
      if (!email || !password) return badRequest('Email and password required');
      const key = emailKey(email);
      const user = await db.getUser(key);
      if (!user) return json({ error: 'Invalid email or password' }, 401);
      const pwOk = await verifyPassword(password, user.password);
      if (!pwOk) return json({ error: 'Invalid email or password' }, 401);
      if (user.status === 'pending') return json({ error: 'Your account is awaiting approval.' }, 403);
      if (user.status === 'declined') return json({ error: 'Your account request was declined. Contact the admin.' }, 403);
      if (user.status !== 'active') return json({ error: 'Account not active' }, 403);

      const token = await signJWT({
        sub: user.id, email: user.email, name: user.name,
        role: user.role, assignedClients: user.assignedClients,
        exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
      }, JWT_SECRET);

      logger.info('User logged in', { email: user.email, role: user.role });
      return json({ success: true, token, user: { id: user.id, email: user.email, name: user.name, role: user.role, assignedClients: user.assignedClients } });
    }

    // ── VERIFY TOKEN ──
    if (action === 'verify') {
      const auth = req.headers.get('Authorization')?.replace('Bearer ', '');
      if (!auth) return unauthorized();
      const payload = await verifyJWT(auth, JWT_SECRET);
      if (!payload) return json({ error: 'Invalid or expired token' }, 401);
      return json({ valid: true, user: { id: payload.sub, email: payload.email, name: payload.name, role: payload.role, assignedClients: payload.assignedClients } });
    }

    // ── FORGOT PASSWORD ──
    if (action === 'forgot-password' && req.method === 'POST') {
      const { email } = await req.json();
      if (!email) return badRequest('Email required');
      const key = emailKey(email);
      const user = await db.getUser(key);
      if (!user) return json({ success: true, message: 'If that email exists, a reset link has been sent.' });
      const resetToken = crypto.randomUUID();
      user.resetToken = resetToken;
      user.resetExpiry = Date.now() + 3600000;
      await db.saveUser(key, user);
      logger.info('Password reset requested', { email });
      return json({ success: true, message: 'If that email exists, a reset link has been sent.' });
    }

    // ── RESET PASSWORD ──
    if (action === 'reset-password' && req.method === 'POST') {
      const { email, token, newPassword } = await req.json();
      if (!email || !token || !newPassword) return badRequest('All fields required');
      if (newPassword.length < 6) return badRequest('Password must be at least 6 characters');
      const key = emailKey(email);
      const user = await db.getUser(key);
      if (!user || user.resetToken !== token || Date.now() > user.resetExpiry) return badRequest('Invalid or expired reset link');
      user.password = await hashPassword(newPassword);
      delete user.resetToken;
      delete user.resetExpiry;
      await db.saveUser(key, user);
      return json({ success: true, message: 'Password updated. You can now sign in.' });
    }

    // ═══ ADMIN-ONLY ROUTES ═══
    const auth = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!auth) return unauthorized();
    const ADMIN_KEY = process.env.ADMIN_KEY;
    let currentUser = null;
    if (auth === ADMIN_KEY) { currentUser = { role: 'admin', email: 'admin' }; }
    else {
      const payload = await verifyJWT(auth, JWT_SECRET);
      if (!payload) return json({ error: 'Invalid or expired token' }, 401);
      currentUser = payload;
    }
    if (currentUser.role !== 'admin') return json({ error: 'Admin access required' }, 403);

    if (action === 'get-users') {
      const users = await db.listUsers();
      return json(users.map(u => ({
        id: u.id, email: u.email, name: u.name, role: u.role,
        status: u.status, assignedClients: u.assignedClients || [],
        createdAt: u.createdAt, resetToken: u.resetToken || null,
      })));
    }

    if (action === 'approve-user' && req.method === 'POST') {
      const { email } = await req.json();
      const key = emailKey(email);
      const user = await db.getUser(key);
      if (!user) return json({ error: 'User not found' }, 404);
      user.status = 'active';
      await db.saveUser(key, user);
      return json({ success: true });
    }

    if (action === 'decline-user' && req.method === 'POST') {
      const { email } = await req.json();
      const key = emailKey(email);
      const user = await db.getUser(key);
      if (!user) return json({ error: 'User not found' }, 404);
      user.status = 'declined';
      await db.saveUser(key, user);
      return json({ success: true });
    }

    if (action === 'update-user' && req.method === 'PUT') {
      const { email, role, assignedClients, name } = await req.json();
      const key = emailKey(email);
      const user = await db.getUser(key);
      if (!user) return json({ error: 'User not found' }, 404);
      if (role) user.role = role;
      if (assignedClients !== undefined) user.assignedClients = assignedClients;
      if (name) user.name = name;
      await db.saveUser(key, user);
      return json({ success: true });
    }

    if (action === 'delete-user' && req.method === 'DELETE') {
      const { email } = await req.json();
      await db.deleteUser(emailKey(email));
      return json({ success: true });
    }

    if (action === 'admin-reset-password' && req.method === 'POST') {
      const { email, newPassword } = await req.json();
      const key = emailKey(email);
      const user = await db.getUser(key);
      if (!user) return json({ error: 'User not found' }, 404);
      user.password = await hashPassword(newPassword);
      delete user.resetToken;
      delete user.resetExpiry;
      await db.saveUser(key, user);
      return json({ success: true });
    }

    return badRequest('Unknown action');
  } catch (e) {
    logger.error('Auth error', { action, error: e.message });
    return json({ error: e.message }, 500);
  }
}

export const config = { path: '/api/auth' };
