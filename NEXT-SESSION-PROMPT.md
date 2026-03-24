# Grid Social Auto-Poster — Next Session

## INSTRUCTIONS FOR THIS SESSION

You have access to Claude in Chrome (browser automation), Desktop Commander (local filesystem), and all standard tools. Use them ALL. Work in parallel — while code builds, use the browser for manual tasks. Move fast. Don't ask for confirmation on routine steps.

**Browser tasks to do FIRST (these unblock everything):**
1. Navigate to https://developers.facebook.com/apps/1576303166762174/settings/basic/ — upload the app icon from the repo (frontend/public/app-icon-1024.png), set Category to "Business and Pages", save
2. Navigate to https://developer.linkedin.com/ — create a new app called "Grid Social", request Community Management API access, set redirect URL to `https://grid-social-autoposter.netlify.app/api/linkedin-callback`, copy the Client ID and Client Secret
3. Navigate to https://app.netlify.com/ — find the grid-social-autoposter site, go to Site settings → Environment variables, add LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET from step 2
4. Navigate to https://resend.com — sign up or log in, add domain gridsocial.co.uk, verify it, copy the API key
5. Add RESEND_API_KEY to Netlify env vars

**Code tasks to do IN PARALLEL:**
Clone the repo: github.com/Gusmack1/grid-social-autoposter
Read: TODO.md, PHASE-3-PROGRESS.md, ROADMAP.md

## REPO STATE

Phases 1-3b deployed and live. Key files:
- `netlify/functions/admin.mjs` — main admin API (clients, posts, approval workflows)
- `netlify/functions/lib/publisher.mjs` — unified platform dispatch
- `netlify/functions/lib/platforms/` — facebook, instagram, twitter, linkedin, google-business, tiktok
- `netlify/functions/lib/email.mjs` — Resend email notifications (templates built)
- `netlify/functions/lib/invites.mjs` — invite + approval token generation
- `netlify/functions/approval-portal.mjs` — client approval page at /approve
- `netlify/functions/connect-portal.mjs` — client OAuth connect page at /connect
- `netlify/functions/linkedin-auth.mjs` + `linkedin-callback.mjs` — LinkedIn OAuth (needs env vars)
- `netlify/functions/stripe-checkout.mjs` + `stripe-webhook.mjs` — Stripe billing (needs env vars)
- `netlify/functions/token-health.mjs` — daily 6am UTC cron checking all tokens
- `netlify/functions/scheduled-post.mjs` — daily 10am UTC publisher with approval gate
- `frontend/src/App.jsx` — main dashboard (approval badges, mode dropdown, link modals)

What's working:
- 4 clients active, all tokens healthy, ~29 posts queued for Grid Social
- AES-256-GCM encrypted tokens, parallel publishing, 3x retry
- Approval workflows: auto/manual/passive modes with client portal
- Admin email notifications on approve/reject (needs RESEND_API_KEY)
- Privacy policy, terms, data deletion callback all live
- Stripe endpoints built (needs STRIPE_SECRET_KEY)
- LinkedIn OAuth flow built (needs LINKEDIN_CLIENT_ID + SECRET)

## BUILD PRIORITIES

### 1. LinkedIn token auto-refresh
Token health monitor (token-health.mjs) already checks LinkedIn tokens daily at 6am UTC and warns when within 7 days of 60-day expiry. Add actual refresh logic:
- Use the refresh token grant: POST https://www.linkedin.com/oauth/v2/accessToken with grant_type=refresh_token
- Store the new token encrypted, update linkedinTokenExpiresAt
- Only refresh when within 7 days of expiry

### 2. Dashboard Billing tab
New "Billing" tab in sidebar. Show:
- Current plan name and status
- Usage: X/Y profiles, X/Y users
- Upgrade buttons that call POST /api/stripe-checkout to create Stripe checkout sessions
- "Manage subscription" link to Stripe customer portal
- Plan comparison table

### 3. Email: notify client when posts need approval
In admin.mjs add-post action, when approvalStatus is 'pending', email the client using their clientEmail field. The function notifyClientPostsReady already exists in lib/email.mjs — just need to generate an approval link and call it.

### 4. Platform expansion
- **TikTok:** Register Content Posting API app, add OAuth flow (tiktok-auth.mjs + tiktok-callback.mjs following same pattern as LinkedIn), wire connect button
- **Google Business Profile:** Register OAuth app in Google Cloud Console, add OAuth flow, wire connect button
- **Carousel posts:** Facebook: POST /{page-id}/photos for each image, then POST /{page-id}/feed with attached_media array. Instagram: create container for each image, then carousel container, then publish
- **Threads:** Uses Meta's Threads API with threads_basic + threads_content_publish permissions. Add lib/platforms/threads.mjs
- **Bluesky:** AT Protocol with app passwords (no OAuth). Add lib/platforms/bluesky.mjs. Simplest integration — just needs identifier + password

### 5. Meta App Review submission
If browser access is available:
- Navigate to https://developers.facebook.com/apps/1576303166762174/review/
- For each of the 6 permissions, click Request, fill in usage description, add screencast instructions
- Note: screencasts may need to be recorded separately by the user

## CREDENTIALS

- GitHub token: <YOUR_GITHUB_PAT_FROM_MEMORY>
- Admin key: gridsocial2026!
- Meta App ID: 1576303166762174
- Dashboard login: gus@gridsocial.co.uk / GridSocial2026!
- Dashboard URL: https://grid-social-autoposter.netlify.app (or gridsocial.co.uk/manage)

## WHAT I'VE DONE MANUALLY (update before pasting)

- Meta App Review: [submitted / pending / approved / not started]
- connect.gridsocial.co.uk: [DNS set up / not yet]
- LinkedIn app: [registered / not yet]
- Stripe account: [products created / not yet]
- Resend email: [domain verified / not yet]

Push all changes to GitHub when done. Update TODO.md. Give me a prompt for the next session.
