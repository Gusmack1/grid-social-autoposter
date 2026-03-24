# Phase 3 — Progress & Deployment Guide

**Status:** BUILT — Ready to deploy
**Date:** 24 March 2026

---

## What's New in Phase 3

### 1. LinkedIn OAuth Integration (Full Flow)

**New files:**
- `netlify/functions/linkedin-auth.mjs` — Step 1: Redirect to LinkedIn authorization
- `netlify/functions/linkedin-callback.mjs` — Step 2: Exchange code, save token

**Features:**
- Full OAuth 2.0 flow with OpenID Connect
- Supports both admin dashboard and client portal flows
- Auto-detects LinkedIn Company Pages the user administers
- Single org = auto-assign, multiple = picker UI (same pattern as Meta)
- Stores: `linkedinAccessToken` (encrypted), `linkedinId`, `linkedinType`, `linkedinName`, `linkedinTokenExpiresAt`
- Token expiry tracking (60-day LinkedIn tokens)

**Connect portal updated:**
- LinkedIn "Connect" button now live when `LINKEDIN_CLIENT_ID` env var is set
- Falls back to "Coming soon" if not configured

**Token health updated:**
- `token-health.mjs` now checks LinkedIn token validity via `/v2/userinfo`
- Warns when LinkedIn token is within 7 days of expiry
- Marks expired tokens as invalid

**Env vars needed:**
```
LINKEDIN_CLIENT_ID=<your-linkedin-app-client-id>
LINKEDIN_CLIENT_SECRET=<your-linkedin-app-client-secret>
```

### 2. Approval Workflows (Full System)

**New files:**
- `netlify/functions/approval-portal.mjs` — Client-facing approval page

**Updated files:**
- `netlify/functions/lib/invites.mjs` — Added approval token generation/verification
- `netlify/functions/admin.mjs` — New actions: `generate-approval-link`, `set-approval-mode`, `set-approval-status`
- `netlify/functions/scheduled-post.mjs` — Approval gate + passive auto-approve

**Three approval modes per client:**

| Mode | Behaviour |
|------|-----------|
| `auto` | Posts go straight to queue, no approval needed (default) |
| `manual` | Posts sit in "Pending Approval" until client approves |
| `passive` | Auto-approved after 72 hours (configurable) if no feedback |

**Client approval portal (`/approve?token=TOKEN`):**
- Magic link access (no login needed)
- Shows pending posts with full preview (caption, image, platforms, schedule)
- Approve individual posts or bulk-approve all
- Request changes with text feedback
- Mobile-responsive design
- Toast notifications for actions

**Scheduler changes:**
- Only publishes posts with `approvalStatus: 'approved'` (or no status for legacy posts)
- Passive mode: auto-approves posts when `passiveDeadline` has passed
- Logs passive auto-approvals

**Admin API endpoints:**

| Action | Method | Description |
|--------|--------|-------------|
| `generate-approval-link` | POST | Create a 14-day magic link for client |
| `set-approval-mode` | PUT | Set client to auto/manual/passive |
| `set-approval-status` | PUT | Manually approve/reject a post |

### 3. Meta App Review Preparation

**New files:**
- `META-APP-REVIEW-GUIDE.md` — Step-by-step submission guide
- `frontend/public/privacy.html` — Privacy policy page (Meta requirement)
- `frontend/public/terms.html` — Terms of service page (Meta requirement)
- `netlify/functions/meta-deletion.mjs` — Data deletion callback (Meta requirement)

**Privacy policy covers:**
- Facebook/Instagram data collection specifics
- AES-256-GCM encryption details
- GDPR/UK data protection rights
- Data retention and deletion procedures

**Data deletion callback:**
- Verifies signed request from Meta (HMAC-SHA256)
- Returns confirmation code and status URL
- Logs deletion requests for admin follow-up

### 4. Subdomain Setup Guide

**New files:**
- `SUBDOMAIN-SETUP.md` — Instructions for connect.gridsocial.co.uk

Three options documented:
- Option A: Netlify custom domain (recommended)
- Option B: Cloudflare proxy
- Option C: Simple redirect

### 5. Route Updates

**netlify.toml additions:**
- `/api/linkedin-auth` → linkedin-auth function
- `/api/linkedin-callback` → linkedin-callback function
- `/api/meta-deletion` → meta-deletion function
- `/approve` → approval-portal function

---

## New File Summary

