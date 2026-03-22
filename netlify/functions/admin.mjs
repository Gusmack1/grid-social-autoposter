// Admin API — manage the post queue
// Auth via ADMIN_KEY env var in Authorization header

import { getStore } from "@netlify/blobs";

function unauthorized() {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export default async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("", {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  // Auth check
  const adminKey = process.env.ADMIN_KEY;
  const authHeader = req.headers.get("Authorization");
  if (!adminKey || authHeader !== `Bearer ${adminKey}`) {
    return unauthorized();
  }

  const store = getStore("posts");
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  try {
    // ─── GET QUEUE ───
    if (req.method === "GET" && action === "queue") {
      const queue = await store.get("queue", { type: "json" }).catch(() => null);
      return json(queue || { posts: [] });
    }

    // ─── GET HISTORY ───
    if (req.method === "GET" && action === "history") {
      const history = await store.get("history", { type: "json" }).catch(() => null);
      return json(history || { posts: [] });
    }

    // ─── GET CONFIG (safe — no tokens) ───
    if (req.method === "GET" && action === "config") {
      return json({
        hasPageToken: !!process.env.META_PAGE_ACCESS_TOKEN,
        hasPageId: !!process.env.META_PAGE_ID,
        hasIgUserId: !!process.env.META_IG_USER_ID,
        pageId: process.env.META_PAGE_ID || "not set",
        igUserId: process.env.META_IG_USER_ID || "not set",
      });
    }

    // ─── ADD POST TO QUEUE ───
    if (req.method === "POST" && action === "add") {
      const body = await req.json();
      const { caption, imageUrl, platforms } = body;

      if (!caption) {
        return json({ error: "Caption is required" }, 400);
      }

      const queue = (await store.get("queue", { type: "json" }).catch(() => null)) || { posts: [] };

      const newPost = {
        id: `post_${Date.now()}`,
        caption,
        imageUrl: imageUrl || null,
        platforms: platforms || ["facebook", "instagram"],
        status: "queued",
        createdAt: new Date().toISOString(),
        publishedAt: null,
        results: null,
      };

      queue.posts.push(newPost);
      await store.setJSON("queue", queue);

      return json({ success: true, post: newPost });
    }

    // ─── REORDER POST (move up/down) ───
    if (req.method === "PUT" && action === "reorder") {
      const { postId, direction } = await req.json();
      const queue = (await store.get("queue", { type: "json" }).catch(() => null)) || { posts: [] };

      const idx = queue.posts.findIndex((p) => p.id === postId);
      if (idx === -1) return json({ error: "Post not found" }, 404);

      const newIdx = direction === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= queue.posts.length) {
        return json({ error: "Cannot move further" }, 400);
      }

      [queue.posts[idx], queue.posts[newIdx]] = [queue.posts[newIdx], queue.posts[idx]];
      await store.setJSON("queue", queue);

      return json({ success: true });
    }

    // ─── DELETE POST FROM QUEUE ───
    if (req.method === "DELETE" && action === "delete") {
      const { postId } = await req.json();
      const queue = (await store.get("queue", { type: "json" }).catch(() => null)) || { posts: [] };

      queue.posts = queue.posts.filter((p) => p.id !== postId);
      await store.setJSON("queue", queue);

      return json({ success: true });
    }

    // ─── TRIGGER MANUAL POST NOW ───
    if (req.method === "POST" && action === "publish-now") {
      // Import and call the scheduled function logic
      const triggerUrl = `${url.origin}/.netlify/functions/scheduled-post`;
      const res = await fetch(triggerUrl);
      const result = await res.json().catch(() => ({ status: res.status }));
      return json({ triggered: true, result });
    }

    return json({ error: "Unknown action", available: ["queue", "history", "config", "add", "reorder", "delete", "publish-now"] }, 400);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
};

export const config = {
  path: "/api/admin",
};
