# Grid Social Auto-Poster — MASTER TODO
*Updated: 22 March 2026*

---

## Current Status

| Component | Status |
|-----------|--------|
| Dashboard v2.1 | ✅ LIVE at grid-social-autoposter.netlify.app |
| Admin API (multi-client) | ✅ Working |
| Scheduled Poster (multi-client) | ✅ Updated — iterates all clients |
| Sorn Handyman client | ✅ Added (FB Page ID: 61573109830217) |
| Page Access Token | ❌ NOT SET — Gus needs to generate in Graph Explorer |
| Instagram Account | ❌ NOT CREATED — Aidan needs to create @sornhandymanservices |
| Instagram Business Account ID | ❌ NOT SET — needs Instagram account first |
| 3 Posts drafted | ✅ Written (dry verge, bath reseal, planters) — NOT yet queued |
| Job photos in repo | ✅ 6 photos uploaded to public/ |
| Logos in repo | ✅ sorn-logo-circular.png + sorn-logo-horizontal.png |

---

## 🔴 PRIORITY 1 — Blocking (needs human action)

### Gus: Generate Page Access Token
1. Go to **https://developers.facebook.com/tools/explorer/**
2. Select app **Grid Social Poster** (App ID: 1576303166762174)
3. Click **Get Page Access Token** → select **Sorn Handyman Services**
4. Add permissions: `pages_manage_posts`, `pages_read_engagement`, `pages_show_list`, `instagram_basic`, `instagram_content_publish`
5. Click **Generate Access Token** → approve
6. Go to **https://developers.facebook.com/tools/debug/accesstoken/** → paste → **Extend Access Token**
7. Get permanent page token:
   ```
   https://graph.facebook.com/v21.0/me/accounts?access_token=YOUR_LONG_LIVED_TOKEN
   ```
8. Paste the permanent token into the dashboard: Clients & API → Edit → Page Access Token

### Aidan: Create Instagram @sornhandymanservices
1. Download Instagram → Create account (username: sornhandymanservices)
2. Switch to Business Account → Category: Handyman
3. Connect to **Sorn Handyman Services Facebook Page**
4. Set bio (see SETUP-GUIDE.md for copy-paste text)
5. Tell Gus when done

### After Instagram is created — Gus: Get IG Business Account ID
```
https://graph.facebook.com/v21.0/61573109830217?fields=instagram_business_account&access_token=YOUR_TOKEN
```
Paste the `instagram_business_account.id` into dashboard: Clients & API → Edit → Instagram Business Account ID

---

## 🟡 PRIORITY 2 — Done in v2.1 ✅

- [x] Phone preview mockup (Facebook + Instagram)
- [x] API Health check page with token validation + scope checking
- [x] Bulk import modal (paste multiple posts with separator)
- [x] Character counter (2200 IG limit)
- [x] Image thumbnails in queue + published views
- [x] Post statistics
- [x] Quick links to Meta developer tools
- [x] Calendar highlights Mon/Wed/Fri post days
- [x] Publish Next button in queue header
- [x] IG image warning
- [x] Delete client option
- [x] Token show/hide toggle
- [x] Multi-client scheduled poster (was single-client, now iterates all)

---

## 🟢 PRIORITY 3 — Future Enhancements

- [ ] Image upload to repo via API (so images don't need manual upload)
- [ ] Bulk import from CSV
- [ ] Analytics/insights per client (FB + IG API metrics)
- [ ] Auto-generate captions with AI
- [ ] Drag-and-drop queue reordering
- [ ] Edit existing posts in queue
- [ ] Duplicate post button
- [ ] Post templates / saved captions
- [ ] Multi-image carousel support (IG carousels)
- [ ] Auto-hashtag suggestions

---

## 🔵 PRIORITY 4 — Grid Social Agency

- [ ] Separate Stripe account for Grid Social payments
- [ ] Google Search Console — verify gridsocial.co.uk, submit sitemap
- [ ] Grid Social Instagram → switch to Business, upload profile photo
- [ ] ImprovMX email hello@ alias
- [ ] Add phone number to gridsocial.co.uk when ready
- [ ] Case study update on site once Sorn results come in

---

## 3 Posts Ready to Queue

Once token is set and photos uploaded, queue these:

### Post 1 — Dry Verge Repair (images: dry-verge-1.jpg, dry-verge-2.jpg)
Dry verge repair completed for a lovely new customer in Kilmarnock 🏠 ...

### Post 2 — Bath Reseal (images: bath-reseal-1.jpg, bath-reseal-2.jpg)
Bath resealed for a repeat customer 🛁 ...

### Post 3 — Composite Planters (images: planters-1.jpg, planters-2.jpg)
Decking offcuts? We don't waste them 🌿 ...

*(Full captions in SETUP-GUIDE.md)*

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
| Sorn FB Page | facebook.com/profile.php?id=61573109830217 |

## Credentials
| What | Value |
|------|-------|
| Auto-Poster Admin Key | gridsocial2026! |
| Meta App ID | 1576303166762174 |
| Instagram App ID | 877316642026605 |
| Sorn FB Page ID | 61573109830217 |
