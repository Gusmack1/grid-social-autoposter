# Grid Social Auto-Poster — Master TODO

## ✅ COMPLETED

### Session 1 — Initial Build
- [x] Multi-client auto-poster dashboard (v2) — live at grid-social-autoposter.netlify.app
- [x] Post composer, queue, content calendar, per-client API settings
- [x] Sorn Handyman added as first client
- [x] Meta Developer App created (Grid Social Poster, App ID 1576303166762174)
- [x] 6 job photos + both logos pushed to repo
- [x] 3 post captions written (dry verge, bath reseal, composite planters)

### Session 2 — Facebook OAuth + Multi-Platform
- [x] Built full OAuth flow (meta-auth + meta-callback Netlify functions)
- [x] Fixed META_APP_SECRET env var
- [x] Completed Facebook OAuth — got permanent page tokens
- [x] Fixed Sorn Handyman Page ID (was 61573109830217, now correct: 569602312902858)
- [x] Added "Connect Facebook" button to OAuth redirect URI whitelist in Meta Console
- [x] Food Foodie World added as second client via one-click "Add as Client" button
- [x] Image drag & drop + file attach button (mobile-friendly, uploads via server-side API)
- [x] Auto-uncheck platforms that aren't linked for a client
- [x] All 6 social platforms added to dashboard (Facebook, Instagram, X/Twitter, TikTok, LinkedIn, Google Business)
- [x] Accordion-style client modal with per-platform connection guides
- [x] Manual API key entry for Twitter (4 keys), TikTok, LinkedIn, Google Business
- [x] "Add as Client" buttons on OAuth success page for unmatched pages
- [x] Blue + button in sidebar for quick client creation
- [x] GITHUB_TOKEN env var set for server-side image uploads

---

## 🔴 PRIORITY 1 — Sorn Handyman (Immediate)

- [ ] Aidan to create Instagram @sornhandymanservices → switch to Business → connect to Sorn FB page
- [ ] Once IG created: click "Connect Facebook" in dashboard → IG Business ID will auto-populate
- [ ] Queue 3 posts in dashboard (dry verge, bath reseal, composite planters) with images
- [ ] Test publish from dashboard to verify token works end-to-end

---

## 🟡 PRIORITY 2 — Platform API Integration

- [ ] Build Twitter/X posting function in scheduled-post.mjs (uses 4 API keys per client)
- [ ] Build LinkedIn posting function (uses access token + page ID)
- [ ] Build Google Business Profile posting function (uses access token + location ID)
- [ ] Build TikTok posting function (uses access token)
- [ ] Token refresh system for LinkedIn (tokens expire in 60 days)
- [ ] Token refresh system for Google Business (tokens expire in 1 hour, need refresh token)

---

## 🟢 PRIORITY 3 — Dashboard Improvements

- [ ] Post history / analytics per client
- [ ] Bulk import (CSV or paste multiple)
- [ ] Auto-generate captions with AI
- [ ] Drag-and-drop calendar reordering
- [ ] Post preview for Twitter/LinkedIn/TikTok
- [ ] Multi-image support per post (carousel)
- [ ] Post editing after creation
- [ ] Client-specific posting schedules

---

## 🔵 PRIORITY 4 — Grid Social Agency

- [ ] Stripe account for Grid Social payments
- [ ] Google Search Console — verify gridsocial.co.uk
- [ ] Grid Social Instagram → switch to Business
- [ ] ImprovMX email hello@ alias
- [ ] Case study update on site once Sorn results come in

---

## Active Clients

| Client | FB Page ID | IG | Token | Status |
|--------|-----------|-----|-------|--------|
| Sorn Handyman Services | 569602312902858 | Pending | ✓ Permanent | Active |
| Food Foodie World | 111110793818072 | — | ✓ Permanent | Active |

---

## Key Links

| What | URL |
|------|-----|
| Auto-Poster Dashboard | https://grid-social-autoposter.netlify.app |
| Auto-Poster Repo | github.com/Gusmack1/grid-social-autoposter |
| Auto-Poster Netlify | app.netlify.com/projects/grid-social-autoposter |
| Grid Social Site | gridsocial.co.uk |
| Grid Social Repo | github.com/Gusmack1/grid-social |
| Meta Developer App | developers.facebook.com/apps/1576303166762174 |
| Graph Explorer | developers.facebook.com/tools/explorer |
| Sorn FB Page | facebook.com (Page ID: 569602312902858) |

## Env Vars (Netlify)

| Key | Status |
|-----|--------|
| ADMIN_KEY | ✓ Set (gridsocial2026!) |
| META_APP_ID | ✓ Set (1576303166762174) |
| META_APP_SECRET | ✓ Set |
| GITHUB_TOKEN | ✓ Set (for image uploads) |
