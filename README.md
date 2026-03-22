# Grid Social Auto-Poster

Automated social media posting for Grid Social clients.  
Posts to **Facebook Pages** + **Instagram Business** via Meta Graph API.  
Scheduled via Netlify Functions (Mon/Wed/Fri at 10am UK).

## Architecture

```
Admin Dashboard → Netlify Blobs (post queue) → Scheduled Function → Meta Graph API
                                                                  ├── Facebook Page
                                                                  └── Instagram Business
```

## Quick Start

### 1. Deploy to Netlify
- Push this repo to GitHub
- Connect to Netlify → auto-deploys
- Set environment variables (see below)

### 2. Environment Variables (Netlify → Site → Environment Variables)

| Variable | Description |
|---|---|
| `ADMIN_KEY` | Any strong password — used to access the admin dashboard |
| `META_PAGE_ACCESS_TOKEN` | Long-lived Page Access Token from Meta |
| `META_PAGE_ID` | Facebook Page ID (numeric) |
| `META_IG_USER_ID` | Instagram Business Account ID (numeric) |

### 3. Admin Dashboard
Visit your Netlify URL → enter your ADMIN_KEY → add posts to the queue.

---

## Meta Developer Setup (Step by Step)

### Step 1: Create a Meta App
1. Go to https://developers.facebook.com
2. Click **My Apps** → **Create App**
3. Choose **Business** type
4. Name it something like "Grid Social Autoposter"
5. Select your Business account (or create one)

### Step 2: Add Facebook Login for Business
1. In your app dashboard, click **Add Product**
2. Add **Facebook Login for Business**
3. Go to Settings → Basic → note your **App ID** and **App Secret**

### Step 3: Get a Page Access Token
1. Go to https://developers.facebook.com/tools/explorer/
2. Select your app from the dropdown
3. Click **Get Token** → **Get Page Access Token**
4. Select the Sorn Handyman Services page
5. Add these permissions:
   - `pages_manage_posts`
   - `pages_read_engagement`
   - `pages_show_list`
   - `instagram_basic`
   - `instagram_content_publish`
6. Click **Generate Access Token**
7. Approve the permissions on the Facebook page

### Step 4: Extend the Token (IMPORTANT)
The token from Step 3 is short-lived (1 hour). You need a long-lived one:

1. Go to https://developers.facebook.com/tools/debug/accesstoken/
2. Paste your token → click **Debug**
3. Click **Extend Access Token** at the bottom
4. Copy the new long-lived token (lasts ~60 days)

**For a never-expiring Page token:**
```
GET https://graph.facebook.com/v21.0/me/accounts?access_token=YOUR_LONG_LIVED_USER_TOKEN
```
This returns Page Access Tokens that **never expire**. Use this one.

### Step 5: Get your Page ID
1. Go to your Facebook Page
2. Click **About** → scroll to **Page transparency**
3. Or use the API: the /me/accounts response includes `id` for each page

### Step 6: Get Instagram Business Account ID
1. Make sure Instagram is connected to the Facebook Page:
   - Facebook Page → Settings → Linked Accounts → Instagram
2. Then get the ID:
```
GET https://graph.facebook.com/v21.0/YOUR_PAGE_ID?fields=instagram_business_account&access_token=YOUR_TOKEN
```
3. The `instagram_business_account.id` is your `META_IG_USER_ID`

### Step 7: Set Environment Variables in Netlify
Go to Netlify → Your site → Site configuration → Environment variables:
- `ADMIN_KEY` = your chosen password
- `META_PAGE_ACCESS_TOKEN` = the never-expiring Page token
- `META_PAGE_ID` = the Page ID
- `META_IG_USER_ID` = the Instagram Business Account ID

---

## How It Works

### Posting Schedule
The scheduled function runs at **10:00 UTC** (11:00 BST) on **Monday, Wednesday, Friday**.

Each run:
1. Reads the post queue from Netlify Blobs
2. Finds the next post with status `queued`
3. Posts to Facebook Page (text + optional image)
4. Posts to Instagram Business (requires image)
5. Marks the post as `published`
6. Logs to history

### Image Requirements
- **Facebook**: Image URL optional (can post text-only)
- **Instagram**: Image URL **required** (Instagram is image-first)
- Images must be publicly accessible URLs (no local files)
- Recommended: Upload images to the Facebook Page first, or use a CDN

### Admin Dashboard
- **Queue**: View, reorder, delete queued posts
- **Add Post**: Create new posts with caption, image URL, platform selection
- **History**: View published posts and their results
- **Publish Now**: Manually trigger the next post immediately

---

## API Endpoints

All endpoints require `Authorization: Bearer YOUR_ADMIN_KEY` header.

| Method | Endpoint | Action |
|---|---|---|
| GET | `/api/admin?action=queue` | Get post queue |
| GET | `/api/admin?action=history` | Get publish history |
| GET | `/api/admin?action=config` | Check config status |
| POST | `/api/admin?action=add` | Add post to queue |
| PUT | `/api/admin?action=reorder` | Reorder a post |
| DELETE | `/api/admin?action=delete` | Delete a post |
| POST | `/api/admin?action=publish-now` | Publish next post immediately |

---

## Client: Sorn Handyman Services

- **Facebook**: https://www.facebook.com/profile.php?id=61573109830217
- **Instagram**: @sornhandymanservices (to be created)
- **Contact**: Fraser 07900 255876 / Aidan WhatsApp +44 7472 223323

<!-- deploy trigger -->
<!-- deploy trigger 20260322T193555Z -->
