// Scheduled auto-poster v3 — Multi-client, Multi-platform
// Runs Mon, Wed, Fri at 10:00 UTC (11:00 BST)
// Platforms: Facebook, Instagram, Twitter/X, LinkedIn, TikTok, Google Business Profile

import { getStore } from "@netlify/blobs";
import crypto from "crypto";

const GRAPH_API = "https://graph.facebook.com/v21.0";

// ═══════════════════════════════════════════════════════
// FACEBOOK — Post to Page via Graph API
// ═══════════════════════════════════════════════════════
async function postToFacebook(pageId, token, message, imageUrl) {
  try {
    let endpoint, body;
    if (imageUrl) {
      endpoint = `${GRAPH_API}/${pageId}/photos`;
      body = new URLSearchParams({ url: imageUrl, message, access_token: token });
    } else {
      endpoint = `${GRAPH_API}/${pageId}/feed`;
      body = new URLSearchParams({ message, access_token: token });
    }
    const res = await fetch(endpoint, { method: "POST", body });
    const data = await res.json();
    if (data.error) return { success: false, error: data.error.message };
    return { success: true, id: data.id || data.post_id };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════
// INSTAGRAM — Post to Business Account via Graph API
// ═══════════════════════════════════════════════════════
async function postToInstagram(igUserId, token, caption, imageUrl) {
  try {
    if (!imageUrl) return { success: false, error: "Instagram requires an image" };

    // Step 1: Create media container
    const containerRes = await fetch(`${GRAPH_API}/${igUserId}/media`, {
      method: "POST",
      body: new URLSearchParams({ image_url: imageUrl, caption, access_token: token }),
    });
    const containerData = await containerRes.json();
    if (containerData.error) return { success: false, error: containerData.error.message };

    // Step 2: Wait for processing
    const containerId = containerData.id;
    let ready = false, attempts = 0;
    while (!ready && attempts < 10) {
      await new Promise((r) => setTimeout(r, 3000));
      const statusRes = await fetch(`${GRAPH_API}/${containerId}?fields=status_code&access_token=${token}`);
      const statusData = await statusRes.json();
      if (statusData.status_code === "FINISHED") ready = true;
      else if (statusData.status_code === "ERROR") return { success: false, error: "Media processing failed" };
      attempts++;
    }
    if (!ready) return { success: false, error: "Media processing timed out" };

    // Step 3: Publish
    const publishRes = await fetch(`${GRAPH_API}/${igUserId}/media_publish`, {
      method: "POST",
      body: new URLSearchParams({ creation_id: containerId, access_token: token }),
    });
    const publishData = await publishRes.json();
    if (publishData.error) return { success: false, error: publishData.error.message };
    return { success: true, id: publishData.id };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════
// TWITTER / X — Post via v2 API with OAuth 1.0a
// Free tier: 1,500 tweets/month, write-only
// Requires: API Key, API Secret, Access Token, Access Secret
// ═══════════════════════════════════════════════════════

function percentEncode(str) {
  return encodeURIComponent(str)
    .replace(/!/g, "%21")
    .replace(/\*/g, "%2A")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}

function generateOAuthSignature(method, url, params, consumerSecret, tokenSecret) {
  const sortedParams = Object.keys(params).sort().map(k => `${percentEncode(k)}=${percentEncode(params[k])}`).join("&");
  const baseString = `${method}&${percentEncode(url)}&${percentEncode(sortedParams)}`;
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  return crypto.createHmac("sha1", signingKey).update(baseString).digest("base64");
}

function buildOAuthHeader(method, url, body, apiKey, apiSecret, accessToken, accessSecret) {
  const oauthParams = {
    oauth_consumer_key: apiKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken,
    oauth_version: "1.0",
  };

  // For signature, combine oauth params + body params (if URL-encoded)
  const allParams = { ...oauthParams };
  if (body && typeof body === "object") {
    Object.assign(allParams, body);
  }

  oauthParams.oauth_signature = generateOAuthSignature(method, url, allParams, apiSecret, accessSecret);

  const headerParts = Object.keys(oauthParams).sort().map(k => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`);
  return `OAuth ${headerParts.join(", ")}`;
}

async function postToTwitter(client, message, imageUrl) {
  const { twitterApiKey, twitterApiSecret, twitterAccessToken, twitterAccessSecret } = client;
  if (!twitterApiKey || !twitterApiSecret || !twitterAccessToken || !twitterAccessSecret) {
    return { success: false, error: "Twitter API credentials not configured" };
  }

  try {
    let mediaId = null;

    // Step 1: Upload media if image exists (v1.1 media upload — still required for v2 tweets)
    if (imageUrl) {
      try {
        // Download image first
        const imgRes = await fetch(imageUrl);
        if (imgRes.ok) {
          const imgBuffer = await imgRes.arrayBuffer();
          const imgBase64 = Buffer.from(imgBuffer).toString("base64");
          const mimeType = imgRes.headers.get("content-type") || "image/jpeg";

          const uploadUrl = "https://upload.twitter.com/1.1/media/upload.json";
          const uploadBody = {
            media_data: imgBase64,
            media_category: "tweet_image",
          };

          const uploadAuth = buildOAuthHeader("POST", uploadUrl, uploadBody, twitterApiKey, twitterApiSecret, twitterAccessToken, twitterAccessSecret);

          const uploadRes = await fetch(uploadUrl, {
            method: "POST",
            headers: {
              "Authorization": uploadAuth,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams(uploadBody),
          });
          const uploadData = await uploadRes.json();
          if (uploadData.media_id_string) {
            mediaId = uploadData.media_id_string;
          } else {
            console.log("[twitter] Media upload failed:", JSON.stringify(uploadData));
          }
        }
      } catch (mediaErr) {
        console.log("[twitter] Media upload error (continuing without image):", mediaErr.message);
      }
    }

    // Step 2: Post tweet via v2 API
    const tweetUrl = "https://api.x.com/2/tweets";
    const tweetBody = { text: message.substring(0, 280) }; // Twitter 280 char limit
    if (mediaId) {
      tweetBody.media = { media_ids: [mediaId] };
    }

    // v2 uses JSON body — OAuth signature is computed WITHOUT body params for JSON
    const tweetAuth = buildOAuthHeader("POST", tweetUrl, {}, twitterApiKey, twitterApiSecret, twitterAccessToken, twitterAccessSecret);

    const tweetRes = await fetch(tweetUrl, {
      method: "POST",
      headers: {
        "Authorization": tweetAuth,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(tweetBody),
    });

    const tweetData = await tweetRes.json();
    if (tweetData.data?.id) {
      return { success: true, id: tweetData.data.id };
    }
    return { success: false, error: tweetData.detail || tweetData.title || JSON.stringify(tweetData.errors || tweetData) };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════
// LINKEDIN — Post to Company Page via v2 API
// Requires: Organization URN (e.g. urn:li:organization:12345)
//           Access Token with w_member_social or w_organization_social
// ═══════════════════════════════════════════════════════
async function postToLinkedIn(client, message, imageUrl) {
  const { linkedinId, linkedinAccessToken } = client;
  if (!linkedinId || !linkedinAccessToken) {
    return { success: false, error: "LinkedIn credentials not configured" };
  }

  try {
    // Build the organization URN — store as just the numeric ID
    const orgUrn = linkedinId.startsWith("urn:") ? linkedinId : `urn:li:organization:${linkedinId}`;
    let mediaAsset = null;

    // Step 1: Upload image if provided
    if (imageUrl) {
      try {
        // Register upload
        const registerRes = await fetch("https://api.linkedin.com/v2/assets?action=registerUpload", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${linkedinAccessToken}`,
            "Content-Type": "application/json",
            "X-Restli-Protocol-Version": "2.0.0",
          },
          body: JSON.stringify({
            registerUploadRequest: {
              recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
              owner: orgUrn,
              serviceRelationships: [{ relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" }],
            },
          }),
        });
        const registerData = await registerRes.json();

        const uploadUrl = registerData.value?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]?.uploadUrl;
        const asset = registerData.value?.asset;

        if (uploadUrl && asset) {
          // Download and re-upload the image
          const imgRes = await fetch(imageUrl);
          if (imgRes.ok) {
            const imgBuffer = await imgRes.arrayBuffer();
            await fetch(uploadUrl, {
              method: "PUT",
              headers: {
                "Authorization": `Bearer ${linkedinAccessToken}`,
                "Content-Type": imgRes.headers.get("content-type") || "image/jpeg",
              },
              body: Buffer.from(imgBuffer),
            });
            mediaAsset = asset;
          }
        }
      } catch (mediaErr) {
        console.log("[linkedin] Image upload failed (continuing without):", mediaErr.message);
      }
    }

    // Step 2: Create post (UGC Post)
    const postBody = {
      author: orgUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: message },
          shareMediaCategory: mediaAsset ? "IMAGE" : "NONE",
        },
      },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    };

    if (mediaAsset) {
      postBody.specificContent["com.linkedin.ugc.ShareContent"].media = [{
        status: "READY",
        media: mediaAsset,
      }];
    }

    const postRes = await fetch("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${linkedinAccessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify(postBody),
    });

    if (postRes.status === 201) {
      const postId = postRes.headers.get("x-restli-id") || "created";
      return { success: true, id: postId };
    }

    const errData = await postRes.json().catch(() => ({}));
    return { success: false, error: errData.message || `HTTP ${postRes.status}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════
// GOOGLE BUSINESS PROFILE — Post via Business API
// Requires: Account ID, Location ID, Access Token
// Posts appear on Google Maps / Search listing
// ═══════════════════════════════════════════════════════
async function postToGoogleBusiness(client, message, imageUrl) {
  const { googleBusinessId, googleAccessToken } = client;
  if (!googleBusinessId || !googleAccessToken) {
    return { success: false, error: "Google Business credentials not configured" };
  }

  try {
    // googleBusinessId format: "accounts/{accountId}/locations/{locationId}"
    const locationPath = googleBusinessId.startsWith("accounts/")
      ? googleBusinessId
      : `accounts/${googleBusinessId}`;

    const postBody = {
      languageCode: "en-GB",
      summary: message.substring(0, 1500), // GBP limit is 1500 chars
      topicType: "STANDARD",
    };

    // Add image if provided
    if (imageUrl) {
      postBody.media = [{
        mediaFormat: "PHOTO",
        sourceUrl: imageUrl,
      }];
    }

    // Add CTA button — "LEARN_MORE" works for most trade businesses
    // Can be customised later via client config
    if (client.googleBusinessCta && client.googleBusinessCtaUrl) {
      postBody.callToAction = {
        actionType: client.googleBusinessCta, // BOOK, ORDER, SHOP, SIGN_UP, LEARN_MORE, CALL
        url: client.googleBusinessCtaUrl,
      };
    }

    const res = await fetch(
      `https://mybusiness.googleapis.com/v4/${locationPath}/localPosts`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${googleAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(postBody),
      }
    );

    const data = await res.json();
    if (data.name) {
      return { success: true, id: data.name };
    }
    return { success: false, error: data.error?.message || `HTTP ${res.status}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════
// TIKTOK — Post via Content Posting API
// Note: TikTok API only supports VIDEO content
// Requires: Access Token with video.upload + video.publish
// ═══════════════════════════════════════════════════════
async function postToTikTok(client, message, imageUrl) {
  const { tiktokAccessToken } = client;
  if (!tiktokAccessToken) {
    return { success: false, error: "TikTok credentials not configured" };
  }

  // TikTok Content Posting API requires video — images can be posted as photo mode (slideshow)
  // For now, we support photo posts via the photo mode endpoint
  if (!imageUrl) {
    return { success: false, error: "TikTok requires media (image or video)" };
  }

  try {
    // Step 1: Get creator info to get the open_id / creator_id
    const infoRes = await fetch("https://open.tiktokapis.com/v2/post/publish/creator_info/query/", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${tiktokAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    const infoData = await infoRes.json();
    if (infoData.error?.code !== "ok" && infoData.error?.code) {
      return { success: false, error: `Creator info failed: ${infoData.error.message || infoData.error.code}` };
    }

    // Step 2: Init photo post (single image + caption)
    const publishRes = await fetch("https://open.tiktokapis.com/v2/post/publish/inbox/video/init/", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${tiktokAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        post_info: {
          title: message.substring(0, 2200), // TikTok caption limit
          privacy_level: "PUBLIC_TO_EVERYONE",
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: {
          source: "PULL_FROM_URL",
          photo_cover_index: 0,
          photo_images: [imageUrl],
        },
        post_mode: "DIRECT_POST",
        media_type: "PHOTO",
      }),
    });

    const publishData = await publishRes.json();
    if (publishData.data?.publish_id) {
      return { success: true, id: publishData.data.publish_id };
    }
    return { success: false, error: publishData.error?.message || `HTTP ${publishRes.status}: ${JSON.stringify(publishData)}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════
// MAIN SCHEDULER — Iterates all clients, posts next queued item
// ═══════════════════════════════════════════════════════
export default async (req) => {
  const clients = getStore("clients");
  const posts = getStore("posts");
  const history = getStore("history");

  // Get all clients
  const clientList = await clients.get("list", { type: "json" }).catch(() => null);
  if (!clientList || clientList.length === 0) {
    console.log("[scheduler] No clients configured");
    return new Response(JSON.stringify({ message: "No clients" }), { status: 200 });
  }

  const results = [];

  for (const client of clientList) {
    // Must have at least one platform token
    const hasAnyToken = client.pageAccessToken || client.twitterAccessToken || client.linkedinAccessToken || client.googleAccessToken || client.tiktokAccessToken;
    if (!hasAnyToken) {
      console.log(`[scheduler] ${client.name}: No API tokens, skipping`);
      results.push({ client: client.name, status: "skipped", reason: "No API tokens" });
      continue;
    }

    // Get this client's post queue
    const postList = await posts.get(client.id, { type: "json" }).catch(() => null);
    if (!postList || postList.length === 0) {
      console.log(`[scheduler] ${client.name}: No posts`);
      results.push({ client: client.name, status: "skipped", reason: "No posts" });
      continue;
    }

    // Find next queued post (also check scheduled posts that are due)
    const now = new Date();
    const nextPost = postList.find((p) => {
      if (p.status === "queued") return true;
      if (p.status === "scheduled" && p.scheduledFor) {
        return new Date(p.scheduledFor) <= now;
      }
      return false;
    });

    if (!nextPost) {
      console.log(`[scheduler] ${client.name}: All posts published or scheduled for later`);
      results.push({ client: client.name, status: "skipped", reason: "No queued posts" });
      continue;
    }

    console.log(`[scheduler] ${client.name}: Publishing "${nextPost.caption.substring(0, 50)}..."`);
    console.log(`[scheduler] Platforms: ${nextPost.platforms.join(", ")}`);

    const postResults = {};

    // ── Facebook ──
    if (nextPost.platforms.includes("facebook") && client.fbPageId && client.pageAccessToken) {
      postResults.facebook = await postToFacebook(
        client.fbPageId,
        client.pageAccessToken,
        nextPost.caption,
        nextPost.imageUrl
      );
      console.log(`[scheduler] ${client.name} FB:`, JSON.stringify(postResults.facebook));
    }

    // ── Instagram ──
    if (nextPost.platforms.includes("instagram") && client.igUserId && client.pageAccessToken && nextPost.imageUrl) {
      postResults.instagram = await postToInstagram(
        client.igUserId,
        client.pageAccessToken,
        nextPost.caption,
        nextPost.imageUrl
      );
      console.log(`[scheduler] ${client.name} IG:`, JSON.stringify(postResults.instagram));
    }

    // ── Twitter / X ──
    if (nextPost.platforms.includes("twitter") && client.twitterAccessToken) {
      postResults.twitter = await postToTwitter(client, nextPost.caption, nextPost.imageUrl);
      console.log(`[scheduler] ${client.name} X:`, JSON.stringify(postResults.twitter));
    }

    // ── LinkedIn ──
    if (nextPost.platforms.includes("linkedin") && client.linkedinAccessToken) {
      postResults.linkedin = await postToLinkedIn(client, nextPost.caption, nextPost.imageUrl);
      console.log(`[scheduler] ${client.name} LI:`, JSON.stringify(postResults.linkedin));
    }

    // ── Google Business Profile ──
    if (nextPost.platforms.includes("google_business") && client.googleAccessToken) {
      postResults.google_business = await postToGoogleBusiness(client, nextPost.caption, nextPost.imageUrl);
      console.log(`[scheduler] ${client.name} GBP:`, JSON.stringify(postResults.google_business));
    }

    // ── TikTok ──
    if (nextPost.platforms.includes("tiktok") && client.tiktokAccessToken) {
      postResults.tiktok = await postToTikTok(client, nextPost.caption, nextPost.imageUrl);
      console.log(`[scheduler] ${client.name} TT:`, JSON.stringify(postResults.tiktok));
    }

    // Update post status
    const idx = postList.findIndex((p) => p.id === nextPost.id);
    postList[idx].status = "published";
    postList[idx].publishedAt = new Date().toISOString();
    postList[idx].results = postResults;
    await posts.setJSON(client.id, postList);

    // Log to per-client history
    const historyData = await history.get(client.id, { type: "json" }).catch(() => null) || [];
    historyData.push({
      id: nextPost.id,
      caption: nextPost.caption.substring(0, 100),
      publishedAt: postList[idx].publishedAt,
      platforms: nextPost.platforms,
      results: postResults,
    });
    await history.setJSON(client.id, historyData);

    results.push({
      client: client.name,
      status: "published",
      postId: nextPost.id,
      platforms: Object.keys(postResults),
      results: postResults,
    });
  }

  console.log(`[scheduler] Done. Processed ${results.length} clients.`);
  return new Response(JSON.stringify({ results }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

// Schedule: Mon, Wed, Fri at 10:00 UTC (11:00 BST)
export const config = {
  schedule: "0 10 * * 1,3,5",
};
