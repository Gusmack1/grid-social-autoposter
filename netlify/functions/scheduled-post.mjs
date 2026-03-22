// Scheduled auto-poster v2 — Multi-client
// Runs Mon, Wed, Fri at 10:00 UTC (11:00 BST)
// Iterates ALL clients, publishes next queued post for each

import { getStore } from "@netlify/blobs";

const GRAPH_API = "https://graph.facebook.com/v21.0";

// ─── Post to Facebook Page ───
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

// ─── Post to Instagram Business ───
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

// ─── MAIN HANDLER ───
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
    if (!client.pageAccessToken) {
      console.log(`[scheduler] ${client.name}: No API token, skipping`);
      results.push({ client: client.name, status: "skipped", reason: "No API token" });
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

    const postResults = { facebook: null, instagram: null };

    // Post to Facebook
    if (nextPost.platforms.includes("facebook") && client.fbPageId) {
      postResults.facebook = await postToFacebook(
        client.fbPageId,
        client.pageAccessToken,
        nextPost.caption,
        nextPost.imageUrl
      );
      console.log(`[scheduler] ${client.name} FB:`, JSON.stringify(postResults.facebook));
    }

    // Post to Instagram
    if (nextPost.platforms.includes("instagram") && client.igUserId && nextPost.imageUrl) {
      postResults.instagram = await postToInstagram(
        client.igUserId,
        client.pageAccessToken,
        nextPost.caption,
        nextPost.imageUrl
      );
      console.log(`[scheduler] ${client.name} IG:`, JSON.stringify(postResults.instagram));
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
      results: postResults,
    });
    await history.setJSON(client.id, historyData);

    results.push({
      client: client.name,
      status: "published",
      postId: nextPost.id,
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
