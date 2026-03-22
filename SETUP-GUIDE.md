# Sorn Handyman — Auto-Poster & Instagram Setup Guide

Everything you need to get the auto-poster live and Instagram created.

---

## STEP 1: Connect GitHub Repo to Netlify (2 mins)

1. Go to **https://app.netlify.com/projects/grid-social-autoposter**
2. Click **Site configuration** → **Build & deploy** → **Link to Git provider**
3. Choose **GitHub** → Authorize if prompted
4. Select repo: **Gusmack1/grid-social-autoposter**
5. Build settings:
   - Build command: *(leave blank)*
   - Publish directory: **public**
   - Functions directory: **netlify/functions**
6. Click **Deploy**

Once deployed, your admin dashboard is at:
**https://grid-social-autoposter.netlify.app**

Login with admin key: **gridsocial2026!**

---

## STEP 2: Create Instagram Account (Aidan does this — 5 mins)

Tell Aidan to do these steps on his phone:

1. **Download Instagram** (if not already installed)
2. **Create new account**:
   - Email: Aidanmc301@gmail.com (or a new one)
   - Full name: **Sorn Handyman Services**
   - Username: **sornhandymanservices**
   - Password: *(Aidan chooses)*
3. **Set profile picture**: Use the circular logo (Image 1 you sent me)
4. **Switch to Business Account**:
   - Go to Settings → Account → Switch to Professional Account
   - Choose **Business**
   - Category: **Handyman**
   - Connect to the **Sorn Handyman Services Facebook Page**
5. **Set bio** (copy-paste this):

```
Father & son handyman team 🔨
Sorn, East Ayrshire — covering all of Ayrshire
Fencing · Decking · Plumbing · Joinery · Roofing
Home Report repairs (Cat 2 & 3)
No job too small ✅ Free quotes
📞 07900 255876
```

6. **Add action button**: WhatsApp → +447472223323
7. **Add website link**: https://www.facebook.com/profile.php?id=61573109830217

Once Instagram is created and connected to the Facebook page, send Gus the following:
- Confirmation it's done
- The Instagram username (should be sornhandymanservices)

---

## STEP 3: Create Meta Developer App (Gus — 10 mins)

This is what gives us API access to post automatically.

### 3a. Create the App
1. Go to **https://developers.facebook.com**
2. Click **My Apps** → **Create App**
3. App type: **Business**
4. Display name: **Grid Social Autoposter**
5. Contact email: gridsocial.agency@gmail.com
6. Click **Create App**

### 3b. Add Products
In your app dashboard:
1. Click **Add Product** in the left sidebar
2. Add **Facebook Login for Business** → Set Up
3. Click **Add Product** again → Add **Instagram Graph API** → Set Up (if available as separate product)

### 3c. Get Page Access Token
1. Go to **https://developers.facebook.com/tools/explorer/**
2. Select your app **Grid Social Autoposter** from the dropdown
3. Click **User Token** dropdown → **Get Page Access Token**
4. Select the **Sorn Handyman Services** page
5. On the right, add these permissions:
   - pages_manage_posts
   - pages_read_engagement
   - pages_show_list
   - instagram_basic
   - instagram_content_publish
6. Click **Generate Access Token**
7. Approve all permissions when prompted

### 3d. Extend to Never-Expiring Token
1. Copy the token from the Explorer
2. Go to **https://developers.facebook.com/tools/debug/accesstoken/**
3. Paste token → Click **Debug**
4. Click **Extend Access Token** at the bottom
5. Copy the long-lived token
6. Now get the PERMANENT page token — run this URL in your browser:
```
https://graph.facebook.com/v21.0/me/accounts?access_token=YOUR_LONG_LIVED_TOKEN
```
7. In the JSON response, find the Sorn Handyman page and copy:
   - **access_token** (this is the permanent page token)
   - **id** (this is the Page ID — a long number)

