// auth.mjs — User authentication for Grid Social
// PBKDF2 password hashing + HMAC-SHA256 JWT — no npm deps
import { getStore } from "@netlify/blobs";

const ITERATIONS = 100000;
const KEY_LEN = 64;

// === CRYPTO HELPERS ===
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" }, key, KEY_LEN * 8);
  const hash = Buffer.from(bits).toString("hex");
  const saltHex = Buffer.from(salt).toString("hex");
  return `${saltHex}:${hash}`;
}

async function verifyPassword(password, stored) {
  const [saltHex, expectedHash] = stored.split(":");
  const salt = Buffer.from(saltHex, "hex");
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" }, key, KEY_LEN * 8);
  return Buffer.from(bits).toString("hex") === expectedHash;
}

async function signJWT(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const enc = new TextEncoder();
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const data = `${b64(header)}.${b64(payload)}`;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return `${data}.${Buffer.from(sig).toString("base64url")}`;
}

async function verifyJWT(token, secret) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const data = `${headerB64}.${payloadB64}`;
    const sig = Buffer.from(sigB64, "base64url");
    const valid = await crypto.subtle.verify("HMAC", key, sig, enc.encode(data));
    if (!valid) return null;
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch { return null; }
}

// === HELPERS ===
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
});
const cors = () => new Response(null, {
  status: 204,
  headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Content-Type,Authorization" }
});

