# Grid Social Auto-Poster — Next Session (Phase 6)

## OVERVIEW

Phases 1–5 deployed and live. Clone: github.com/Gusmack1/grid-social-autoposter
Read: TODO.md for full status.

**What's live:** 9-platform publishing (FB, IG, Threads, Bluesky, X, TikTok, LinkedIn, GBP, Pinterest), white-label branding, content calendar, CSV bulk import, advanced analytics with Recharts, carousel posts, approval workflows, token health monitor, billing tab.

**4 clients active.** ~30 posts queued for Grid Social.

---

## AGENT 1 — BROWSER TASKS (Claude in Chrome + Desktop Commander)

Do these in order. You have full Chrome access.

### 1. Resend domain verification
- Navigate to resend.com/domains
- Add domain: gridsocial.co.uk
- Add DNS records (MX, TXT, DKIM) at the DNS provider
- Go back to Resend and click Verify

### 2. Check Meta Business Verification status
- Navigate to business.facebook.com → Security Centre
- If approved: start Access Verification at developers.facebook.com/apps/1576303166762174/verification/
- Upload app icon at developers.facebook.com/apps/1576303166762174/settings/basic/

### 3. LinkedIn app registration
- developer.linkedin.com → Create app "Grid Social"
- Request Community Management API
- Redirect: https://grid-social-autoposter.netlify.app/api/linkedin-callback
- Add LINKEDIN_CLIENT_ID + SECRET to Netlify (site ID: ef9558f4-0fd0-4656-a785-82e5fcb4e7f7)

### 4. Stripe setup
- dashboard.stripe.com → Create 3 products: Starter £15/mo, Agency £59/mo, Agency Pro £119/mo
- Webhook: https://grid-social-autoposter.netlify.app/api/stripe-webhook
- Events: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted
- Add all keys to Netlify env vars

### 5. Pinterest developer app
- developers.pinterest.com → Create app → request Pins API
- Redirect: https://grid-social-autoposter.netlify.app/api/pinterest-callback
- Add PINTEREST_APP_ID + PINTEREST_APP_SECRET to Netlify

### 6. connect.gridsocial.co.uk subdomain
- DNS provider: CNAME connect → grid-social-autoposter.netlify.app
- Netlify: Domain management → Add custom domain: connect.gridsocial.co.uk

---

## AGENT 2 — CODE TASKS

Clone: github.com/Gusmack1/grid-social-autoposter
Read: TODO.md

### 1. Supabase migration
- Set up Supabase project (free tier)
- Create tables: clients, posts, users, history
- Update lib/db/index.mjs to use Supabase client instead of Netlify Blobs
- Migrate existing data
- Add SUPABASE_URL + SUPABASE_ANON_KEY to Netlify env vars

### 2. Post preview
- New PostPreview component (shows how post will look on FB/IG/X etc)
- Add preview toggle button in compose section
- Platform-specific formatting (character limits, image crops)

### 3. Post templates
- Save/load templates (caption template + default platforms + post type)
- Template picker in compose section
- Store in Supabase/Blobs

### 4. Drag-and-drop queue reordering
- Add drag handles to queue items
- Update post order in backend on reorder

### 5. Export analytics as PDF
- Generate PDF report from analytics data (summary + charts + engagement table)
- Download button in analytics tab

Push everything. Update TODO.md. Create NEXT-SESSION-PROMPT.md.

---

## CREDENTIALS

- GitHub token: [stored in Claude memory]
- Admin key: gridsocial2026!
- Meta App ID: 1576303166762174
- Dashboard login: gus@gridsocial.co.uk / GridSocial2026!
- Dashboard URL: https://grid-social-autoposter.netlify.app (or gridsocial.co.uk/manage)
- Netlify site ID: ef9558f4-0fd0-4656-a785-82e5fcb4e7f7
- Resend API key: [stored in Netlify env vars]

## WHAT I'VE DONE MANUALLY (update before pasting)

- Meta Business Verification: [approved / still pending / rejected]
- Meta App icon: [uploaded / not yet]
- Resend domain: [verified / not yet]
- connect.gridsocial.co.uk: [DNS set / not yet]
- LinkedIn app: [registered / not yet]
- Stripe: [products created / not yet]
- Pinterest app: [registered / not yet]
