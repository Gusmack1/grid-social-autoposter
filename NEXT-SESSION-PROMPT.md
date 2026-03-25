# Grid Social Auto-Poster — Next Session (Phase 7)

## OVERVIEW

Phases 1–6 deployed and live. Clone: github.com/Gusmack1/grid-social-autoposter
Read: TODO.md for full status.

**What's live:** 9-platform publishing (FB, IG, Threads, Bluesky, X, TikTok, LinkedIn, GBP, Pinterest), white-label branding, content calendar, CSV bulk import, advanced analytics with Recharts, carousel posts, approval workflows, token health monitor, billing tab, post preview, post templates, drag-and-drop queue reordering, analytics PDF export.

**Supabase ready:** Schema + adapter built. Set SUPABASE_URL + SUPABASE_ANON_KEY env vars → auto-switches from Netlify Blobs. Run migration via admin API.

**4 clients active.** ~30 posts queued for Grid Social.

---

## AGENT 1 — BROWSER TASKS (Claude in Chrome + Desktop Commander)

Do these in order. You have full Chrome access.

### 1. Set up Supabase
- supabase.com → Create new project (free tier, region: eu-west-2)
- SQL Editor → paste supabase-schema.sql → Run
- Settings → API → copy SUPABASE_URL + SUPABASE_ANON_KEY
- Add both to Netlify env vars (site ID: ef9558f4-0fd0-4656-a785-82e5fcb4e7f7)
- Trigger: POST /api/admin?action=migrate-to-supabase (use admin key)
- Verify data in Supabase Table Editor

### 2. Resend domain verification
- Navigate to resend.com/domains
- Add domain: gridsocial.co.uk
- Add DNS records (MX, TXT, DKIM) at the DNS provider
- Go back to Resend and click Verify

### 3. Check Meta Business Verification status
- Navigate to business.facebook.com → Security Centre
- If approved: start Access Verification at developers.facebook.com/apps/1576303166762174/verification/
- Upload app icon at developers.facebook.com/apps/1576303166762174/settings/basic/

### 4. LinkedIn app registration
- developer.linkedin.com → Create app "Grid Social"
- Request Community Management API
- Redirect: https://grid-social-autoposter.netlify.app/api/linkedin-callback
- Add LINKEDIN_CLIENT_ID + SECRET to Netlify

### 5. Stripe setup
- dashboard.stripe.com → Create 3 products: Starter £15/mo, Agency £59/mo, Agency Pro £119/mo
- Webhook: https://grid-social-autoposter.netlify.app/api/stripe-webhook
- Events: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted
- Add all keys to Netlify env vars

### 6. Pinterest developer app
- developers.pinterest.com → Create app → request Pins API
- Redirect: https://grid-social-autoposter.netlify.app/api/pinterest-callback
- Add PINTEREST_APP_ID + PINTEREST_APP_SECRET to Netlify

### 7. connect.gridsocial.co.uk subdomain
- DNS provider: CNAME connect → grid-social-autoposter.netlify.app
- Netlify: Domain management → Add custom domain: connect.gridsocial.co.uk

---

## AGENT 2 — CODE TASKS

Clone: github.com/Gusmack1/grid-social-autoposter
Read: TODO.md

### 1. Custom domain support per client
- Allow clients to CNAME their own domain to the connect portal
- Netlify: branch deploys or domain aliases per client
- Store custom domain in client record, serve correct branding

### 2. Rate limiting per plan tier
- Map plan → limits (free: 30 posts/mo, starter: 300, agency: 1500, pro: unlimited)
- Check limit on post creation + bulk import
- Show usage vs limit in dashboard

### 3. Multi-user roles
- Add 'editor' and 'viewer' roles alongside 'admin' and 'member'
- Editor: can compose/edit but not publish
- Viewer: read-only access to queue/analytics
- Role picker in team management

### 4. Bulk queue actions
- Checkbox select on queue items
- Bulk delete, bulk publish, bulk reschedule
- "Select All" toggle

### 5. Post duplication
- "Duplicate" button on queue and published posts
- Copies caption, platforms, postType, imageUrl into new draft

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

- Supabase: [set up / not yet]
- Meta Business Verification: [approved / still pending / rejected]
- Meta App icon: [uploaded / not yet]
- Resend domain: [verified / not yet]
- connect.gridsocial.co.uk: [DNS set / not yet]
- LinkedIn app: [registered / not yet]
- Stripe: [products created / not yet]
- Pinterest app: [registered / not yet]
