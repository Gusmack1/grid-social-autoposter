// Admin API v3 — Multi-client, multi-platform social media management
import { getStore } from "@netlify/blobs";
import crypto from "crypto";

const GRAPH = "https://graph.facebook.com/v21.0";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" },
  });
}

function unauthorized() { return json({ error: "Unauthorized" }, 401); }

// ═══════════════════════════════════════════════════════
// PLATFORM POSTING FUNCTIONS
// ═══════════════════════════════════════════════════════

async function postToFacebook(client, caption, imageUrl) {
  if (!client.fbPageId || !client.pageAccessToken) return null;
  try {
    let ep, bd;
    if (imageUrl) {
      ep = `${GRAPH}/${client.fbPageId}/photos`;
      bd = new URLSearchParams({ url: imageUrl, message: caption, access_token: client.pageAccessToken });
    } else {
      ep = `${GRAPH}/${client.fbPageId}/feed`;
      bd = new URLSearchParams({ message: caption, access_token: client.pageAccessToken });
    }
    const r = await fetch(ep, { method: "POST", body: bd });
    const d = await r.json();
    return d.error ? { success: false, error: d.error.message } : { success: true, id: d.id || d.post_id };
  } catch (e) { return { success: false, error: e.message }; }
}

async function postToInstagram(client, caption, imageUrl) {
  if (!client.igUserId || !client.pageAccessToken || !imageUrl) return null;
  try {
    const cr = await fetch(`${GRAPH}/${client.igUserId}/media`, {
      method: "POST",
      body: new URLSearchParams({ image_url: imageUrl, caption, access_token: client.pageAccessToken }),
    });
    const cd = await cr.json();
    if (cd.error) return { success: false, error: cd.error.message };

    let ready = false, attempts = 0;
    while (!ready && attempts < 10) {
      await new Promise((r) => setTimeout(r, 3000));
      const sr = await fetch(`${GRAPH}/${cd.id}?fields=status_code&access_token=${client.pageAccessToken}`);
      const sd = await sr.json();
      if (sd.status_code === "FINISHED") ready = true;
      else if (sd.status_code === "ERROR") return { success: false, error: "Processing failed" };
      attempts++;
    }
    if (!ready) return { success: false, error: "Timed out" };

    const pr = await fetch(`${GRAPH}/${client.igUserId}/media_publish`, {
      method: "POST",
      body: new URLSearchParams({ creation_id: cd.id, access_token: client.pageAccessToken }),
    });
    const pd = await pr.json();
    return pd.error ? { success: false, error: pd.error.message } : { success: true, id: pd.id };
  } catch (e) { return { success: false, error: e.message }; }
}

