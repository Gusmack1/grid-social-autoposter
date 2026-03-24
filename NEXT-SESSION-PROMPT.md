# Grid Social Auto-Poster — Next Session

## INSTRUCTIONS FOR THIS SESSION

You have access to Claude in Chrome (browser automation), Desktop Commander (local filesystem), and all standard tools. Use them ALL. Work in parallel — while code builds, use the browser for manual tasks. Move fast. Don't ask for confirmation on routine steps.

**Browser tasks to do FIRST (these unblock everything):**
1. Navigate to https://developers.facebook.com/apps/1576303166762174/settings/basic/ — upload the app icon from the repo (frontend/public/app-icon-1024.png), set Category to "Business and Pages", save
2. Navigate to https://developer.linkedin.com/ — create a new app called "Grid Social", request Community Management API access, set redirect URL to `https://grid-social-autoposter.netlify.app/api/linkedin-callback`, copy the Client ID and Client Secret
3. Navigate to https://app.netlify.com/ — find the grid-social-autoposter site, go to Site settings → Environment variables, add LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET from step 2
4. Navigate to https://resend.com — sign up or log in, add domain gridsocial.co.uk, verify it, copy the API key
5. Add RESEND_API_KEY to Netlify env vars
6. Navigate to https://dashboard.stripe.com — create 3 products (Starter £15/mo, Agency £59/mo, Agency Pro £119/mo), grab price IDs, set up webhook endpoint https://grid-social-autoposter.netlify.app/api/stripe-webhook, add STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET + STRIPE_PRICE_STARTER + STRIPE_PRICE_AGENCY + STRIPE_PRICE_AGENCY_PRO to Netlify env vars

**Code tasks to do IN PARALLEL:**
Clone the repo: github.com/Gusmack1/grid-social-autoposter
Read: TODO.md

## REPO STATE

Phases 1-4a deployed and live. Key changes since last session:
- `netlify/functions/token-health.mjs` — now auto-refreshes LinkedIn tokens within 7 days of 60-day expiry using refresh_token grant
- `netlify/functions/linkedin-callback.mjs` — now stores refresh_token on all OAuth flows
- `netlify/functions/admin.mjs` — emails client when post added with pending approval status; handles new token fields (threads, bluesky, linkedinRefreshToken)
- `netlify/functions/lib/platforms/threads.mjs` — NEW: Meta Threads API posting (container→wait→publish flow)
- `netlify/functions/lib/platforms/bluesky.mjs` — NEW: AT Protocol posting with app passwords, image upload, facets (URLs/mentions/hashtags), deletion
- `netlify/functions/lib/publisher.mjs` — routes to Threads + Bluesky, Bluesky deletion support
- `frontend/src/App.jsx` — Billing tab with plan comparison grid, Stripe checkout/portal integration, Threads/Bluesky in client modal + platform detection
- `frontend/src/components/PlatformIcon.jsx` — Threads + Bluesky SVG icons
- `frontend/src/constants.js` — Threads + Bluesky in PLATFORMS array + helper links

What's working:
- 4 clients active, all tokens healthy, ~29 posts queued for Grid Social
- AES-256-GCM encrypted tokens, parallel publishing across 8 platforms, 3x retry
- Approval workflows: auto/manual/passive modes with client portal + email notifications
- LinkedIn token auto-refresh (needs LINKEDIN_CLIENT_ID + SECRET to activate)
- Billing tab built (needs STRIPE_SECRET_KEY + price IDs to activate)
- Threads posting ready (needs threadsUserId set on client)
- Bluesky posting ready (needs blueskyIdentifier + blueskyAppPassword set on client)

## BUILD PRIORITIES

### 1. TikTok OAuth + posting
- Register Content Posting API app at developers.tiktok.com
- Create `tiktok-auth.mjs` + `tiktok-callback.mjs` (follow LinkedIn OAuth pattern)
- Update connect-portal.mjs with TikTok connect button
- Wire into publisher (already has placeholder import)
- Add redirects to netlify.toml

### 2. Google Business Profile OAuth + local posts
- Register OAuth app in Google Cloud Console
- Create `gbp-auth.mjs` + `gbp-callback.mjs`
- Implement lib/platforms/google-business.mjs (currently skeleton)
- Update connect-portal.mjs with GBP connect button

### 3. Carousel/multi-image posts
- Facebook: POST /{page-id}/photos for each image, then POST /{page-id}/feed with attached_media array
- Instagram: create container for each image, then carousel container, then publish
- Update compose UI to allow multiple image uploads
- Update post schema to support imageUrls array

### 4. Analytics dashboard
- New "Analytics" tab in dashboard
- Pull engagement metrics from Facebook Insights, Instagram Insights, LinkedIn analytics
- Show: reach, impressions, engagement rate, follower growth
- Chart.js or Recharts for visualization

### 5. Meta App Review submission
If browser access is available:
- Navigate to https://developers.facebook.com/apps/1576303166762174/review/
- For each of the 6 permissions, click Request, fill in usage description, add screencast instructions

## CREDENTIALS

- GitHub token: [stored in Claude memory — do not commit to repo]
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
