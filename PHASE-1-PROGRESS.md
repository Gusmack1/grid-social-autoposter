# Phase 1 — Progress & Deployment Guide

**Status:** BUILT — Ready to deploy
**Date:** 24 March 2026

---

## What Changed

### Backend: 3 monolithic files → 4 entry points + 18 shared modules

**Before:**
- `admin.mjs` — 441 lines, all platform code inline
- `auth.mjs` — 276 lines, crypto inline
- `scheduled-post.mjs` — 602 lines, all platform code duplicated

**After:**
- `admin-v4.mjs` — ~180 lines, delegates to lib modules
- `auth-v4.mjs` — ~170 lines, rate-limited, delegates to lib modules
- `scheduled-post-v4.mjs` — ~90 lines, delegates to publisher
- `publish-webhook.mjs` — ~70 lines, new QStash callback endpoint

**Shared library (`netlify/functions/lib/`):**

| Module | Purpose |
|--------|---------|
| `crypto/encryption.mjs` | AES-256-GCM token encryption at rest |
| `crypto/jwt.mjs` | HMAC-SHA256 JWT sign/verify |
| `crypto/password.mjs` | PBKDF2 password hashing |
| `db/index.mjs` | Netlify Blobs abstraction (ready for Supabase swap) |
| `platforms/facebook.mjs` | Feed + Reel + delete, with retry |
| `platforms/instagram.mjs` | Feed + Story + Reel, shared processing flow |
| `platforms/twitter.mjs` | OAuth 1.0a + v2 API, with retry |
| `platforms/linkedin.mjs` | UGC API with image upload, with retry |
| `platforms/google-business.mjs` | Local posts, with retry |
| `platforms/tiktok.mjs` | Content Posting API, with retry |
| `publisher.mjs` | Unified routing + parallel `Promise.allSettled` dispatch |
| `retry.mjs` | 3 attempts exponential backoff |
| `rate-limiter.mjs` | IP-based, 10 attempts/15 min window |
| `qstash.mjs` | Per-post scheduling (falls back to cron) |
| `r2.mjs` | Cloudflare R2 media upload (falls back to GitHub) |
| `logger.mjs` | Structured JSON logging |
| `http.mjs` | Response helpers + CORS + security headers |
| `migrate-tokens.mjs` | One-time plaintext → encrypted token migration |

### Frontend: 681-line CDN React → Vite + React SPA

**Before:** Single `public/index.html`, 681 lines, CDN React + Babel
**After:** `frontend/` directory with proper build pipeline

| File | Lines | Purpose |
|------|-------|---------|
| `src/main.jsx` | ~30 | Entry point, auth check |
| `src/App.jsx` | ~350 | Main dashboard |
| `src/components/AuthScreen.jsx` | ~90 | Login/register/forgot |
| `src/components/PlatformIcon.jsx` | ~60 | SVG platform icons |
| `src/constants.js` | ~30 | Platform config, links |
| `src/utils.js` | ~25 | Date formatting, truncation |
| `src/hooks/useApi.js` | ~30 | Authenticated fetch wrapper |
| `src/styles/theme.css` | ~200 | Dark theme, responsive |

### Infrastructure

- `netlify.toml` updated: Vite build command, security headers, publish-webhook route
- `.github/workflows/ci.yml` — Build check on push/PR
- `scripts/swap-v4.sh` — One-command file swap

---

## Deployment Steps

### 1. Run the swap script
```bash
cd grid-social-autoposter
chmod +x scripts/swap-v4.sh
./scripts/swap-v4.sh
```

### 2. Generate and add ENCRYPTION_KEY
```bash
openssl rand -hex 32
```
Add this to Netlify → Site settings → Environment variables as `ENCRYPTION_KEY`.

### 3. Push to GitHub
```bash
git add -A
git commit -m "Phase 1: modular backend + Vite frontend + encrypted tokens"
git push origin main
```

### 4. Wait for Netlify deploy (~60 seconds)

### 5. Migrate existing tokens
```bash
curl -X POST 'https://grid-social-autoposter.netlify.app/api/admin?action=migrate-tokens' \
  -H 'Authorization: Bearer gridsocial2026!'
```

### 6. Verify
- Dashboard loads at `gridsocial.co.uk/manage`
- Login works with `gus@gridsocial.co.uk`
- Clients load with masked tokens
- Queue shows existing posts
- Config endpoint shows `hasEncryptionKey: true`

---

## Key Wins

1. **Security:** AES-256-GCM token encryption at rest — tokens never stored in plaintext
2. **Reliability:** 3x retry with exponential backoff on every platform call
3. **Speed:** Parallel platform publishing via `Promise.allSettled`
4. **Protection:** Rate limiting on login (10 attempts / 15 min / IP)
5. **Observability:** Structured JSON logging throughout
6. **Modularity:** Each platform is isolated — add/fix one without touching others
7. **Scalability:** QStash per-post scheduling ready (falls back to cron gracefully)
8. **Future-proof:** DB abstraction layer ready for Supabase swap
9. **DX:** Vite dev server with hot reload, proper build pipeline
10. **CI:** GitHub Actions checks build on every push

---

## Rollback

If anything breaks after deploy:
```bash
cd grid-social-autoposter
cp backups/admin.mjs.bak netlify/functions/admin.mjs
cp backups/auth.mjs.bak netlify/functions/auth.mjs
cp backups/scheduled-post.mjs.bak netlify/functions/scheduled-post.mjs
# Restore old netlify.toml (publish: "public")
git add -A && git commit -m "Rollback to pre-Phase-1" && git push
```
