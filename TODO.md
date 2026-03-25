# Grid Social — Current TODO

**Last updated:** 25 March 2026 (Phase 7 complete)

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
| Phase 5 | ✅ DEPLOYED | White-label, calendar, CSV import, advanced analytics (Recharts), Pinterest OAuth+posting |
| Phase 6 | ✅ DEPLOYED | Supabase migration ready, post preview, templates, drag-and-drop queue, analytics PDF export |
| Phase 7 | ✅ BUILT | Rate limiting per plan, multi-user roles, bulk queue actions, post duplication, custom domain support |
| Phase 8 | 🔲 TODO | Real-time notifications, webhook integrations, AI auto-caption improvements, team chat |

---

## COMPLETED THIS SESSION (Phase 7)

- [x] Rate limiting per plan tier: lib/plan-limits.mjs (free 30/mo, starter 300, agency 1500, pro unlimited)
- [x] Plan limit enforcement on add-post, post-now, bulk-import, add-client
- [x] Plan usage API endpoint (plan-usage action) — returns monthly post count vs limit
- [x] Plan usage display in billing tab + queue header
- [x] Multi-user roles: editor (compose/edit, no publish), viewer (read-only)
- [x] Role permission enforcement in admin.mjs (writeActions, publishActions, readOnlyActions)
- [x] Role picker dropdown in Team Management tab (admin/member/editor/viewer)
- [x] Client assignment multi-select in Team Management tab
- [x] Bulk queue actions: checkbox select, select all, bulk delete, bulk publish, bulk reschedule
- [x] Bulk action bar with datetime picker for reschedule
- [x] Post duplication: duplicate-post API action (clones caption/platforms/postType/imageUrl)
- [x] Duplicate button (⎘) on queue and published posts
- [x] Custom domain field on client records (customDomain in client modal)
- [x] custom_domain column added to Supabase schema
- [x] Plan field included in JWT tokens and auth verify response

---

## YOUR MANUAL ACTIONS (priority order)

### 1. Set up Supabase (to switch from Netlify Blobs)
- [ ] Create Supabase project (free tier) at supabase.com
- [ ] Run supabase-schema.sql in SQL Editor
- [ ] Add SUPABASE_URL + SUPABASE_ANON_KEY to Netlify env vars
- [ ] Trigger migration: POST /api/admin?action=migrate-to-supabase
- [ ] Verify data in Supabase dashboard

### 2. Resend Domain Verification
- [ ] resend.com/domains → add gridsocial.co.uk → get DNS records → add at DNS provider → verify

### 3. Meta Business Verification
- [ ] Check status at business.facebook.com → Security Centre (submitted 24/3/26)
- [ ] If approved → start Access Verification → App Review

### 4. Upload Meta App Icon
- [ ] developers.facebook.com/apps/1576303166762174/settings/basic/ → upload app-icon-1024.png

### 5. LinkedIn OAuth App
- [ ] developer.linkedin.com → Create app "Grid Social" → Community Management API
- [ ] Redirect: https://grid-social-autoposter.netlify.app/api/linkedin-callback
- [ ] Add LINKEDIN_CLIENT_ID + SECRET to Netlify

### 6. Stripe Products
- [ ] Create: Starter £15/mo, Agency £59/mo, Agency Pro £119/mo
- [ ] Webhook: https://grid-social-autoposter.netlify.app/api/stripe-webhook
- [ ] Add all keys to Netlify

### 7. connect.gridsocial.co.uk
- [ ] CNAME: connect → grid-social-autoposter.netlify.app
- [ ] Add in Netlify domain settings

### 8. Pinterest Developer App
- [ ] developers.pinterest.com → Create app → Pins API access
- [ ] Redirect: https://grid-social-autoposter.netlify.app/api/pinterest-callback
- [ ] Add PINTEREST_APP_ID + SECRET to Netlify

### 9. TikTok + Google Cloud (GBP)
- [ ] TikTok: developers.tiktok.com → Content Posting API
- [ ] Google: Cloud Console → OAuth app → GBP API enabled
- [ ] Add env vars to Netlify

---

## NEXT BUILD SESSION (Phase 8)

- [ ] Real-time notifications (webhook → dashboard push)
- [ ] Team chat / notes per client
- [ ] AI auto-caption improvements (tone selection, hashtag gen, image analysis)
- [ ] Webhook integrations (Zapier, n8n, Make) — outgoing webhooks on publish/fail
- [ ] Client-facing analytics dashboard (read-only, branded, shareable link)
- [ ] Scheduling time slots (preset times per client, auto-fill)
- [ ] Post recycling / evergreen content rotation
- [ ] Content calendar export (iCal)
- [ ] Dashboard dark/light theme toggle

---

## ENV VARS

**Set:** ADMIN_KEY, META_APP_ID, META_APP_SECRET, GITHUB_TOKEN, JWT_SECRET, ENCRYPTION_KEY, ANTHROPIC_API_KEY, RESEND_API_KEY

**Need:** SUPABASE_URL, SUPABASE_ANON_KEY, TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_STARTER, STRIPE_PRICE_AGENCY, STRIPE_PRICE_AGENCY_PRO, PINTEREST_APP_ID, PINTEREST_APP_SECRET
