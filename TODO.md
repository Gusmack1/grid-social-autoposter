# Grid Social — Current TODO

**Last updated:** 24 March 2026 (Phase 4b complete)

---

## STATUS SUMMARY

| Phase | Status | Key Deliverables |
|-------|--------|-----------------|
| Phase 1 | ✅ DEPLOYED | Backend split, AES-256 encryption, Vite frontend, parallel publishing, retry, rate limiting |
| Phase 2 | ✅ DEPLOYED | Client connect portal, JWT invite links, token health monitor, Meta OAuth portal flow, CI |
| Phase 3 | ✅ DEPLOYED | LinkedIn OAuth, approval workflows (3 modes), Meta review prep, privacy/terms/deletion all live |
| Phase 3b | ✅ DEPLOYED | Dashboard approval UI, Stripe checkout+webhook, email notifications (Resend), app icon |
| Phase 4a | ✅ DEPLOYED | LinkedIn auto-refresh, Billing tab, Threads + Bluesky platforms, post approval emails |
| Phase 4b | ✅ BUILT | TikTok OAuth, GBP OAuth, carousel posts, analytics dashboard+API, connect portal updates |
| Phase 5 | 🔲 TODO | White-label, advanced analytics, Pinterest, multi-user permissions |

---

## COMPLETED THIS SESSION (Phase 4b)

- [x] TikTok OAuth flow (tiktok-auth.mjs + tiktok-callback.mjs)
- [x] Google Business Profile OAuth flow (gbp-auth.mjs + gbp-callback.mjs)
- [x] GBP inline token refresh (Google tokens expire in 1h — auto-refresh before posting)
- [x] Connect portal updated: TikTok + GBP buttons enabled when env vars set
- [x] Connect portal status page: shows Threads + Bluesky connection status
- [x] Carousel/multi-image posts: Facebook (unpublished photos + attached_media) + Instagram (item containers + carousel container)
- [x] Publisher updated with carousel routing + fallback to single image for non-carousel platforms
- [x] Carousel post type added to frontend constants
- [x] Dashboard compose UI: carousel image URL inputs (add/remove, up to 10)
- [x] Analytics API endpoint (analytics.mjs) — post history stats + Facebook/Instagram insights
- [x] Dashboard Analytics tab — summary cards, platform insights, platform breakdown, publishing activity chart
- [x] Token health monitor: TikTok auto-refresh + GBP auto-refresh added
- [x] Admin API: imageUrls field stored on add-post and post-now actions
- [x] Scheduled post: hasAnyToken check updated for Threads + Bluesky
- [x] netlify.toml: TikTok, GBP, analytics redirects added

---

## YOUR MANUAL ACTIONS (priority order)

### 1. Meta App Review — Submit
- [x] Privacy Policy URL set on Meta console
- [x] Terms of Service URL set on Meta console
- [x] Data Deletion Callback URL set on Meta console
- [x] App icon created (1024×1024)
- [ ] **Upload app icon** to Meta developer console → Settings → Basic
- [ ] Set Category to "Business and Pages" ✅ already done
- [ ] Become a Tech Provider (required for App Review)
- [ ] Record screencasts (see META-APP-REVIEW-GUIDE.md)
- [ ] Submit review for 6 permissions
- [ ] Wait 1-5 business days

### 2. connect.gridsocial.co.uk Subdomain
- [ ] CNAME: `connect` → `grid-social-autoposter.netlify.app`
- [ ] Add custom domain in Netlify dashboard
- [ ] Verify SSL auto-provisions

### 3. TikTok Developer App
- [ ] Register at developers.tiktok.com
- [ ] Create app, request Content Posting API
- [ ] Redirect URL: `https://grid-social-autoposter.netlify.app/api/tiktok-callback`
- [ ] Add `TIKTOK_CLIENT_KEY` + `TIKTOK_CLIENT_SECRET` to Netlify env vars

### 4. Google Cloud Console (for GBP)
- [ ] Create OAuth app in Google Cloud Console
- [ ] Enable Google Business Profile API
- [ ] Redirect URL: `https://grid-social-autoposter.netlify.app/api/gbp-callback`
- [ ] Add `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` to Netlify env vars

### 5. LinkedIn OAuth App
- [ ] Register at developer.linkedin.com
- [ ] Request Community Management API
- [ ] Redirect URL: `https://grid-social-autoposter.netlify.app/api/linkedin-callback`
- [ ] Add `LINKEDIN_CLIENT_ID` + `LINKEDIN_CLIENT_SECRET` to Netlify env vars

### 6. Stripe Products
- [ ] Create products: Starter £15/mo, Agency £59/mo, Agency Pro £119/mo
- [ ] Add `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` to Netlify
- [ ] Add `STRIPE_PRICE_STARTER` + `STRIPE_PRICE_AGENCY` + `STRIPE_PRICE_AGENCY_PRO` to Netlify
- [ ] Webhook URL: `https://grid-social-autoposter.netlify.app/api/stripe-webhook`

### 7. Resend Email
- [ ] Sign up resend.com (free: 100 emails/day)
- [ ] Verify gridsocial.co.uk domain
- [ ] Add `RESEND_API_KEY` to Netlify

---

## NEXT BUILD SESSION

### Code work
- [ ] White-label: custom branding per client (logo, colors, domain)
- [ ] Pinterest OAuth + posting
- [ ] Advanced analytics: per-post engagement metrics (likes, comments, shares)
- [ ] Analytics charts with Recharts or Chart.js
- [ ] Multi-user client permissions refinement
- [ ] Bulk post import (CSV upload)
- [ ] Content calendar view (monthly grid)

---

## ENV VARS

**Set:** ADMIN_KEY, META_APP_ID, META_APP_SECRET, GITHUB_TOKEN, JWT_SECRET, ENCRYPTION_KEY

**Need:** TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_STARTER, STRIPE_PRICE_AGENCY, STRIPE_PRICE_AGENCY_PRO, RESEND_API_KEY
