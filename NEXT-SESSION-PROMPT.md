# Grid Social Auto-Poster — Next Session (Phase 8)

## OVERVIEW

Phases 1–7 deployed and live. Clone: github.com/Gusmack1/grid-social-autoposter
Read: TODO.md for full status.

**What's live:** 9-platform publishing (FB, IG, Threads, Bluesky, X, TikTok, LinkedIn, GBP, Pinterest), white-label branding, content calendar, CSV bulk import, advanced analytics with Recharts, carousel posts, approval workflows, token health monitor, billing tab, post preview, post templates, drag-and-drop queue reordering, analytics PDF export, rate limiting per plan tier, multi-user roles (admin/member/editor/viewer), bulk queue actions (select/delete/publish/reschedule), post duplication, custom domain support field.

**Supabase ready:** Schema + adapter built. Set SUPABASE_URL + SUPABASE_ANON_KEY env vars → auto-switches from Netlify Blobs. Run migration via admin API.

**4 clients active.** ~30 posts queued for Grid Social.

**Plan tiers enforced:** Free (30 posts/mo, 3 clients), Starter (300/10), Agency (1500/25), Agency Pro (unlimited/50).

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

### 1. Real-time notifications
- Webhook endpoint for outgoing events (post published, post failed, approval needed)
- Dashboard notification bell with unread count
- Store notifications in DB, mark as read

### 2. Team chat / notes per client
- Notes/comments system attached to each client
- Threaded discussion between team members
- New DB table: client_notes (id, clientId, userId, message, createdAt)

### 3. AI auto-caption improvements
- Tone selector (professional, casual, humorous, Scottish)
- Hashtag generator (platform-aware count)
- Image analysis via Claude Vision (describe uploaded image, suggest caption)

### 4. Webhook integrations
- Outgoing webhooks: configurable per client (URL + events)
- Fire webhook on: post_published, post_failed, approval_requested
- Webhook log viewer in dashboard

### 5. Client-facing analytics dashboard
- Public/shareable link (signed JWT, read-only)
- Branded with client's white-label settings
- Shows last 30 days analytics, published posts, engagement

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