// Twitter OAuth 1.0a helpers
function percentEncode(str) {
  return encodeURIComponent(str).replace(/!/g, "%21").replace(/\*/g, "%2A").replace(/'/g, "%27").replace(/\(/g, "%28").replace(/\)/g, "%29");
}
function oauthSig(method, url, params, consumerSecret, tokenSecret) {
  const sorted = Object.keys(params).sort().map(k => `${percentEncode(k)}=${percentEncode(params[k])}`).join("&");
  const base = `${method}&${percentEncode(url)}&${percentEncode(sorted)}`;
  const key = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  return crypto.createHmac("sha1", key).update(base).digest("base64");
}
function oauthHeader(method, url, bodyParams, apiKey, apiSecret, accessToken, accessSecret) {
  const oauthParams = {
    oauth_consumer_key: apiKey, oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1", oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken, oauth_version: "1.0",
  };
  const allParams = { ...oauthParams, ...bodyParams };
  oauthParams.oauth_signature = oauthSig(method, url, allParams, apiSecret, accessSecret);
  return `OAuth ${Object.keys(oauthParams).sort().map(k => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`).join(", ")}`;
}

async function postToTwitter(client, caption, imageUrl) {
  if (!client.twitterApiKey || !client.twitterApiSecret || !client.twitterAccessToken || !client.twitterAccessSecret) return null;
  try {
    let mediaId = null;
    if (imageUrl) {
      try {
        const imgRes = await fetch(imageUrl);
        if (imgRes.ok) {
          const imgBase64 = Buffer.from(await imgRes.arrayBuffer()).toString("base64");
          const uploadUrl = "https://upload.twitter.com/1.1/media/upload.json";
          const uploadBody = { media_data: imgBase64, media_category: "tweet_image" };
          const uploadAuth = oauthHeader("POST", uploadUrl, uploadBody, client.twitterApiKey, client.twitterApiSecret, client.twitterAccessToken, client.twitterAccessSecret);
          const uploadRes = await fetch(uploadUrl, { method: "POST", headers: { "Authorization": uploadAuth, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(uploadBody) });
          const uploadData = await uploadRes.json();
          if (uploadData.media_id_string) mediaId = uploadData.media_id_string;
        }
      } catch (e) { console.log("[twitter] media error:", e.message); }
    }
    const tweetUrl = "https://api.x.com/2/tweets";
    const tweetBody = { text: caption.substring(0, 280) };
    if (mediaId) tweetBody.media = { media_ids: [mediaId] };
    const tweetAuth = oauthHeader("POST", tweetUrl, {}, client.twitterApiKey, client.twitterApiSecret, client.twitterAccessToken, client.twitterAccessSecret);
    const tweetRes = await fetch(tweetUrl, { method: "POST", headers: { "Authorization": tweetAuth, "Content-Type": "application/json" }, body: JSON.stringify(tweetBody) });
    const tweetData = await tweetRes.json();
    if (tweetData.data?.id) return { success: true, id: tweetData.data.id };
    return { success: false, error: tweetData.detail || tweetData.title || JSON.stringify(tweetData.errors || tweetData) };
  } catch (e) { return { success: false, error: e.message }; }
}

async function postToLinkedIn(client, caption, imageUrl) {
  if (!client.linkedinId || !client.linkedinAccessToken) return null;
  try {
    const orgUrn = client.linkedinId.startsWith("urn:") ? client.linkedinId : `urn:li:organization:${client.linkedinId}`;
    let mediaAsset = null;
    if (imageUrl) {
      try {
        const regRes = await fetch("https://api.linkedin.com/v2/assets?action=registerUpload", {
          method: "POST",
          headers: { "Authorization": `Bearer ${client.linkedinAccessToken}`, "Content-Type": "application/json", "X-Restli-Protocol-Version": "2.0.0" },
          body: JSON.stringify({ registerUploadRequest: { recipes: ["urn:li:digitalmediaRecipe:feedshare-image"], owner: orgUrn, serviceRelationships: [{ relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" }] } }),
        });
        const regData = await regRes.json();
        const uploadUrl = regData.value?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]?.uploadUrl;
        const asset = regData.value?.asset;
        if (uploadUrl && asset) {
          const imgRes = await fetch(imageUrl);
          if (imgRes.ok) {
            await fetch(uploadUrl, { method: "PUT", headers: { "Authorization": `Bearer ${client.linkedinAccessToken}`, "Content-Type": imgRes.headers.get("content-type") || "image/jpeg" }, body: Buffer.from(await imgRes.arrayBuffer()) });
            mediaAsset = asset;
          }
        }
      } catch (e) { console.log("[linkedin] image error:", e.message); }
    }
    const postBody = { author: orgUrn, lifecycleState: "PUBLISHED", specificContent: { "com.linkedin.ugc.ShareContent": { shareCommentary: { text: caption }, shareMediaCategory: mediaAsset ? "IMAGE" : "NONE" } }, visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" } };
    if (mediaAsset) postBody.specificContent["com.linkedin.ugc.ShareContent"].media = [{ status: "READY", media: mediaAsset }];
    const postRes = await fetch("https://api.linkedin.com/v2/ugcPosts", { method: "POST", headers: { "Authorization": `Bearer ${client.linkedinAccessToken}`, "Content-Type": "application/json", "X-Restli-Protocol-Version": "2.0.0" }, body: JSON.stringify(postBody) });
    if (postRes.status === 201) return { success: true, id: postRes.headers.get("x-restli-id") || "created" };
    const errData = await postRes.json().catch(() => ({}));
    return { success: false, error: errData.message || `HTTP ${postRes.status}` };
  } catch (e) { return { success: false, error: e.message }; }
}

async function postToGoogleBusiness(client, caption, imageUrl) {
  if (!client.gbpId || !client.gbpAccessToken) return null;
  try {
    const locPath = client.gbpId.startsWith("accounts/") ? client.gbpId : `accounts/${client.gbpId}`;
    const postBody = { languageCode: "en-GB", summary: caption.substring(0, 1500), topicType: "STANDARD" };
    if (imageUrl) postBody.media = [{ mediaFormat: "PHOTO", sourceUrl: imageUrl }];
    if (client.gbpCta && client.gbpCtaUrl) postBody.callToAction = { actionType: client.gbpCta, url: client.gbpCtaUrl };
    const res = await fetch(`https://mybusiness.googleapis.com/v4/${locPath}/localPosts`, { method: "POST", headers: { "Authorization": `Bearer ${client.gbpAccessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(postBody) });
    const data = await res.json();
    if (data.name) return { success: true, id: data.name };
    return { success: false, error: data.error?.message || `HTTP ${res.status}` };
  } catch (e) { return { success: false, error: e.message }; }
}

