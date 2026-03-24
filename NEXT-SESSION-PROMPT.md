# Grid Social Auto-Poster — Multi-Agent Session

## OVERVIEW

Phases 1–4b are deployed and live. Clone the repo: github.com/Gusmack1/grid-social-autoposter
Read: TODO.md for full status.

**What's live:** Backend split (18 lib modules), AES-256-GCM token encryption, Vite+React frontend, parallel publishing across 8 platforms (FB, IG, Threads, Bluesky, X, LinkedIn, TikTok, GBP), 3x retry, approval workflows, client connect portal, token health monitor, analytics dashboard, carousel posts, billing tab.

**4 clients active.** All FB/IG tokens healthy. ~30 posts queued for Grid Social.

---

## AGENT 1 — BROWSER TASKS (Claude in Chrome + Desktop Commander)

Do these in order. You have full Chrome access.

### 1. Resend domain verification
- Navigate to resend.com/domains
- Add domain: gridsocial.co.uk
- It will show DNS records (MX, TXT, DKIM) to add
- Navigate to the DNS provider for gridsocial.co.uk and add the records
- Go back to Resend and click Verify

### 2. Check Meta Business Verification status
- Navigate to business.facebook.com → Settings → Security Centre
- Check if "A MACKAY (PUBLISHER) LTD" verification is approved (submitted 24/3/26, ~2 working days)
- If approved: go to developers.facebook.com/apps/1576303166762174/verification/ → start Access Verification
- If still pending: skip, come back next session

### 3. Upload Meta app icon
- Navigate to developers.facebook.com/apps/1576303166762174/settings/basic/
- Download icon from: https://raw.githubusercontent.com/Gusmack1/grid-social-autoposter/main/frontend/public/app-icon-1024.png
- Upload to the "App icon (1024 x 1024)" area
- Save

### 4. LinkedIn app registration
- Navigate to developer.linkedin.com → Create app
- App name: "Grid Social"
- LinkedIn Page: Grid Social (linkedin.com/company/grid-social or create one)
- Request "Community Management API" product
- Auth redirect: https://grid-social-autoposter.netlify.app/api/linkedin-callback
- Copy Client ID + Client Secret
- Add to Netlify env vars: LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET

### 5. Stripe setup
- Navigate to dashboard.stripe.com
- Create 3 products: Starter £15/mo, Agency £59/mo, Agency Pro £119/mo
- Copy price IDs
- Create webhook endpoint: https://grid-social-autoposter.netlify.app/api/stripe-webhook
- Events: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted
- Add to Netlify env vars: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_STARTER, STRIPE_PRICE_AGENCY, STRIPE_PRICE_AGENCY_PRO

### 6. connect.gridsocial.co.uk subdomain
- Navigate to DNS provider for gridsocial.co.uk
- Add CNAME: connect → grid-social-autoposter.netlify.app
- Navigate to app.netlify.com → grid-social-autoposter → Domain management → Add custom domain: connect.gridsocial.co.uk

### Adding Netlify env vars
Use the Netlify MCP tool:
- Site ID: ef9558f4-0fd0-4656-a785-82e5fcb4e7f7
- Operation: manage-env-vars with upsertEnvVar: true, envVarIsSecret: true

---

## AGENT 2 — CODE TASKS (Computer tools)

Clone repo: github.com/Gusmack1/grid-social-autoposter
Read: TODO.md

### 1. White-label support
- Add per-client branding fields to admin.mjs (logoUrl, brandColor, brandName)
- Update connect-portal.mjs and approval-portal.mjs to use client branding
- Update dashboard client modal with branding fields

### 2. Content calendar view
- New "Calendar" tab in dashboard
- Monthly grid showing scheduled/queued/published posts
- Click day to see posts, click to edit/reschedule

### 3. Bulk post import
- CSV upload: date, caption, imageUrl, platforms, postType
- Parse and queue all posts for selected client
- Add to compose section as "Import CSV" button

### 4. Advanced analytics
- Per-post engagement: pull likes/comments/shares from FB+IG Graph API
- Add to analytics tab as table: post, date, reach, engagement, clicks
- Recharts line chart for engagement over time

### 5. Pinterest OAuth + posting
- pinterest-auth.mjs + pinterest-callback.mjs (follow LinkedIn pattern)
- lib/platforms/pinterest.mjs (Create Pin API)
- Update publisher, connect portal, constants, PlatformIcon

Push all changes. Update TODO.md. Create NEXT-SESSION-PROMPT.md.

---

## CREDENTIALS

- GitHub token: [stored in Claude memory]
- Admin key: gridsocial2026!
- Meta App ID: 1576303166762174
- Dashboard login: gus@gridsocial.co.uk / GridSocial2026!
- Dashboard URL: https://grid-social-autoposter.netlify.app (or gridsocial.co.uk/manage)
- Netlify site ID: ef9558f4-0fd0-4656-a785-82e5fcb4e7f7
- Resend API key: [stored in Claude memory + Netlify env vars]

## WHAT I'VE DONE MANUALLY (update before pasting)

- Meta Business Verification: [approved / still pending / rejected]
- Meta App icon: [uploaded / not yet]
- Resend domain: [verified / not yet]
- connect.gridsocial.co.uk: [DNS set / not yet]
- LinkedIn app: [registered / not yet]
- Stripe: [products created / not yet]
