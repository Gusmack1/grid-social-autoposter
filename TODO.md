# Grid Social — Current TODO

**Last updated:** 25 March 2026 (Phase 6 complete)

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
| Phase 6 | ✅ BUILT | Supabase migration ready, post preview, templates, drag-and-drop queue, analytics PDF export |
| Phase 7 | 🔲 TODO | Custom domains, real-time notifications, rate limiting per plan, team chat |

---

## COMPLETED THIS SESSION (Phase 6)

- [x] Supabase migration: SQL schema (supabase-schema.sql), Supabase REST adapter (lib/db/supabase.mjs)
- [x] Supabase migration: Auto-detect — set SUPABASE_URL + SUPABASE_ANON_KEY to switch, falls back to Netlify Blobs
- [x] Supabase migration: Data migration script (lib/migrate-supabase.mjs), triggered via admin API
- [x] Supabase migration: Templates table added to both Supabase schema and Blobs adapter
- [x] Post preview: Platform-specific mockups (FB, IG, X, Threads, Bluesky, LinkedIn, TikTok, GBP, Pinterest)
- [x] Post preview: Character limit warnings per platform, toggle in compose section
- [x] Post templates: Save current compose state as reusable template, load/apply templates
- [x] Post templates: CRUD API (save-template, get-templates, delete-template) + TemplatePicker component
- [x] Drag-and-drop queue: HTML5 drag handles on queue items, reorder saved to backend
- [x] Drag-and-drop queue: sortOrder field on posts, DraggableQueue component
- [x] Export analytics as PDF: Server-side report generation (export-analytics action)
- [x] Export analytics as PDF: Client-side HTML report with charts, print-to-PDF dialog
- [x] DB backend indicator in config API (dbBackend: 'supabase' or 'netlify-blobs')

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

## NEXT BUILD SESSION (Phase 7)

- [ ] Custom domain support per client (CNAME white-label)
- [ ] Real-time notifications (webhook → dashboard)
- [ ] Rate limiting per plan tier
- [ ] Team chat / notes per client
- [ ] AI auto-caption improvements (tone, hashtag gen)
- [ ] Multi-user roles (editor, viewer, approver)
- [ ] Bulk actions on queue (select multiple → delete/publish/reschedule)
- [ ] Post duplication (clone existing post)
- [ ] Webhook integrations (Zapier, n8n, Make)

---

## ENV VARS

**Set:** ADMIN_KEY, META_APP_ID, META_APP_SECRET, GITHUB_TOKEN, JWT_SECRET, ENCRYPTION_KEY, ANTHROPIC_API_KEY, RESEND_API_KEY

**Need:** SUPABASE_URL, SUPABASE_ANON_KEY, TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_STARTER, STRIPE_PRICE_AGENCY, STRIPE_PRICE_AGENCY_PRO, PINTEREST_APP_ID, PINTEREST_APP_SECRET
