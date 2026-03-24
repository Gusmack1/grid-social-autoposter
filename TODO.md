# Grid Social — Current TODO

**Last updated:** 24 March 2026 (end of Phase 3 build session)

---

## STATUS SUMMARY

| Phase | Status | Key Deliverables |
|-------|--------|-----------------|
| Phase 1 | ✅ DEPLOYED | Backend split, AES-256 encryption, Vite frontend, parallel publishing, retry, rate limiting |
| Phase 2 | ✅ DEPLOYED | Client connect portal, JWT invite links, token health monitor, Meta OAuth portal flow, CI |
| Phase 3 | ✅ DEPLOYED | LinkedIn OAuth, approval workflows, Meta review prep, privacy/terms pages, data deletion callback |
| Phase 4 | 🔲 TODO | Dashboard UI for approvals, email notifications, Stripe, platform expansion |

---

## IMMEDIATE — YOUR MANUAL ACTIONS (Can't be automated)

### 1. Meta App Review Submission
**Priority:** CRITICAL — blocks all non-team client onboarding
**Guide:** `META-APP-REVIEW-GUIDE.md` in repo
**Steps you need to do:**
- [ ] Go to https://developers.facebook.com/apps/1576303166762174/settings/basic/
- [ ] Set Privacy Policy URL to: `https://grid-social-autoposter.netlify.app/privacy.html`
- [ ] Set Terms of Service URL to: `https://grid-social-autoposter.netlify.app/terms.html`
- [ ] Set Data Deletion Callback URL to: `https://grid-social-autoposter.netlify.app/api/meta-deletion`
- [ ] Upload app icon (1024×1024)
- [ ] Record screencasts showing each permission in use (see guide)
- [ ] Submit review for all 6 permissions
- [ ] **Wait 1-5 business days for approval**

### 2. DNS — connect.gridsocial.co.uk Subdomain
**Priority:** HIGH — professional client-facing URL
**Guide:** `SUBDOMAIN-SETUP.md` in repo
- [ ] Add CNAME record: `connect` → `grid-social-autoposter.netlify.app`
- [ ] Add custom domain in Netlify dashboard
- [ ] Wait for SSL certificate (auto)
- [ ] Test: `https://connect.gridsocial.co.uk/connect`

### 3. LinkedIn OAuth App Registration
**Priority:** HIGH — code is deployed, just needs credentials
- [ ] Go to https://developer.linkedin.com/ → Create App
- [ ] App name: "Grid Social"
- [ ] Company: Your LinkedIn company page
- [ ] Request "Community Management API" product
- [ ] Auth → Redirect URLs: add `https://grid-social-autoposter.netlify.app/api/linkedin-callback`
- [ ] Copy Client ID and Client Secret
- [ ] Add to Netlify env vars: `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET`
- [ ] Test: click LinkedIn "Connect" button in client portal

---

## NEXT BUILD SESSION — CODE WORK

### Dashboard UI Updates (for approval workflows)
- [ ] Queue tab: show approval status badge (pending/approved/changes_requested) on each post
- [ ] Queue tab: pending posts show client comment if changes were requested
- [ ] Clients tab: approval mode selector dropdown (auto/manual/passive) per client
- [ ] Clients tab: show approval link alongside invite link (DONE ✅)
- [ ] Compose tab: show warning if client is in manual/passive mode ("Post will need client approval")

### Email Notifications
- [ ] Send email to client when new posts need approval (use ImprovMX or Resend)
- [ ] Send email to admin when client approves/rejects posts
- [ ] Configurable frequency: instant / daily digest

### Stripe Billing Integration
- [ ] Stripe account setup (gridsocial.co.uk)
- [ ] Create products/prices for: Free £0 / Starter £15 / Agency £59 / Agency Pro £119
- [ ] Checkout session endpoint
- [ ] Webhook handler for subscription events
- [ ] Usage limits enforcement (profile count, user count per tier)
- [ ] Customer portal for self-service plan management
- [ ] Trial period (14 days)

### Platform Expansion
- [ ] TikTok OAuth app → connect button → posting (skeleton exists in `lib/platforms/tiktok.mjs`)
- [ ] Google Business Profile OAuth → connect button → local posts
- [ ] Carousel/multi-image posts for Facebook and Instagram
- [ ] Threads API integration (uses Meta app, different permissions)
- [ ] Bluesky (AT Protocol, app password auth — simplest integration)

### LinkedIn Token Auto-Refresh
- [ ] Background function to refresh LinkedIn tokens 7 days before 60-day expiry
- [ ] Use refresh token grant flow
- [ ] Update token-health.mjs to trigger refresh when within 7 days of expiry

---

## HOUSEKEEPING (do whenever)

- [ ] Google Search Console — verify gridsocial.co.uk
- [ ] Instagram — switch to Business account (currently Personal/Creator?)
- [ ] ImprovMX — set up hello@gridsocial.co.uk alias
- [ ] Case study — write up Sorn Handyman results once data is in
- [ ] Twitter/X — regenerate access token with Read+Write when ready ($0 credits currently)

---

## ARCHITECTURE DECISIONS PENDING

| Decision | Current | Options | Notes |
|----------|---------|---------|-------|
| Database | Netlify Blobs | Supabase PostgreSQL | Swap when data structure needs relations |
| Email service | None | Resend / ImprovMX / SendGrid | Need for approval notifications |
| Job queue | Cron + QStash fallback | QStash / Inngest | QStash when volume grows past 1/day/client |
| Media CDN | GitHub repo | Cloudflare R2 | R2 when image volume is significant |

---

## CLIENTS ACTIVE

| Client | FB | IG | LI | Tokens | Posts Queued |
|--------|----|----|-----|--------|-------------|
| Sorn Handyman Services | ✅ 569602312902858 | pending | — | ✅ healthy | — |
| Food Foodie World | ✅ 111110793818072 | — | — | ✅ healthy | — |
| Gus | ✅ 2269593123255845 | 17841400969633192 | — | ✅ healthy | — |
| Grid Social | ✅ 978717005332489 | 17841441580105982 | — | ✅ healthy | ~29 queued |

---

## ENV VARS ON NETLIFY

**Currently set:**
- `ADMIN_KEY` — legacy admin auth
- `META_APP_ID` — 1576303166762174
- `META_APP_SECRET` — set
- `GITHUB_TOKEN` — repo access for media uploads
- `JWT_SECRET` — JWT signing
- `ENCRYPTION_KEY` — AES-256-GCM key

**Need to add:**
- `LINKEDIN_CLIENT_ID` — after registering LinkedIn app
- `LINKEDIN_CLIENT_SECRET` — after registering LinkedIn app
- `STRIPE_SECRET_KEY` — when setting up Stripe
- `STRIPE_WEBHOOK_SECRET` — when setting up Stripe webhooks
