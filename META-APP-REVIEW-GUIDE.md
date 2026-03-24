# Meta App Review — Submission Guide

**Status:** Ready to submit
**App ID:** 1576303166762174
**Current Mode:** Development (5 users max)
**Goal:** Production access so any client can connect via the portal

---

## Why We Need App Review

The Grid Social client connect portal (`/connect`) uses Meta OAuth to let clients
authorise their Facebook Pages and Instagram Business accounts. In development mode,
only users added as testers/developers can complete the OAuth flow. For the portal
to work for real clients, Meta must approve the app for production use.

---

## Permissions Required

| Permission | Why We Need It | How We Use It |
|-----------|----------------|---------------|
| `pages_manage_posts` | Publish scheduled posts to client Facebook Pages | `POST /{page-id}/feed`, `POST /{page-id}/photos` |
| `pages_read_engagement` | Check post performance (likes, comments, reach) | `GET /{post-id}?fields=insights` |
| `pages_show_list` | Let clients pick which page to connect in the portal | `GET /me/accounts` |
| `pages_read_user_content` | Read existing posts for content calendar display | `GET /{page-id}/feed` |
| `instagram_basic` | Read Instagram Business account info | `GET /{ig-user-id}?fields=id,username` |
| `instagram_content_publish` | Publish scheduled posts to Instagram | `POST /{ig-user-id}/media`, `POST /{ig-user-id}/media_publish` |

---

## Submission Steps

### 1. Business Verification (if not already done)

Go to: https://business.facebook.com/settings/info

- Business name: Grid Social
- Website: https://gridsocial.co.uk
- Upload business documents (Companies House registration, utility bill, or bank statement)
- This can take 1-5 business days

### 2. Prepare App Settings

Go to: https://developers.facebook.com/apps/1576303166762174/settings/basic/

**Required fields:**
- App Display Name: `Grid Social`
- Contact Email: `gus@gridsocial.co.uk`
- Privacy Policy URL: `https://gridsocial.co.uk/privacy` ← **must exist before submission**
- Terms of Service URL: `https://gridsocial.co.uk/terms` ← **must exist before submission**
- App Icon: Upload the Grid Social logo (1024×1024 PNG)
- Category: `Business and Pages`
- App Purpose: `Manage pages` / `Build pages for businesses`

### 3. Create Privacy Policy & Terms Pages

These are REQUIRED by Meta. Create simple pages at:
- `gridsocial.co.uk/privacy`
- `gridsocial.co.uk/terms`

**Privacy policy must cover:**
- What data you collect (Facebook Page data, Instagram account info, access tokens)
- How you store it (AES-256-GCM encrypted at rest on Netlify)
- How you use it (scheduled posting only)
- Data retention (tokens stored until client disconnects)
- Data deletion (tokens deleted when client is removed)
- Contact info for data requests

**Terms of service must cover:**
- What the service does (social media scheduling)
- User responsibilities (they must be page admins)
- Liability limitations
- Termination rights

### 4. Record Screencasts

Meta requires screen recordings showing HOW each permission is used.
Record separate videos (30-120 seconds each) for:

**Video 1 — pages_manage_posts + pages_show_list:**
1. Open the connect portal (`/connect?invite=...`)
2. Click "Connect Facebook & Instagram"
3. Show the Facebook login dialog with permissions
4. Show the page picker (if multiple pages)
5. Show a post being published to the connected page
6. Show the published post on the Facebook Page

**Video 2 — pages_read_engagement:**
1. Show the admin dashboard
2. Show a published post with engagement metrics
3. (If analytics aren't built yet, explain in the description that
   this is planned and show the token health check as proof of API access)

**Video 3 — instagram_basic + instagram_content_publish:**
1. Show connecting Instagram via the portal
2. Show a post being created with Instagram selected
3. Show the post published on Instagram
4. Show the Instagram account info being read

**Video 4 — pages_read_user_content:**
1. Show the dashboard loading existing posts from a connected page
2. (Or explain this is for content calendar display)

**Upload videos as:**
- Unlisted YouTube links, OR
- Direct MP4 upload in the review form

### 5. Submit Each Permission

Go to: https://developers.facebook.com/apps/1576303166762174/review/

For each permission:
1. Click "Request" next to the permission
2. Fill in:
   - **How will you use this permission?** — Describe the specific API calls
   - **Step-by-step instructions** — Tell the reviewer exactly how to test
   - **Screencast** — Attach the relevant video
3. Provide test credentials:
   - Test URL: `https://grid-social-autoposter.netlify.app/connect?invite=<TEST_TOKEN>`
   - (Generate a fresh invite token before submission)

### 6. Submit for Review

Once all permissions are added:
1. Review the summary
2. Click "Submit for Review"
3. Meta reviews within 1-5 business days typically
4. You'll get email notifications about approval/rejection

---

## Common Rejection Reasons & Fixes

| Reason | Fix |
|--------|-----|
| "Privacy policy doesn't mention Facebook data" | Add specific section about Facebook/Instagram data |
| "Screencast doesn't show permission in use" | Re-record with clearer demonstration |
| "App doesn't have a valid use case" | Emphasise agency use case in descriptions |
| "Business verification incomplete" | Complete verification first, then resubmit |
| "Login flow doesn't show correct permissions" | Verify scope parameter matches requested permissions |

---

## Test Accounts for Reviewer

Create a test Facebook Page and Instagram Business account that the reviewer can use:

1. Create a test page (e.g., "Grid Social Test Page")
2. Generate a fresh invite link
3. Include these in the submission:
   - Test invite URL
   - Test page name
   - Note: "Click the invite link → Connect Facebook → Authorize → You'll see the status page"

---

## After Approval

Once approved:
1. The app switches to Live mode automatically
2. Any Facebook/Instagram user can complete the OAuth flow
3. The connect portal works for all clients
4. No more 5-user limit
5. Monitor the Meta dashboard for any compliance issues

---

## Environment Variables Needed

Already set:
- `META_APP_ID` = 1576303166762174
- `META_APP_SECRET` = (set on Netlify)

No new env vars needed for review — just the policy pages and screencasts.

---

## Timeline

| Task | Time | Depends On |
|------|------|-----------|
| Create privacy/terms pages | 30 min | Nothing |
| Prepare app settings | 15 min | Nothing |
| Record screencasts | 1-2 hours | Working portal |
| Submit review | 30 min | Everything above |
| Meta review period | 1-5 business days | Submission |
| **Total** | **~3-4 hours + wait** | |
