# Grid Social — Full Roadmap to Best White-Label Agency Platform Under £150/mo

**Created:** 24 March 2026
**Goal:** Own the gap between free tools and £200+/mo agency platforms
**Target:** £119/mo white-label with client portal, 10+ platforms, AI content, approval workflows

---

## PHASE 1 — FOUNDATION REBUILD (Week 1-2)
*Strip the codebase apart, make it production-grade*

### 1.1 Architecture Overhaul
- [ ] Replace cron-based scheduling with **QStash** (Upstash) or **Inngest** for proper job queuing
  - QStash free tier: 500 messages/day (~15,000/month)
  - Inngest free tier: 50,000 runs/month
  - Supports delayed delivery up to 90 days, retries, per-step error handling
- [ ] Migrate from Netlify Blobs to a proper database for client/post/user data
  - Option A: **Supabase** (free tier: 500MB, PostgreSQL, row-level security)
  - Option B: **PlanetScale** (free tier: 1GB MySQL)
  - Option C: Stay on Blobs but add indexing layer
- [ ] Set up **Cloudflare R2** for media CDN ($0.015/GB/mo, no egress fees)
  - Replace GitHub repo image hosting (current approach doesn't scale)
  - Generate platform-specific image variants with **Sharp** (Node.js)
  - Instagram: 1080×1350 (4:5), Facebook: 1080×1080, LinkedIn: 1200×627, Twitter: 1200×675
- [ ] Implement proper error handling and logging
  - Structured JSON logs in all Netlify Functions
  - Post failure alerts (email or Slack webhook)
  - Retry logic: 3 attempts with exponential backoff per platform

### 1.2 Security Hardening
- [ ] **AES-256 token encryption** at rest — never store tokens in plain text
  - Encrypt before saving to database/Blobs
  - Decrypt only at post-time inside the function
  - Encryption key in Netlify env var (separate from tokens)
- [ ] Remove ADMIN_KEY legacy auth — JWT only going forward
- [ ] Add rate limiting to API endpoints (prevent brute force)
- [ ] Add CSRF protection on all mutation endpoints
- [ ] Audit and rotate all existing tokens
- [ ] Move GitHub token to server-side only (already done, verify)
- [ ] Add Content Security Policy headers

### 1.3 Codebase Cleanup
- [ ] Split 681-line monolithic `index.html` into proper React components
  - Option A: Vite + React build step (best DX, tree-shaking, HMR)
  - Option B: Keep CDN React but split into ES modules
- [ ] Split 441-line `admin.mjs` into separate function files per action
- [ ] Split 602-line `scheduled-post.mjs` into platform-specific modules
- [ ] Add TypeScript (at least JSDoc types for now)
- [ ] Set up proper dev environment with hot reload
- [ ] Add basic test suite (Vitest or Jest)
- [ ] Set up CI/CD — lint + test on PR, auto-deploy on merge to main

---

## PHASE 2 — CLIENT PORTAL & OAUTH ONBOARDING (Week 2-3)
*The killer feature that makes agencies choose us*

### 2.1 OAuth App Registration
- [ ] **Meta (Facebook/Instagram)** — already have app (ID: 1576303166762174)
  - Verify all required permissions: pages_manage_posts, pages_read_engagement, pages_show_list, instagram_basic, instagram_content_publish
  - Request App Review for public use (currently dev mode = 5 users max)
  - Add Business Verification for production access
- [ ] **Twitter/X** — app exists, needs Read+Write access token
  - Regenerate with OAuth 1.0a (tokens never expire — best option)
  - Budget for Basic tier ($200/mo) if agency needs >17 posts/day
- [ ] **LinkedIn** — register new OAuth app
  - Apply for Community Management API (w_member_social, w_organization_social)
  - Tokens expire in 60 days — need background refresh
- [ ] **TikTok** — register Content Posting API app
  - Apply for Direct Post scope (video.publish)
  - Business API tokens never expire — prefer this route
- [ ] **Google Business Profile** — register OAuth app
  - Enable Google Business Profile API in Cloud Console
  - Tokens expire in 1 hour — need frequent background refresh
- [ ] **Pinterest** — register app for Content Publishing API
- [ ] **Threads** — uses Meta's Threads API (same app, different permissions)
- [ ] **Bluesky** — uses AT Protocol (app passwords, no OAuth needed)

### 2.2 Client-Facing Portal
- [ ] Build branded onboarding page at `connect.gridsocial.co.uk` (or per-agency custom domain)
- [ ] Generate unique invite links per client (signed JWT with client ID + expiry)
- [ ] Client lands on portal → sees list of platforms to connect
- [ ] Each platform = one OAuth "Connect" button
- [ ] On authorisation, tokens flow back to Grid Social backend encrypted
- [ ] Client sees confirmation dashboard: ✅ Facebook connected, ✅ Instagram connected, etc.
- [ ] Store client metadata alongside tokens:
  - Business name, industry, brand colours
  - Target audience notes
  - Posting schedule preferences
  - Content approval preference (auto-approve / manual / 72-hour passive approval)
- [ ] Admin notification when client connects new account
- [ ] Token health monitoring — alert admin if token expires or is revoked

### 2.3 Token Management System
- [ ] Background scheduled function to check token health daily
- [ ] Auto-refresh tokens before expiry:
  - LinkedIn: refresh 7 days before 60-day expiry
  - TikTok Content API: refresh daily
  - GBP: refresh 30 min before 1-hour expiry (use refresh tokens)
  - Meta user tokens: refresh 7 days before 60-day expiry
- [ ] 401 detection — if any API returns 401, mark token as expired, notify admin
- [ ] Re-authorisation flow — send client a new connect link if token is revoked
- [ ] Token audit log — track when tokens were created, refreshed, revoked

---

## PHASE 3 — PLATFORM EXPANSION (Week 3-4)
*Go from 2 platforms to 10+*

### 3.1 Complete Posting Functions
- [ ] **Facebook Pages** ✅ (working)
  - Add carousel/multi-image support
  - Add Reels posting (video_reels endpoint)
  - Add Stories posting
- [ ] **Instagram Business** ✅ (working)
  - Add carousel posts (up to 10 images)
  - Add Reels posting (video container)
  - Add Stories posting (STORIES media type)
- [ ] **Twitter/X** — skeleton exists, needs API keys
  - Text posts, image posts, threads
  - OAuth 1.0a signing (HMAC-SHA1)
  - Media upload v1.1 + tweet create v2
- [ ] **LinkedIn** — skeleton exists
  - Text + image posts to Company Pages
  - Two-step image upload (register → PUT → create UGC post)
  - Article sharing with preview
- [ ] **TikTok** — skeleton exists
  - Video upload via Content Posting API
  - Direct Post flow (upload → publish)
  - Caption + hashtags
- [ ] **Google Business Profile**
  - Local posts (What's New, Events, Offers)
  - Photo uploads
  - Highest priority for local trade clients (feeds SEO)
- [ ] **Pinterest**
  - Pin creation with image + link + description
  - Board selection
- [ ] **Threads** (Meta)
  - Text posts, image posts
  - Uses Threads API (similar to Instagram flow)
- [ ] **Bluesky**
  - Text + image posts via AT Protocol
  - App password auth (no OAuth needed — simplest integration)
- [ ] **YouTube** (stretch goal)
  - Community posts
  - Shorts upload

### 3.2 Platform-Specific Features
- [ ] Per-platform caption editing (FB longer, IG shorter + 30 hashtags, X 280 chars)
- [ ] Platform-specific image auto-cropping with Sharp
- [ ] First Comment feature for Instagram (post hashtags as first comment)
- [ ] Link preview control for LinkedIn/Facebook
- [ ] Alt text / accessibility text for all image posts

---

## PHASE 4 — APPROVAL WORKFLOWS (Week 4-5)
*What separates an agency tool from a scheduling tool*

### 4.1 Content Approval System
- [ ] Three approval modes per client:
  - **Auto-approve** — posts go straight to queue (for clients who trust the agency)
  - **Manual approve** — posts sit in "Pending Approval" until client approves
  - **Passive approve** — auto-approved after 72 hours if no feedback
- [ ] Client approval portal (separate from admin dashboard)
  - Client logs in with magic link (no password needed)
  - Sees pending posts with platform previews
  - Can approve, request changes (with comments), or reject
  - Mobile-responsive (clients will check on their phone)
- [ ] Email notifications:
  - To client: "3 new posts ready for your review"
  - To agency: "Client approved 2 posts, requested changes on 1"
  - Configurable frequency (instant / daily digest / weekly)
- [ ] Approval history / audit trail
- [ ] Bulk approve option

### 4.2 Content Calendar Improvements
- [ ] Drag-and-drop rescheduling
- [ ] Week/month/quarter views
- [ ] Filter by platform, client, status
- [ ] Content categories / tags (tip, promo, engagement, blog, seasonal)
- [ ] Recurring post templates (weekly tip, monthly roundup)
- [ ] Content gaps detection ("No posts scheduled for next Tuesday")

---

## PHASE 5 — AI CONTENT ENGINE (Week 5-6)
*Make content creation 10x faster*

### 5.1 AI Writer Upgrades
- [ ] Upgrade from basic AI Writer to full content generation pipeline
- [ ] Generate complete posts from prompts: caption + image + hashtags + scheduling
- [ ] Tone presets per client (professional, casual, Scottish, etc.)
- [ ] Content pillars / categories system (each client has 4-5 themes to rotate)
- [ ] AI-suggested posting times based on engagement data
- [ ] Hashtag research and suggestions per platform
- [ ] Caption length auto-adjustment per platform
- [ ] A/B caption variants (generate 2-3 options, pick best)

### 5.2 AI Image Generation
- [ ] Integration with image generation API for custom branded graphics
- [ ] Template system with client brand colours/fonts/logos
- [ ] Auto-generate images from post text (quote cards, stat graphics, tip cards)
- [ ] Pexels/Unsplash integration for stock photo search
- [ ] Image editor basics (crop, filter, text overlay, brand watermark)

### 5.3 Bulk Content Generation
- [ ] "Generate 30 days of content" one-click workflow
- [ ] Import content from blog RSS feed → auto-generate social posts
- [ ] Content recycling — resurface top-performing posts after X days
- [ ] Seasonal content calendar (bank holidays, awareness days, etc.)

---

## PHASE 6 — WHITE-LABEL & MULTI-TENANCY (Week 6-8)
*This is where the money is*

### 6.1 White-Label Branding
- [ ] Custom domain support (clients see `social.clientagency.com` not gridsocial.co.uk)
  - Netlify custom domains or Cloudflare Workers proxy
- [ ] Custom logo, colours, favicon per agency
- [ ] Custom email sender (notifications come from agency's domain)
- [ ] Remove all Grid Social branding from client-facing pages
- [ ] Custom login page per agency
- [ ] Branded PDF reports with agency logo

### 6.2 Multi-Tenancy Architecture
- [ ] Agency → Clients → Users hierarchy
- [ ] Each agency is isolated (can't see other agencies' data)
- [ ] Agency admins manage their own clients, users, billing
- [ ] Grid Social super-admin panel for managing agencies
- [ ] Per-agency feature flags (enable/disable features per plan)
- [ ] Usage tracking per agency (posts sent, storage used, API calls)

### 6.3 Team & Permissions
- [ ] Role-based access: Super Admin → Agency Admin → Manager → Creator → Client
- [ ] Per-client permissions (user X can only post for clients A and B)
- [ ] Content approval chains (Creator → Manager → Client → Published)
- [ ] Activity log / audit trail per user
- [ ] SSO support (Google, Microsoft) for Enterprise tier

---

## PHASE 7 — ANALYTICS & REPORTING (Week 8-9)
*Prove ROI to clients*

### 7.1 Post Analytics
- [ ] Pull engagement metrics from each platform's API:
  - Facebook: reactions, comments, shares, reach, impressions
  - Instagram: likes, comments, saves, reach, impressions
  - LinkedIn: likes, comments, shares, impressions
  - Twitter: likes, retweets, replies, impressions
- [ ] Per-post performance tracking
- [ ] Best time to post analysis (based on actual engagement data)
- [ ] Top performing posts ranking
- [ ] Engagement rate calculation per platform

### 7.2 Client Reports
- [ ] Auto-generated monthly PDF reports per client
- [ ] Key metrics: total posts, engagement rate, follower growth, best posts
- [ ] Branded with agency logo (white-label)
- [ ] Email reports to clients on schedule (weekly/monthly)
- [ ] Dashboard view for clients (read-only analytics portal)

### 7.3 Agency Dashboard
- [ ] Cross-client overview (all clients at a glance)
- [ ] Revenue tracking per client
- [ ] Team productivity metrics
- [ ] Platform health status (API status, token health, rate limits)

---

## PHASE 8 — BILLING & MONETISATION (Week 9-10)
*Start charging*

### 8.1 Stripe Integration
- [ ] Stripe account setup (already on TODO)
- [ ] Subscription plans matching pricing tiers:
  - Free: £0 (3 profiles, 1 user)
  - Starter: £15/mo (10 profiles, 2 users)
  - Agency: £59/mo (25 profiles, 5 users)
  - Agency Pro: £119/mo (50 profiles, unlimited users, white-label)
  - Enterprise: Custom
- [ ] Self-service subscription management (upgrade/downgrade/cancel)
- [ ] Usage-based limits enforcement (profile count, user count)
- [ ] Invoice generation and email
- [ ] Trial period (14 days free on any plan)
- [ ] Annual pricing discount (2 months free)

### 8.2 Agency Reseller Model
- [ ] Agencies set their own pricing for their clients
- [ ] Grid Social charges agency wholesale, agency marks up for client
- [ ] Revenue share reporting
- [ ] White-label billing (clients see agency name on invoices)

---

## PHASE 9 — POLISH & LAUNCH (Week 10-12)
*Make it shine*

### 9.1 UX/UI Redesign
- [ ] Professional dashboard redesign (current is functional but basic)
- [ ] Dark mode
- [ ] Keyboard shortcuts
- [ ] Onboarding wizard for new users
- [ ] Help tooltips throughout
- [ ] Mobile app consideration (PWA first)

### 9.2 Documentation & Support
- [ ] API documentation (if offering API access on higher tiers)
- [ ] Knowledge base / help centre
- [ ] Video tutorials for common tasks
- [ ] Changelog / release notes page
- [ ] Status page (uptime monitoring)

### 9.3 Marketing & Launch
- [ ] Landing page at gridsocial.co.uk/platform (separate from agency services)
- [ ] Comparison pages (Grid Social vs Sendible, vs SocialPilot, etc.)
- [ ] Case study: Sorn Handyman results
- [ ] Product Hunt launch
- [ ] AppSumo lifetime deal consideration (for initial traction)
- [ ] SEO content: "best white-label social media tool for agencies"
- [ ] Free tier as lead magnet

---

## IMMEDIATE NEXT ACTIONS (This Week)

1. **Set up QStash account** (upstash.com) — free tier, 5 minutes
2. **Set up Cloudflare R2 bucket** — for media CDN
3. **Set up Supabase project** — for proper database (or evaluate staying on Blobs)
4. **Split the monolithic index.html** — set up Vite + React build
5. **Implement AES-256 token encryption** — security first
6. **Build OAuth connect flow for LinkedIn** — expand platform support
7. **Build basic client portal** — branded connect page with OAuth buttons
8. **Request Meta App Review** — needed for production (>5 users)

---

## KEY TECHNICAL DECISIONS TO MAKE

| Decision | Option A | Option B | Recommendation |
|----------|----------|----------|----------------|
| Database | Supabase (PostgreSQL) | Stay on Netlify Blobs | Supabase — relational data, RLS, real-time |
| Job Queue | QStash (simpler) | Inngest (more powerful) | QStash for now, Inngest if workflows get complex |
| Frontend | Vite + React SPA | Keep CDN React | Vite — proper build step, tree-shaking, HMR |
| Media CDN | Cloudflare R2 | Netlify Blobs | R2 — public URLs, no egress, cheap |
| Auth | Keep custom JWT | Auth provider (Clerk/Auth0) | Keep custom for now, evaluate Clerk later |
| Hosting | Stay on Netlify | Move to Vercel/Railway | Stay on Netlify — invested, working, cheap |

---

## COST PROJECTIONS (Monthly at Scale)

| Service | Free Tier | At 50 Clients | At 200 Clients |
|---------|-----------|---------------|----------------|
| Netlify | Free (125k fn invocations) | Free–$19 | $19–$45 |
| QStash | Free (500/day) | Free | $1–5 |
| Supabase | Free (500MB) | Free–$25 | $25 |
| Cloudflare R2 | Free (10GB) | $1–5 | $5–15 |
| Claude API (AI Writer) | — | $5–15 | $15–50 |
| Domain + Email | $15 | $15 | $15 |
| **Total** | **~$15** | **~$60–80** | **~$80–155** |

**Revenue at 50 clients on Agency plan (£59/mo): £2,950/mo**
**Revenue at 200 clients mixed tiers: ~£8,000–12,000/mo**
**Margin: 90%+**

---

## COMPETITIVE POSITIONING SUMMARY

| Feature | Sendible (£315/mo) | SocialPilot (£200/mo) | Cloud Campaign (£229/mo) | **Grid Social (£119/mo)** |
|---------|--------------------|-----------------------|--------------------------|---------------------------|
| White-label | ✅ | ✅ | ✅ | ✅ |
| Client portal | ✅ | Limited | ✅ | ✅ |
| OAuth onboarding | ✅ (Client Connect) | Invite links | ✅ | ✅ |
| Platforms | 8 | 9 | 8+ | 10+ |
| AI content | Basic | Basic | ✅ | ✅ (Claude-powered) |
| Approval workflows | ✅ | ✅ | ✅ | ✅ |
| Unlimited users | ❌ | ✅ (Ultimate) | ❌ | ✅ |
| Price | £315/mo | £200/mo | £229/mo | **£119/mo** |

**Grid Social wins on: price, platform count, AI quality (Claude vs generic), unlimited users.**
