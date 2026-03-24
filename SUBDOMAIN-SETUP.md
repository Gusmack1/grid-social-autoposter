# Subdomain Setup: connect.gridsocial.co.uk

**Goal:** Point `connect.gridsocial.co.uk` to the client connect portal

---

## Option A: Netlify Custom Domain (Recommended)

### Step 1: Add domain in Netlify

1. Go to: https://app.netlify.com/sites/grid-social-autoposter/settings/domain-management
2. Click "Add custom domain"
3. Enter: `connect.gridsocial.co.uk`
4. Click "Verify" then "Add domain"
5. Netlify will show the DNS target (e.g., `grid-social-autoposter.netlify.app`)

### Step 2: Add DNS record at your registrar

Go to your domain registrar (wherever gridsocial.co.uk DNS is managed — likely
the same place you set up the proxy for `gridsocial.co.uk/manage`).

Add a **CNAME record**:

```
Type:  CNAME
Name:  connect
Value: grid-social-autoposter.netlify.app
TTL:   3600 (or Auto)
```

### Step 3: Wait for propagation

- DNS propagation: 5 minutes to 48 hours (usually under 1 hour)
- Check with: `dig connect.gridsocial.co.uk CNAME`

### Step 4: Enable HTTPS

1. Back in Netlify → Domain settings
2. Netlify will auto-provision a Let's Encrypt SSL certificate
3. Click "Force HTTPS" once the certificate is ready

### Step 5: Update redirects

Add to `netlify.toml` (only needed if you want `connect.gridsocial.co.uk` root
to go directly to the portal — already handled by the existing `/connect` route):

```toml
# Redirect connect subdomain root to portal
[[redirects]]
  from = "https://connect.gridsocial.co.uk/"
  to = "/.netlify/functions/connect-portal"
  status = 200
  conditions = {Host = ["connect.gridsocial.co.uk"]}
```

**Note:** If you want the connect subdomain to ONLY serve the portal (not the
dashboard), you may want a separate Netlify site. But for now, sharing the same
site works fine — the `/connect` route already handles it.

---

## Option B: Cloudflare Proxy (If DNS is on Cloudflare)

If `gridsocial.co.uk` uses Cloudflare DNS:

1. Go to Cloudflare → DNS
2. Add CNAME: `connect` → `grid-social-autoposter.netlify.app` (DNS only, NOT proxied)
3. **Important:** Set the proxy toggle to "DNS only" (grey cloud) — Netlify needs
   to handle SSL directly for custom domains

---

## Option C: Simple Redirect (Quickest)

If you just want `connect.gridsocial.co.uk` to redirect to the portal path:

Add a DNS redirect/page rule:
```
connect.gridsocial.co.uk/* → https://grid-social-autoposter.netlify.app/connect$1 (301)
```

This is simpler but means clients see the `netlify.app` URL in their browser.

---

## Testing

Once DNS is set up:

```bash
# Check DNS
dig connect.gridsocial.co.uk CNAME

# Check HTTPS
curl -I https://connect.gridsocial.co.uk/

# Test portal with invite
curl https://connect.gridsocial.co.uk/connect?invite=TEST_TOKEN
```

---

## Also Set Up: approve.gridsocial.co.uk (Optional)

Same process for the approval portal subdomain:

```
Type:  CNAME
Name:  approve
Value: grid-social-autoposter.netlify.app
TTL:   3600
```

Then approval links would be: `https://approve.gridsocial.co.uk/approve?token=...`

This is optional — `grid-social-autoposter.netlify.app/approve?token=...` works
fine for now, but a branded subdomain looks more professional in client emails.

---

## Estimated Time: 15 minutes (plus DNS propagation wait)
