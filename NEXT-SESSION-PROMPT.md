Phases 1-3 of the Grid Social auto-poster are deployed and live. Clone the repo (github.com/Gusmack1/grid-social-autoposter) and read TODO.md, PHASE-3-PROGRESS.md, and ROADMAP.md to get up to speed.

What's done:
* Phase 1: Backend split into 4 entry points + 18 shared lib modules. AES-256-GCM token encryption. Vite+React frontend (55KB). Parallel publishing, 3x retry, rate limiting, structured logging.
* Phase 2: Client connect portal at /connect with JWT invite links. Token health monitor (daily 6am cron). Meta OAuth for client portal. GitHub Actions CI.
* Phase 3: LinkedIn OAuth full flow (needs LINKEDIN_CLIENT_ID + LINKEDIN_CLIENT_SECRET env vars). Approval workflows with 3 modes (auto/manual/passive) — client approval portal at /approve with magic links. Meta App Review prep all live (privacy.html, terms.html, meta-deletion.mjs, app icon). Dashboard: approval badges in Queue, mode dropdown per client, compose warning, client email field. Stripe checkout + webhook endpoints built (need STRIPE_SECRET_KEY). Email notifications via Resend (need RESEND_API_KEY). Admin gets email when client approves/rejects.
* 4 clients active. ~29 posts queued for Grid Social. All tokens healthy.

What I've done manually since last session (update these):
* Meta App Review: [submitted / pending / approved / not started]
* connect.gridsocial.co.uk subdomain: [set up / not yet]
* LinkedIn developer app: [registered / not yet]
* Stripe account: [set up with products / not yet]
* Resend email: [set up / not yet]

Build priorities for this session (work fast, use multiple agents, build in parallel):

1. **LinkedIn token auto-refresh** — Background function that checks linkedinTokenExpiresAt daily (already in token-health.mjs) and refreshes tokens 7 days before 60-day expiry using the refresh token grant. Update token-health.mjs.

2. **Dashboard Billing tab** — New sidebar tab. Show current plan and usage (profiles count vs limit, users count vs limit). Upgrade/downgrade buttons that call POST /api/stripe-checkout to create checkout sessions. Link to Stripe customer portal. Plan info from GET /api/stripe-checkout?action=plans.

3. **Platform expansion** — TikTok Content Posting API OAuth flow + connect button (skeleton exists in lib/platforms/tiktok.mjs). Google Business Profile OAuth + connect button (skeleton in lib/platforms/google-business.mjs). Carousel/multi-image support for Facebook (POST /{page-id}/photos with multiple attached_media) and Instagram (carousel container endpoint).

4. **Email: notify client on post creation** — When posts are added in manual/passive mode via admin.mjs add-post action, email the client (using their clientEmail field) with their approval link. Module exists at lib/email.mjs with notifyClientPostsReady function already built.

5. **Threads + Bluesky** — Threads uses Meta's Threads API (same app, different permissions: threads_basic, threads_content_publish). Bluesky uses AT Protocol with app passwords (no OAuth needed — simplest integration). Add lib/platforms/threads.mjs and lib/platforms/bluesky.mjs, wire into publisher.mjs, add to connect portal.

Push all changes to GitHub when done. Create an updated TODO.md. Give me a prompt for the next session.
