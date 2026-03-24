Phases 1-3 of the Grid Social auto-poster are deployed and live. Clone the repo (github.com/Gusmack1/grid-social-autoposter) and read TODO.md, PHASE-3-PROGRESS.md, and ROADMAP.md to get up to speed.

What's done:
* Phase 1: Backend split into 4 entry points + 18 shared lib modules. AES-256-GCM token encryption. Vite+React frontend (55KB). Parallel publishing, 3x retry, rate limiting, structured logging.
* Phase 2: Client connect portal at /connect with JWT invite links. Token health monitor (daily 6am cron). Meta OAuth for client portal. GitHub Actions CI.
* Phase 3: LinkedIn OAuth full flow (auth + callback + org picker — needs LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET env vars set after app registration). Approval workflows with 3 modes (auto/manual/passive) — client approval portal at /approve with magic links. Meta App Review prep (privacy.html, terms.html, meta-deletion.mjs data callback all live). Invite link modal UX (copy button, selectable input).
* 4 clients active (Sorn Handyman, Food Foodie World, Gus, Grid Social). ~29 posts queued for Grid Social. All tokens healthy.

What I've done manually since last session (update if applicable):
* [Meta App Review: submitted / pending / approved / not started yet]
* [connect.gridsocial.co.uk subdomain: set up / not yet]
* [LinkedIn developer app: registered / not yet]

Build priorities for this session (work fast, use multiple agents, build in parallel):

1. **Dashboard UI for approval workflows** — Queue tab needs approval status badges (pending=amber, approved=green, changes_requested=red) on each post card. Posts with client feedback should show the comment. Clients tab needs an approval mode dropdown (auto/manual/passive) per client that calls PUT /api/admin?action=set-approval-mode. Compose tab should warn when selected client is in manual/passive mode.

2. **Stripe billing integration** — Create stripe-webhook.mjs handler for subscription events. Create stripe-checkout.mjs for creating checkout sessions. Add billing tab to dashboard. Plans: Free £0 (3 profiles, 1 user) / Starter £15 (10 profiles, 2 users) / Agency £59 (25 profiles, 5 users) / Agency Pro £119 (50 profiles, unlimited users, white-label). 14-day trial. Self-service portal for upgrade/downgrade. Usage limits enforcement in admin.mjs.

3. **Email notifications for approvals** — When posts are added in manual/passive mode, email the client with their approval link. When client approves/rejects, email the admin. Use Resend (free tier: 100 emails/day) or similar. Need RESEND_API_KEY env var.

4. **LinkedIn token auto-refresh** — Background function that checks linkedinTokenExpiresAt daily (already in token-health.mjs) and refreshes tokens 7 days before expiry using the refresh token grant.

5. **Platform expansion** — TikTok and Google Business Profile OAuth apps and connect buttons (skeleton platform code exists in lib/platforms/). Carousel/multi-image support for FB and IG.

Push all changes to GitHub when done. Create an updated TODO.md. Give me a prompt for the next session.
