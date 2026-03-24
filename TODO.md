# Grid Social — Current TODO

**Last updated:** 24 March 2026 (Phase 5 complete)

---

## STATUS SUMMARY

| Phase | Status | Key Deliverables |
|-------|--------|-----------------|
| Phase 1 | ✅ DEPLOYED | Backend split, AES-256 encryption, Vite frontend, parallel publishing, retry, rate limiting |
| Phase 2 | ✅ DEPLOYED | Client connect portal, JWT invite links, token health monitor, Meta OAuth portal flow, CI |
| Phase 3 | ✅ DEPLOYED | LinkedIn OAuth, approval workflows (3 modes), Meta review prep, privacy/terms/deletion all live |
| Phase 3b | ✅ DEPLOYED | Dashboard approval UI, Stripe checkout+webhook, email notifications (Resend), app icon |
| Phase 4a | ✅ DEPLOYED | LinkedIn auto-refresh, Billing tab, Threads + Bluesky platforms, post approval emails |
| Phase 4b | ✅ DEPLOYED | TikTok OAuth, GBP OAuth, carousel posts, analytics dashboard+API, connect portal updates |
| Phase 5 | ✅ BUILT | White-label, calendar, CSV import, advanced analytics (Recharts), Pinterest OAuth+posting |
| Phase 6 | 🔲 TODO | Supabase migration, custom domains, real-time notifications, post templates |

---

## COMPLETED THIS SESSION (Phase 5)

- [x] White-label: per-client branding (logoUrl, brandColor, brandName) on connect + approval portals
- [x] White-label: branding fields in dashboard client modal (color picker + logo URL)
- [x] Content calendar: monthly grid with color-coded dots, click day to see/reschedule posts
- [x] Bulk post import: CSV upload (date, caption, imageUrl, platforms, postType) with quoted-field parser
- [x] Advanced analytics: per-post engagement from FB+IG Graph API (likes, comments, shares)
- [x] Advanced analytics: Recharts LineChart (engagement trends) + BarChart (publishing activity)
- [x] Advanced analytics: per-post engagement table with platform icons
- [x] Pinterest OAuth (pinterest-auth.mjs + pinterest-callback.mjs)
- [x] Pinterest platform module (lib/platforms/pinterest.mjs — Create Pin API v5, refresh, delete)
- [x] Pinterest: publisher, connect portal, token health, constants, PlatformIcon, netlify.toml all updated
- [x] 9 platforms: FB, IG, Threads, Bluesky, X, TikTok, LinkedIn, GBP, Pinterest

---

## YOUR MANUAL ACTIONS (priority order)

### 1. Resend Domain Verification
- [ ] resend.com/domains → add gridsocial.co.uk → get DNS records → add at DNS provider → verify

### 2. Meta Business Verification
- [ ] Check status at business.facebook.com → Security Centre (submitted 24/3/26)
- [ ] If approved → start Access Verification → App Review

### 3. Upload Meta App Icon
- [ ] developers.facebook.com/apps/1576303166762174/settings/basic/ → upload app-icon-1024.png

### 4. LinkedIn OAuth App
- [ ] developer.linkedin.com → Create app "Grid Social" → Community Management API
- [ ] Redirect: https://grid-social-autoposter.netlify.app/api/linkedin-callback
- [ ] Add LINKEDIN_CLIENT_ID + SECRET to Netlify

### 5. Stripe Products
- [ ] Create: Starter £15/mo, Agency £59/mo, Agency Pro £119/mo
- [ ] Webhook: https://grid-social-autoposter.netlify.app/api/stripe-webhook
- [ ] Add all keys to Netlify

### 6. connect.gridsocial.co.uk
- [ ] CNAME: connect → grid-social-autoposter.netlify.app
- [ ] Add in Netlify domain settings

### 7. Pinterest Developer App
- [ ] developers.pinterest.com → Create app → Pins API access
- [ ] Redirect: https://grid-social-autoposter.netlify.app/api/pinterest-callback
- [ ] Add PINTEREST_APP_ID + SECRET to Netlify

### 8. TikTok + Google Cloud (GBP)
- [ ] TikTok: developers.tiktok.com → Content Posting API
- [ ] Google: Cloud Console → OAuth app → GBP API enabled
- [ ] Add env vars to Netlify

---

## NEXT BUILD SESSION (Phase 6)

- [ ] Supabase migration (replace Netlify Blobs)
- [ ] Custom domain support per client (CNAME white-label)
- [ ] Post preview (per-platform rendering)
- [ ] Post templates (save and reuse)
- [ ] Drag-and-drop queue reordering
- [ ] Export analytics as PDF report
- [ ] Rate limiting per plan tier
- [ ] Team chat / notes per client
- [ ] AI auto-caption improvements (tone, hashtag gen)

---

## ENV VARS

**Set:** ADMIN_KEY, META_APP_ID, META_APP_SECRET, GITHUB_TOKEN, JWT_SECRET, ENCRYPTION_KEY, ANTHROPIC_API_KEY, RESEND_API_KEY

**Need:** TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_STARTER, STRIPE_PRICE_AGENCY, STRIPE_PRICE_AGENCY_PRO, PINTEREST_APP_ID, PINTEREST_APP_SECRET