### 3e. Get Instagram Business Account ID
Run this URL in your browser (replace YOUR_PAGE_TOKEN and YOUR_PAGE_ID):
```
https://graph.facebook.com/v21.0/YOUR_PAGE_ID?fields=instagram_business_account&access_token=YOUR_PAGE_TOKEN
```
Copy the **instagram_business_account.id** value.

### 3f. Set Environment Variables in Netlify
1. Go to **https://app.netlify.com/projects/grid-social-autoposter**
2. Click **Site configuration** → **Environment variables**
3. Add these:

| Key | Value |
|-----|-------|
| META_PAGE_ACCESS_TOKEN | The permanent page token from step 3d |
| META_PAGE_ID | The page ID from step 3d |
| META_IG_USER_ID | The Instagram Business Account ID from step 3e |

(ADMIN_KEY is already set to: gridsocial2026!)

---

## STEP 4: Test It

1. Go to **https://grid-social-autoposter.netlify.app**
2. Login with admin key
3. Check the status pills — FB Token and Instagram should both be green
4. Click **Add Post** tab
5. Add a test post with caption and image URL
6. Click **Publish Next Now** to test

---

## How the Schedule Works

The auto-poster runs at **10:00 AM UK time** on **Monday, Wednesday, Friday**.

Each time it runs, it publishes the next queued post to Facebook + Instagram.

To keep it fed:
- Add posts via the admin dashboard
- Or I can bulk-add posts for you via the API

---

## Image Hosting for Posts

Instagram requires publicly accessible image URLs. Options:
1. **Upload to Facebook first** → use the image URL from the post
2. **Upload to the repo** → images in public/ folder are served at grid-social-autoposter.netlify.app/filename.png
3. **Use any image hosting** (Imgur, Cloudinary, etc.)

The logos are already hosted at:
- https://grid-social-autoposter.netlify.app/sorn-logo-circular.png
- https://grid-social-autoposter.netlify.app/sorn-logo-horizontal.png

---

## First 3 Instagram Posts (ready to queue)

These use the photos Aidan sent. Upload the job photos to the repo's public/ folder first, then add these to the queue.

### Post 1 — Dry Verge Repair
Caption:
```
Dry verge repair completed for a lovely new customer in Kilmarnock 🏠

These are the jobs that stop small problems becoming big ones — cracked or loose dry verge lets water in and causes damage over time.

We specialise in small repairs and can get to you quickly. If something's been niggling you about your roof or guttering, give us a shout 👇

📞 07900 255876
💬 WhatsApp: +44 7472 223323

#DryVerge #RoofRepairs #HandymanKilmarnock #HandymanAyrshire #SornHandyman #GutteringAyrshire #PropertyMaintenance #AyrshireTrades #HomeRepairs #RoofingRepairs
```

### Post 2 — Bath Reseal
Caption:
```
Bath resealed for a repeat customer 🛁

No job too small — old sealant can let water behind panels and cause real damage. A proper reseal takes no time and saves a fortune in the long run.

Great to be back helping a returning customer. That's what it's all about 💪

📞 07900 255876
💬 WhatsApp us anytime

#BathReseal #PlumberAyrshire #HandymanKilmarnock #NoJobTooSmall #SornHandyman #HomeRepairsAyrshire #AyrshireTrades #BathroomRepairs #Plumbing #PropertyMaintenance
```

### Post 3 — Composite Planters
Caption:
```
Decking offcuts? We don't waste them 🌿

After a recent composite decking install, we used the leftover material to build these planters as a wee surprise gift for the customer. Waste not, want not!

It's the little touches that matter — and it was gratefully received 😊

Message us for any home or garden repairs, maintenance or upgrades. We answer every message and can support quickly.

📞 07900 255876
💬 WhatsApp: +44 7472 223323

#CompositePlanters #DeckingAyrshire #GardenUpgrade #HandymanAyrshire #SornHandyman #Upcycling #AyrshireTrades #HandymanKilmarnock #GardenDesign #CompositeDecking
```
