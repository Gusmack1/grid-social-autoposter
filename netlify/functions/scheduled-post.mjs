// Scheduled auto-poster — runs Mon, Wed, Fri at 10:00 UK time
// Posts to Facebook Page + Instagram Business via Meta Graph API

import { getStore } from "@netlify/blobs";
import fetch from "node-fetch";

// ─── CONFIG ───
const GRAPH_API = "https://graph.facebook.com/v21.0";

// ─── HELPER: Post to Facebook Page ───
async function postToFacebook(pageId, token, message, imageUrl) {
  try {
    let endpoint, body;

    if (imageUrl) {
      endpoint = `${GRAPH_API}/${pageId}/photos`;
      body = new URLSearchParams({
        url: imageUrl,
        message: message,
        access_token: token,
      });
    } else {
      endpoint = `${GRAPH_API}/${pageId}/feed`;
      body = new URLSearchParams({
        message: message,
        access_token: token,
      });
    }

    const res = await fetch(endpoint, { method: "POST", body });
    const data = await res.json();

    if (data.error) {
      return { success: false, error: data.error.message };
    }
    return { success: true, id: data.id || data.post_id };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ─── HELPER: Post to Instagram Business ───
async function postToInstagram(igUserId, token, caption, imageUrl) {
  try {
    if (!imageUrl) {
      return { success: false, error: "Instagram requires an image" };
    }

    // Step 1: Create media container
    const containerRes = await fetch(`${GRAPH_API}/${igUserId}/media`, {
      method: "POST",
      body: new URLSearchParams({
        image_url: imageUrl,
        caption: caption,
        access_token: token,
      }),
    });
    const containerData = await containerRes.json();

    if (containerData.error) {
      return { success: false, error: containerData.error.message };
    }

    // Step 2: Wait for container to be ready (Instagram processes the image)
    const containerId = containerData.id;
    let ready = false;
    let attempts = 0;

    while (!ready && attempts < 10) {
      await new Promise((r) => setTimeout(r, 3000)); // wait 3s
      const statusRes = await fetch(
        `${GRAPH_API}/${containerId}?fields=status_code&access_token=${token}`
      );
      const statusData = await statusRes.json();
      if (statusData.status_code === "FINISHED") {
        ready = true;
      } else if (statusData.status_code === "ERROR") {
        return { success: false, error: "Instagram media processing failed" };
      }
      attempts++;
    }

    if (!ready) {
      return { success: false, error: "Instagram media processing timed out" };
    }

    // Step 3: Publish the container
    const publishRes = await fetch(
      `${GRAPH_API}/${igUserId}/media_publish`,
      {
        method: "POST",
        body: new URLSearchParams({
          creation_id: containerId,
          access_token: token,
        }),
      }
    );
    const publishData = await publishRes.json();

    if (publishData.error) {
      return { success: false, error: publishData.error.message };
    }

    return { success: true, id: publishData.id };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ─── MAIN HANDLER ───
export default async (req) => {
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  const pageId = process.env.META_PAGE_ID;
  const igUserId = process.env.META_IG_USER_ID;

  if (!token || !pageId) {
    console.log("Missing META_PAGE_ACCESS_TOKEN or META_PAGE_ID");
    return new Response("Config missing", { status: 500 });
  }

  // Get post queue from Netlify Blobs
  const store = getStore("posts");
  const queueBlob = await store.get("queue", { type: "json" });

  if (!queueBlob || !queueBlob.posts || queueBlob.posts.length === 0) {
    console.log("No posts in queue");
    return new Response("Queue empty", { status: 200 });
  }

  // Find the next unpublished post
  const queue = queueBlob;
  const nextPost = queue.posts.find((p) => p.status === "queued");

  if (!nextPost) {
    console.log("All posts already published");
    return new Response("All published", { status: 200 });
  }

  console.log(`Publishing post: ${nextPost.id} — "${nextPost.caption.substring(0, 50)}..."`);

  const results = { facebook: null, instagram: null };

  // Post to Facebook
  if (nextPost.platforms.includes("facebook")) {
    results.facebook = await postToFacebook(
      pageId,
      token,
      nextPost.caption,
      nextPost.imageUrl
    );
    console.log("Facebook result:", JSON.stringify(results.facebook));
  }

  // Post to Instagram (only if IG user ID is configured and image exists)
  if (nextPost.platforms.includes("instagram") && igUserId && nextPost.imageUrl) {
    results.instagram = await postToInstagram(
      igUserId,
      token,
      nextPost.caption,
      nextPost.imageUrl
    );
    console.log("Instagram result:", JSON.stringify(results.instagram));
  }

  // Update post status
  nextPost.status = "published";
  nextPost.publishedAt = new Date().toISOString();
  nextPost.results = results;

  // Save updated queue
  await store.setJSON("queue", queue);

  // Also log to history
  const historyBlob = await store.get("history", { type: "json" }).catch(() => null);
  const history = historyBlob || { posts: [] };
  history.posts.push({
    id: nextPost.id,
    caption: nextPost.caption.substring(0, 100),
    publishedAt: nextPost.publishedAt,
    results,
  });
  await store.setJSON("history", history);

  return new Response(
    JSON.stringify({ published: nextPost.id, results }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};

// Schedule: Mon, Wed, Fri at 10:00 UTC (11:00 BST)
export const config = {
  schedule: "0 10 * * 1,3,5",
};