| File | Lines | Purpose |
|------|-------|---------|
| `netlify/functions/linkedin-auth.mjs` | ~40 | LinkedIn OAuth redirect |
| `netlify/functions/linkedin-callback.mjs` | ~230 | LinkedIn OAuth callback + org picker |
| `netlify/functions/approval-portal.mjs` | ~250 | Client approval portal |
| `netlify/functions/meta-deletion.mjs` | ~70 | Meta data deletion callback |
| `frontend/public/privacy.html` | ~130 | Privacy policy page |
| `frontend/public/terms.html` | ~100 | Terms of service page |
| `META-APP-REVIEW-GUIDE.md` | ~180 | Meta submission guide |
| `SUBDOMAIN-SETUP.md` | ~90 | DNS setup instructions |

**Updated files:**
- `netlify/functions/lib/invites.mjs` — Added approval tokens
- `netlify/functions/admin.mjs` — 3 new approval endpoints + approval-aware post creation
- `netlify/functions/scheduled-post.mjs` — Approval gate + passive auto-approve
- `netlify/functions/token-health.mjs` — LinkedIn health checks
- `netlify/functions/connect-portal.mjs` — LinkedIn button enabled
- `netlify.toml` — 4 new redirect rules

---

## Deployment Steps

### 1. Push to GitHub

```bash
cd grid-social-autoposter
git add -A
git commit -m "Phase 3: LinkedIn OAuth, approval workflows, Meta review prep"
git push origin main
```

### 2. Wait for Netlify deploy (~60 seconds)

### 3. Add LinkedIn env vars (when ready)

In Netlify → Site settings → Environment variables:
```
LINKEDIN_CLIENT_ID=<your-app-id>
LINKEDIN_CLIENT_SECRET=<your-app-secret>
```

### 4. Register LinkedIn OAuth App

1. Go to: https://developer.linkedin.com/
2. Create new app → "Grid Social"
3. Products → Request "Community Management API" access
4. Auth settings:
   - Redirect URL: `https://grid-social-autoposter.netlify.app/api/linkedin-callback`
   - (Also add: `https://connect.gridsocial.co.uk/api/linkedin-callback` when subdomain is ready)
5. Copy Client ID and Client Secret to Netlify env vars

### 5. Configure Meta Data Deletion URL

1. Go to: https://developers.facebook.com/apps/1576303166762174/settings/basic/
2. Set "Data Deletion Callback URL" to:
   `https://grid-social-autoposter.netlify.app/api/meta-deletion`

### 6. Verify

- Privacy page loads: `https://grid-social-autoposter.netlify.app/privacy.html`
- Terms page loads: `https://grid-social-autoposter.netlify.app/terms.html`
- LinkedIn auth redirects (if env vars set): `/api/linkedin-auth`
- Approval portal renders: `/approve?token=<test-token>`
- Connect portal shows LinkedIn button (if configured)

---

## Testing Approval Workflows

### Set a client to manual approval mode:
```bash
curl -X PUT 'https://grid-social-autoposter.netlify.app/api/admin?action=set-approval-mode' \
  -H 'Authorization: Bearer gridsocial2026!' \
  -H 'Content-Type: application/json' \
  -d '{"clientId":"client_1774346116871","approvalMode":"manual"}'
```

### Generate an approval link:
```bash
curl -X POST 'https://grid-social-autoposter.netlify.app/api/admin?action=generate-approval-link' \
  -H 'Authorization: Bearer gridsocial2026!' \
  -H 'Content-Type: application/json' \
  -d '{"clientId":"client_1774346116871"}'
```

### Add a post (will be created with status "pending"):
```bash
curl -X POST 'https://grid-social-autoposter.netlify.app/api/admin?action=add-post&clientId=client_1774346116871' \
  -H 'Authorization: Bearer gridsocial2026!' \
  -H 'Content-Type: application/json' \
  -d '{"caption":"Test approval post","platforms":["facebook"]}'
```

### Open the approval link in browser:
The client sees pending posts and can approve/reject them.

---

## What's NOT Built Yet (Phase 4+)

- [ ] Dashboard UI for approval workflows (approval link generation button, approval status display in queue)
- [ ] Email notifications to clients when posts need approval
- [ ] Email notifications to admin when posts are approved/rejected
- [ ] TikTok OAuth integration
- [ ] Google Business Profile OAuth integration
- [ ] Carousel/multi-image posts
- [ ] LinkedIn token auto-refresh (7 days before expiry)
- [ ] Stripe billing integration