async function postToTikTok(client, caption, imageUrl) {
  if (!client.tiktokAccessToken || !imageUrl) return null;
  try {
    const publishRes = await fetch("https://open.tiktokapis.com/v2/post/publish/inbox/video/init/", {
      method: "POST",
      headers: { "Authorization": `Bearer ${client.tiktokAccessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ post_info: { title: caption.substring(0, 2200), privacy_level: "PUBLIC_TO_EVERYONE", disable_duet: false, disable_comment: false, disable_stitch: false }, source_info: { source: "PULL_FROM_URL", photo_cover_index: 0, photo_images: [imageUrl] }, post_mode: "DIRECT_POST", media_type: "PHOTO" }),
    });
    const data = await publishRes.json();
    if (data.data?.publish_id) return { success: true, id: data.data.publish_id };
    return { success: false, error: data.error?.message || `HTTP ${publishRes.status}` };
  } catch (e) { return { success: false, error: e.message }; }
}

// Publish a post to all selected platforms
async function publishToAll(client, post) {
  const results = {};
  if (post.platforms.includes("facebook")) { const r = await postToFacebook(client, post.caption, post.imageUrl); if (r) results.facebook = r; }
  if (post.platforms.includes("instagram")) { const r = await postToInstagram(client, post.caption, post.imageUrl); if (r) results.instagram = r; }
  if (post.platforms.includes("twitter")) { const r = await postToTwitter(client, post.caption, post.imageUrl); if (r) results.twitter = r; }
  if (post.platforms.includes("linkedin")) { const r = await postToLinkedIn(client, post.caption, post.imageUrl); if (r) results.linkedin = r; }
  if (post.platforms.includes("google_business")) { const r = await postToGoogleBusiness(client, post.caption, post.imageUrl); if (r) results.google_business = r; }
  if (post.platforms.includes("tiktok")) { const r = await postToTikTok(client, post.caption, post.imageUrl); if (r) results.tiktok = r; }
  return results;
}

// ═══════════════════════════════════════════════════════
// DELETE FROM PLATFORM
// ═══════════════════════════════════════════════════════

async function deleteFromFacebook(postId, token) {
  try {
    const r = await fetch(`${GRAPH}/${postId}`, { method: "DELETE", body: new URLSearchParams({ access_token: token }) });
    const d = await r.json();
    return d.success ? { success: true } : { success: false, error: d.error?.message || "Failed" };
  } catch (e) { return { success: false, error: e.message }; }
}

async function deleteFromInstagram(postId, token) {
  // Note: IG Graph API does NOT support deleting media via API for user tokens
  // Only system user tokens — which also don't work. This is a known Meta limitation.
  return { success: false, error: "Instagram does not allow API deletion — delete manually in the app" };
}

async function deleteFromTwitter(tweetId, client) {
  if (!client.twitterApiKey || !client.twitterAccessToken) return { success: false, error: "No Twitter credentials" };
  try {
    const url = `https://api.x.com/2/tweets/${tweetId}`;
    const auth = oauthHeader("DELETE", url, {}, client.twitterApiKey, client.twitterApiSecret, client.twitterAccessToken, client.twitterAccessSecret);
    const r = await fetch(url, { method: "DELETE", headers: { "Authorization": auth } });
    const d = await r.json();
    return d.data?.deleted ? { success: true } : { success: false, error: JSON.stringify(d) };
  } catch (e) { return { success: false, error: e.message }; }
}

// ═══════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════

export default async (req) => {
  if (req.method === "OPTIONS") return new Response("", { status: 200, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" } });

  const adminKey = process.env.ADMIN_KEY;
  const authHeader = req.headers.get("Authorization");
  if (!adminKey || authHeader !== `Bearer ${adminKey}`) return unauthorized();

  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const clientId = url.searchParams.get("clientId");

  try {
    const clients = getStore("clients");
    const posts = getStore("posts");

    // ─── CLIENT MANAGEMENT ───
    if (action === "get-clients") {
      const data = await clients.get("list", { type: "json" }).catch(() => null);
      return json(data || []);
    }

    if (action === "add-client" && req.method === "POST") {
      const body = await req.json();
      const { name } = body;
      if (!name) return json({ error: "Client name required" }, 400);
      const list = (await clients.get("list", { type: "json" }).catch(() => null)) || [];
      const newClient = { id: "client_" + Date.now(), name, createdAt: new Date().toISOString(), ...body };
      delete newClient.name; // avoid double
      newClient.name = name;
      list.push(newClient);
      await clients.setJSON("list", list);
      return json({ success: true, client: newClient });
    }

    if (action === "update-client" && req.method === "PUT") {
      const body = await req.json();
      const list = (await clients.get("list", { type: "json" }).catch(() => null)) || [];
      const idx = list.findIndex((c) => c.id === body.id);
      if (idx === -1) return json({ error: "Client not found" }, 404);
      list[idx] = { ...list[idx], ...body, updatedAt: new Date().toISOString() };
      await clients.setJSON("list", list);
      return json({ success: true, client: list[idx] });
    }

    if (action === "delete-client" && req.method === "DELETE") {
      const body = await req.json();
      let list = (await clients.get("list", { type: "json" }).catch(() => null)) || [];
      list = list.filter((c) => c.id !== body.id);
      await clients.setJSON("list", list);
      return json({ success: true });
    }

    // ─── POST MANAGEMENT ───
    if (!clientId && ["get-posts", "add-post", "update-post", "delete-post", "reorder-post", "publish-now", "delete-from-platform"].includes(action)) {
      return json({ error: "clientId required" }, 400);
    }

    if (action === "get-posts") {
      const data = await posts.get(clientId, { type: "json" }).catch(() => null);
      return json(data || []);
    }

    if (action === "add-post" && req.method === "POST") {
      const body = await req.json();
      const { caption, imageUrl, platforms, scheduledFor } = body;
      if (!caption) return json({ error: "Caption required" }, 400);
      const list = (await posts.get(clientId, { type: "json" }).catch(() => null)) || [];
      const newPost = {
        id: "post_" + Date.now(),
        clientId,
        caption,
        imageUrl: imageUrl || null,
        platforms: platforms || ["facebook"],
        status: scheduledFor ? "scheduled" : "queued",
        scheduledFor: scheduledFor || null,
        createdAt: new Date().toISOString(),
        publishedAt: null,
        results: null,
      };
      list.push(newPost);
      await posts.setJSON(clientId, list);
      return json({ success: true, post: newPost });
    }

    if (action === "update-post" && req.method === "PUT") {
      const body = await req.json();
      const list = (await posts.get(clientId, { type: "json" }).catch(() => null)) || [];
      const idx = list.findIndex((p) => p.id === body.postId);
      if (idx === -1) return json({ error: "Post not found" }, 404);
      Object.assign(list[idx], body.updates);
      await posts.setJSON(clientId, list);
      return json({ success: true });
    }

    if (action === "delete-post" && req.method === "DELETE") {
      const body = await req.json();
      let list = (await posts.get(clientId, { type: "json" }).catch(() => null)) || [];
      list = list.filter((p) => p.id !== body.postId);
      await posts.setJSON(clientId, list);
      return json({ success: true });
    }

    // ─── PUBLISH NOW (all 6 platforms) ───
    if (action === "publish-now" && req.method === "POST") {
      const body = await req.json();
      const postId = body.postId;
      const clientList = (await clients.get("list", { type: "json" }).catch(() => null)) || [];
      const client = clientList.find((c) => c.id === clientId);
      if (!client) return json({ error: "Client not found" }, 404);

      // Check they have at least one token
      const hasToken = client.pageAccessToken || client.twitterAccessToken || client.linkedinAccessToken || client.gbpAccessToken || client.tiktokAccessToken;
      if (!hasToken) return json({ error: "No API tokens configured — go to Clients & API to connect a platform" }, 400);

      const postList = (await posts.get(clientId, { type: "json" }).catch(() => null)) || [];
      const post = postList.find((p) => p.id === postId);
      if (!post) return json({ error: "Post not found" }, 404);

      console.log(`[publish-now] ${client.name}: "${post.caption.substring(0, 50)}..." → ${post.platforms.join(", ")}`);

      const results = await publishToAll(client, post);

      // Update post status
      const pi = postList.findIndex((p) => p.id === postId);
      postList[pi].status = "published";
      postList[pi].publishedAt = new Date().toISOString();
      postList[pi].results = results;
      await posts.setJSON(clientId, postList);

      // Check if any succeeded
      const anySuccess = Object.values(results).some(r => r?.success);
      const allFailed = Object.values(results).every(r => r && !r.success);
      const errorSummary = allFailed ? Object.entries(results).map(([k, v]) => `${k}: ${v.error}`).join("; ") : null;

      return json({ success: !allFailed, results, error: errorSummary });
    }

    // ─── PUBLISH DIRECT (create + publish in one step, skips queue) ───
    if (action === "publish-direct" && req.method === "POST") {
      const body = await req.json();
      const { caption, imageUrl, platforms } = body;
      if (!caption) return json({ error: "Caption required" }, 400);

      const clientList = (await clients.get("list", { type: "json" }).catch(() => null)) || [];
      const client = clientList.find((c) => c.id === clientId);
      if (!client) return json({ error: "Client not found" }, 404);

      const hasToken = client.pageAccessToken || client.twitterAccessToken || client.linkedinAccessToken || client.gbpAccessToken || client.tiktokAccessToken;
      if (!hasToken) return json({ error: "No API tokens configured" }, 400);

      console.log(`[publish-direct] ${client.name}: "${caption.substring(0, 50)}..." → ${platforms.join(", ")}`);

      const post = { caption, imageUrl, platforms: platforms || ["facebook"] };
      const results = await publishToAll(client, post);

      // Save to post list as published
      const list = (await posts.get(clientId, { type: "json" }).catch(() => null)) || [];
      const newPost = {
        id: "post_" + Date.now(),
        clientId,
        caption,
        imageUrl: imageUrl || null,
        platforms: platforms || ["facebook"],
        status: "published",
        scheduledFor: null,
        createdAt: new Date().toISOString(),
        publishedAt: new Date().toISOString(),
        results,
      };
      list.push(newPost);
      await posts.setJSON(clientId, list);

      const anySuccess = Object.values(results).some(r => r?.success);
      const allFailed = Object.values(results).length > 0 && Object.values(results).every(r => r && !r.success);
      const errorSummary = allFailed ? Object.entries(results).map(([k, v]) => `${k}: ${v.error}`).join("; ") : null;

      return json({ success: !allFailed, results, post: newPost, error: errorSummary });
    }

    // ─── DELETE FROM PLATFORM ───
    if (action === "delete-from-platform" && req.method === "POST") {
      const body = await req.json();
      const { postId, platform } = body;

      const clientList = (await clients.get("list", { type: "json" }).catch(() => null)) || [];
      const client = clientList.find((c) => c.id === clientId);
      if (!client) return json({ error: "Client not found" }, 404);

      const postList = (await posts.get(clientId, { type: "json" }).catch(() => null)) || [];
      const post = postList.find((p) => p.id === postId);
      if (!post) return json({ error: "Post not found" }, 404);

      const platformResult = post.results?.[platform];
      if (!platformResult?.id) return json({ error: `No ${platform} post ID found` }, 400);

      let deleteResult;
      if (platform === "facebook") {
        deleteResult = await deleteFromFacebook(platformResult.id, client.pageAccessToken);
      } else if (platform === "instagram") {
        deleteResult = await deleteFromInstagram(platformResult.id, client.pageAccessToken);
      } else if (platform === "twitter") {
        deleteResult = await deleteFromTwitter(platformResult.id, client);
      } else {
        deleteResult = { success: false, error: `Delete not supported for ${platform}` };
      }

      // Update the post record
      if (deleteResult.success) {
        const pi = postList.findIndex((p) => p.id === postId);
        postList[pi].results[platform] = { ...platformResult, deleted: true, deletedAt: new Date().toISOString() };
        await posts.setJSON(clientId, postList);
      }

      return json({ success: deleteResult.success, result: deleteResult });
    }

    // ─── IMAGE UPLOAD (to GitHub repo) ───
    if (action === "upload-image" && req.method === "POST") {
      const body = await req.json();
      const { filename, content } = body;
      if (!filename || !content) return json({ error: "filename and content required" }, 400);
      const ghToken = process.env.GITHUB_TOKEN;
      if (!ghToken) return json({ error: "GITHUB_TOKEN not configured" }, 500);
      try {
        const r = await fetch(`https://api.github.com/repos/Gusmack1/grid-social-autoposter/contents/public/photos/${filename}`, {
          method: "PUT",
          headers: { "Authorization": `token ${ghToken}`, "Content-Type": "application/json", "User-Agent": "GridSocial" },
          body: JSON.stringify({ message: `Upload ${filename}`, content }),
        });
        const d = await r.json();
        if (r.ok) return json({ success: true, url: `https://grid-social-autoposter.netlify.app/photos/${filename}` });
        else return json({ error: d.message || "GitHub upload failed" }, 500);
      } catch (e) { return json({ error: e.message }, 500); }
    }

    // ─── CONFIG CHECK ───
    if (action === "config") {
      const clientList = (await clients.get("list", { type: "json" }).catch(() => null)) || [];
      return json({
        clientCount: clientList.length,
        clients: clientList.map((c) => ({
          id: c.id, name: c.name,
          hasToken: !!(c.pageAccessToken || c.twitterAccessToken || c.linkedinAccessToken || c.gbpAccessToken || c.tiktokAccessToken),
          hasFbPage: !!c.fbPageId, hasIg: !!c.igUserId,
          hasTwitter: !!c.twitterAccessToken, hasLinkedIn: !!c.linkedinAccessToken,
          hasGbp: !!c.gbpAccessToken, hasTikTok: !!c.tiktokAccessToken,
        })),
      });
    }

    return json({ error: "Unknown action: " + action }, 400);
  } catch (err) {
    console.error("[admin] Error:", err);
    return json({ error: err.message }, 500);
  }
};

export const config = { path: "/api/admin" };
