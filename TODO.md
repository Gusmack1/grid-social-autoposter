# Grid Social — Current TODO

**Last updated:** 24 March 2026 (Phase 3b complete)

---

## STATUS SUMMARY

| Phase | Status | Key Deliverables |
|-------|--------|-----------------|
| Phase 1 | ✅ DEPLOYED | Backend split, AES-256 encryption, Vite frontend, parallel publishing, retry, rate limiting |
| Phase 2 | ✅ DEPLOYED | Client connect portal, JWT invite links, token health monitor, Meta OAuth portal flow, CI |
| Phase 3 | ✅ DEPLOYED | LinkedIn OAuth, approval workflows (3 modes), Meta review prep, privacy/terms/deletion all live |
| Phase 3b | ✅ DEPLOYED | Dashboard approval UI, Stripe checkout+webhook, email notifications (Resend), app icon |
| Phase 4 | 🔲 TODO | Meta App Review submit, LinkedIn app, Stripe setup, platform expansion |

---

## YOUR MANUAL ACTIONS (priority order)

### 1. Meta App Review — Submit
- [x] Privacy Policy URL set on Meta console
- [x] Terms of Service URL set on Meta console
- [x] Data Deletion Callback URL set on Meta console
- [x] App icon created (1024×1024)
- [ ] **Upload app icon** to Meta developer console → Settings → Basic
- [ ] Set Category to "Business and Pages"
- [ ] Record screencasts (see META-APP-REVIEW-GUIDE.md)
- [ ] Submit review for 6 permissions
- [ ] Wait 1-5 business days

### 2. connect.gridsocial.co.uk Subdomain
- [ ] CNAME: `connect` → `grid-social-autoposter.netlify.app`
- [ ] Add custom domain in Netlify dashboard
- [ ] Verify SSL auto-provisions

### 3. LinkedIn OAuth App
- [ ] Register at developer.linkedin.com
- [ ] Request Community Management API
- [ ] Redirect URL: `https://grid-social-autoposter.netlify.app/api/linkedin-callback`
- [ ] Add `LINKEDIN_CLIENT_ID` + `LINKEDIN_CLIENT_SECRET` to Netlify env vars

### 4. Stripe Products
- [ ] Create Stripe account (or use existing)
- [ ] Create products: Starter £15/mo, Agency £59/mo, Agency Pro £119/mo
- [ ] Add `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` to Netlify
- [ ] Webhook URL: `https://grid-social-autoposter.netlify.app/api/stripe-webhook`

### 5. Resend Email
- [ ] Sign up resend.com (free: 100 emails/day)
- [ ] Verify gridsocial.co.uk domain
- [ ] Add `RESEND_API_KEY` to Netlify

---

## NEXT BUILD SESSION

### Code work
- [ ] LinkedIn token auto-refresh (7 days before 60-day expiry)
- [ ] Dashboard Billing tab (plan display, upgrade via Stripe checkout)
- [ ] TikTok OAuth + connect button + posting
- [ ] Google Business Profile OAuth + connect button + local posts
- [ ] Carousel/multi-image posts (FB + IG)
- [ ] Threads API integration
- [ ] Bluesky AT Protocol integration
- [ ] Email: notify client when new posts need approval
- [ ] Analytics: pull engagement metrics from platform APIs

### Browser tasks (for agent with Claude in Chrome)
- [ ] Meta App Review: navigate console, upload icon, fill in descriptions, submit
- [ ] LinkedIn: register app, request API access, grab credentials
- [ ] Stripe: create products/prices, configure webhook, grab keys
- [ ] Resend: sign up, verify domain, grab API key
- [ ] DNS: add CNAME record for connect.gridsocial.co.uk

---

## HOUSEKEEPING

- [ ] Google Search Console verify gridsocial.co.uk
- [ ] IG switch to Business account
- [ ] ImprovMX hello@gridsocial.co.uk alias
- [ ] Case study — Sorn Handyman results
- [ ] Twitter/X — regenerate Read+Write token when ready

---

## ENV VARS

**Set:** ADMIN_KEY, META_APP_ID, META_APP_SECRET, GITHUB_TOKEN, JWT_SECRET, ENCRYPTION_KEY

**Need:** LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_STARTER, STRIPE_PRICE_AGENCY, STRIPE_PRICE_AGENCY_PRO, RESEND_API_KEY
