# Grid Social — Current TODO

**Last updated:** 24 March 2026 (Phase 3 complete + dashboard UI + Stripe + email)

---

## STATUS SUMMARY

| Phase | Status | Key Deliverables |
|-------|--------|-----------------|
| Phase 1 | ✅ DEPLOYED | Backend split, AES-256 encryption, Vite frontend, parallel publishing, retry, rate limiting |
| Phase 2 | ✅ DEPLOYED | Client connect portal, JWT invite links, token health monitor, Meta OAuth portal flow, CI |
| Phase 3 | ✅ DEPLOYED | LinkedIn OAuth, approval workflows (3 modes), Meta review prep, privacy/terms pages, data deletion callback |
| Phase 3b | ✅ DEPLOYED | Dashboard approval UI (badges, mode dropdown, compose warning), Stripe checkout+webhook, email notifications, app icon |
| Phase 4 | 🔲 TODO | Platform expansion, carousel posts, Stripe product setup, LinkedIn token refresh |

---

## COMPLETED ✅ (This Session)

- [x] Meta App Settings configured:
  - [x] Privacy Policy URL set
  - [x] Terms of Service URL set
  - [x] Data Deletion Callback URL set
- [x] App icon created (1024×1024 PNG) — `frontend/public/app-icon-1024.png`
- [x] Invite link modal UX fix (copy button, selectable input)
- [x] Approval link button added to Clients tab
- [x] LinkedIn OAuth full flow (linkedin-auth.mjs, linkedin-callback.mjs)
- [x] Approval workflows backend (auto/manual/passive modes)
- [x] Client approval portal (/approve?token=...) with approve/reject/comment
- [x] Dashboard: approval status badges in Queue tab
- [x] Dashboard: client feedback shown on rejected posts
- [x] Dashboard: Publish button disabled for unapproved posts
- [x] Dashboard: approval mode dropdown per client
- [x] Dashboard: approval warning in Compose tab
- [x] Dashboard: client email field in client modal
- [x] Stripe checkout endpoint (stripe-checkout.mjs)
- [x] Stripe webhook handler (stripe-webhook.mjs)
- [x] Email notification module (lib/email.mjs) with Resend API
- [x] Email: admin notified when client approves/rejects posts
- [x] Scheduler: approval gate + passive auto-approve

---

## IMMEDIATE — YOUR MANUAL ACTIONS

### 1. Upload App Icon to Meta
- [ ] Go to https://developers.facebook.com/apps/1576303166762174/settings/basic/
- [ ] Upload `grid-social-icon-1024.png` as the App Icon
- [ ] Set Category to "Business and Pages"

### 2. Meta App Review — Record & Submit
- [x] ~~Privacy/Terms/Deletion URLs~~ DONE
- [x] ~~App icon~~ DONE
- [ ] Upload app icon to Meta console
- [ ] Record screencasts showing each permission in use
- [ ] Submit review for all 6 permissions
- [ ] Wait 1-5 business days

### 3. DNS — connect.gridsocial.co.uk
- [ ] CNAME: `connect` → `grid-social-autoposter.netlify.app`
- [ ] Add custom domain in Netlify
- [ ] Test: `https://connect.gridsocial.co.uk/connect`

### 4. LinkedIn OAuth App
- [ ] Register at developer.linkedin.com
- [ ] Request Community Management API
- [ ] Redirect URL: `https://grid-social-autoposter.netlify.app/api/linkedin-callback`
- [ ] Add `LINKEDIN_CLIENT_ID` + `LINKEDIN_CLIENT_SECRET` to Netlify

### 5. Stripe Setup
- [ ] Create products: Starter £15, Agency £59, Agency Pro £119
- [ ] Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` to Netlify
- [ ] Webhook URL: `https://grid-social-autoposter.netlify.app/api/stripe-webhook`

### 6. Resend Email Setup
- [ ] Sign up resend.com (free 100/day)
- [ ] Verify gridsocial.co.uk domain
- [ ] Add `RESEND_API_KEY` to Netlify

---

## NEXT BUILD SESSION

- [ ] LinkedIn token auto-refresh (7 days before 60-day expiry)
- [ ] Dashboard Billing tab (show plan, upgrade/downgrade via Stripe checkout)
- [ ] TikTok OAuth + connect button
- [ ] Google Business Profile OAuth + connect button
- [ ] Carousel/multi-image posts (FB + IG)
- [ ] Threads API integration
- [ ] Bluesky (AT Protocol, app password)
- [ ] Email: notify client when posts need approval
- [ ] Analytics: pull engagement metrics from platform APIs

---

## HOUSEKEEPING

- [ ] Google Search Console verify
- [ ] IG switch to Business account
- [ ] ImprovMX hello@gridsocial.co.uk
- [ ] Case study — Sorn Handyman results
- [ ] Twitter/X — regenerate Read+Write token when ready

---

## ENV VARS ON NETLIFY

**Set:** ADMIN_KEY, META_APP_ID, META_APP_SECRET, GITHUB_TOKEN, JWT_SECRET, ENCRYPTION_KEY

**Need:** LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_STARTER, STRIPE_PRICE_AGENCY, STRIPE_PRICE_AGENCY_PRO, RESEND_API_KEY