// === MAIN HANDLER ===
export default async function handler(req) {
  if (req.method === "OPTIONS") return cors();

  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const users = getStore("users");
  const JWT_SECRET = process.env.JWT_SECRET || "gridsocial-jwt-secret-2026";

  try {
    // ========== REGISTER ==========
    if (action === "register" && req.method === "POST") {
      const { email, password, name } = await req.json();
      if (!email || !password || !name) return json({ error: "All fields required" }, 400);
      if (password.length < 6) return json({ error: "Password must be at least 6 characters" }, 400);

      const emailKey = email.toLowerCase().trim().replace(/[^a-z0-9@._-]/g, "_");

      // Check if user exists
      try {
        const existing = await users.get(emailKey, { type: "json" });
        if (existing) return json({ error: "An account with this email already exists" }, 409);
      } catch {}

      const hashedPw = await hashPassword(password);
      const user = {
        id: `user_${Date.now()}`,
        email: email.toLowerCase().trim(),
        name: name.trim(),
        password: hashedPw,
        role: "member",
        status: "pending",
        assignedClients: [],
        createdAt: new Date().toISOString()
      };

      await users.setJSON(emailKey, user);
      return json({ success: true, message: "Account created. Waiting for admin approval." });
    }

    // ========== LOGIN ==========
    if (action === "login" && req.method === "POST") {
      const { email, password } = await req.json();
      if (!email || !password) return json({ error: "Email and password required" }, 400);

      const emailKey = email.toLowerCase().trim().replace(/[^a-z0-9@._-]/g, "_");
      let user;
      try { user = await users.get(emailKey, { type: "json" }); } catch {}
      if (!user) return json({ error: "Invalid email or password" }, 401);

      const pwOk = await verifyPassword(password, user.password);
      if (!pwOk) return json({ error: "Invalid email or password" }, 401);

      if (user.status === "pending") return json({ error: "Your account is awaiting approval. We'll let you know once it's been reviewed." }, 403);
      if (user.status === "declined") return json({ error: "Your account request was declined. Contact the admin." }, 403);
      if (user.status !== "active") return json({ error: "Account not active" }, 403);

      const token = await signJWT({
        sub: user.id, email: user.email, name: user.name,
        role: user.role, assignedClients: user.assignedClients,
        exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600 // 7 days
      }, JWT_SECRET);

      return json({ success: true, token, user: { id: user.id, email: user.email, name: user.name, role: user.role, assignedClients: user.assignedClients } });
    }

    // ========== VERIFY TOKEN ==========
    if (action === "verify") {
      const auth = req.headers.get("Authorization")?.replace("Bearer ", "");
      if (!auth) return json({ error: "No token" }, 401);
      const payload = await verifyJWT(auth, JWT_SECRET);
      if (!payload) return json({ error: "Invalid or expired token" }, 401);
      return json({ valid: true, user: { id: payload.sub, email: payload.email, name: payload.name, role: payload.role, assignedClients: payload.assignedClients } });
    }

    // ========== FORGOT PASSWORD ==========
    if (action === "forgot-password" && req.method === "POST") {
      const { email } = await req.json();
      if (!email) return json({ error: "Email required" }, 400);
      const emailKey = email.toLowerCase().trim().replace(/[^a-z0-9@._-]/g, "_");
      let user;
      try { user = await users.get(emailKey, { type: "json" }); } catch {}
      // Always return success to prevent email enumeration
      if (!user) return json({ success: true, message: "If that email exists, a reset link has been sent." });

      const resetToken = crypto.randomUUID();
      user.resetToken = resetToken;
      user.resetExpiry = Date.now() + 3600000; // 1 hour
      await users.setJSON(emailKey, user);

      // TODO: Send email with reset link. For now, admin can see reset tokens in user management.
      console.log(`[auth] Password reset for ${email}: token=${resetToken}`);
      return json({ success: true, message: "If that email exists, a reset link has been sent." });
    }

    // ========== RESET PASSWORD ==========
    if (action === "reset-password" && req.method === "POST") {
      const { email, token, newPassword } = await req.json();
      if (!email || !token || !newPassword) return json({ error: "All fields required" }, 400);
      if (newPassword.length < 6) return json({ error: "Password must be at least 6 characters" }, 400);

      const emailKey = email.toLowerCase().trim().replace(/[^a-z0-9@._-]/g, "_");
      let user;
      try { user = await users.get(emailKey, { type: "json" }); } catch {}
      if (!user || user.resetToken !== token || Date.now() > user.resetExpiry) {
        return json({ error: "Invalid or expired reset link" }, 400);
      }

      user.password = await hashPassword(newPassword);
      delete user.resetToken;
      delete user.resetExpiry;
      await users.setJSON(emailKey, user);
      return json({ success: true, message: "Password updated. You can now sign in." });
    }

    // ===== ADMIN-ONLY ROUTES BELOW =====
    const auth = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!auth) return json({ error: "Unauthorised" }, 401);

    // Also accept legacy admin key
    const ADMIN_KEY = process.env.ADMIN_KEY;
    let currentUser = null;
    if (auth === ADMIN_KEY) {
      currentUser = { role: "admin", email: "admin" };
    } else {
      const payload = await verifyJWT(auth, JWT_SECRET);
      if (!payload) return json({ error: "Invalid or expired token" }, 401);
      currentUser = payload;
    }

    if (currentUser.role !== "admin") return json({ error: "Admin access required" }, 403);

    // ========== GET USERS ==========
    if (action === "get-users") {
      const { blobs } = await users.list();
      const userList = [];
      for (const blob of blobs) {
        try {
          const u = await users.get(blob.key, { type: "json" });
          userList.push({ id: u.id, email: u.email, name: u.name, role: u.role, status: u.status, assignedClients: u.assignedClients || [], createdAt: u.createdAt, resetToken: u.resetToken || null });
        } catch {}
      }
      return json(userList);
    }

    // ========== APPROVE USER ==========
    if (action === "approve-user" && req.method === "POST") {
      const { email } = await req.json();
      const emailKey = email.toLowerCase().trim().replace(/[^a-z0-9@._-]/g, "_");
      let user;
      try { user = await users.get(emailKey, { type: "json" }); } catch {}
      if (!user) return json({ error: "User not found" }, 404);
      user.status = "active";
      await users.setJSON(emailKey, user);
      return json({ success: true });
    }

    // ========== DECLINE USER ==========
    if (action === "decline-user" && req.method === "POST") {
      const { email } = await req.json();
      const emailKey = email.toLowerCase().trim().replace(/[^a-z0-9@._-]/g, "_");
      let user;
      try { user = await users.get(emailKey, { type: "json" }); } catch {}
      if (!user) return json({ error: "User not found" }, 404);
      user.status = "declined";
      await users.setJSON(emailKey, user);
      return json({ success: true });
    }

    // ========== UPDATE USER (role, assignedClients) ==========
    if (action === "update-user" && req.method === "PUT") {
      const { email, role, assignedClients, name } = await req.json();
      const emailKey = email.toLowerCase().trim().replace(/[^a-z0-9@._-]/g, "_");
      let user;
      try { user = await users.get(emailKey, { type: "json" }); } catch {}
      if (!user) return json({ error: "User not found" }, 404);
      if (role) user.role = role;
      if (assignedClients !== undefined) user.assignedClients = assignedClients;
      if (name) user.name = name;
      await users.setJSON(emailKey, user);
      return json({ success: true });
    }

    // ========== DELETE USER ==========
    if (action === "delete-user" && req.method === "DELETE") {
      const { email } = await req.json();
      const emailKey = email.toLowerCase().trim().replace(/[^a-z0-9@._-]/g, "_");
      await users.delete(emailKey);
      return json({ success: true });
    }

    // ========== ADMIN RESET PASSWORD ==========
    if (action === "admin-reset-password" && req.method === "POST") {
      const { email, newPassword } = await req.json();
      const emailKey = email.toLowerCase().trim().replace(/[^a-z0-9@._-]/g, "_");
      let user;
      try { user = await users.get(emailKey, { type: "json" }); } catch {}
      if (!user) return json({ error: "User not found" }, 404);
      user.password = await hashPassword(newPassword);
      delete user.resetToken;
      delete user.resetExpiry;
      await users.setJSON(emailKey, user);
      return json({ success: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("[auth] Error:", e);
    return json({ error: e.message }, 500);
  }
}

export const config = { path: "/api/auth" };
