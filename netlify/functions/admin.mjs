// Admin API v2 — Multi-client social media management
import { getStore } from "@netlify/blobs";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" },
  });
}

function unauthorized() { return json({ error: "Unauthorized" }, 401); }

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
      const { name, fbPageId, igUserId, pageAccessToken, logo } = body;
      if (!name) return json({ error: "Client name required" }, 400);
      const list = (await clients.get("list", { type: "json" }).catch(() => null)) || [];
      const newClient = {
        id: "client_" + Date.now(),
        name,
        fbPageId: fbPageId || "",
        igUserId: igUserId || "",
        pageAccessToken: pageAccessToken || "",
        logo: logo || "",
        createdAt: new Date().toISOString(),
      };
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

    // ─── POST MANAGEMENT (per client) ───
    if (!clientId && ["get-posts", "add-post", "update-post", "delete-post", "reorder-post"].includes(action)) {
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
        platforms: platforms || ["facebook", "instagram"],
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

    // ─── PUBLISH NOW ───
    if (action === "publish-now" && req.method === "POST") {
      const body = await req.json();
      const postId = body.postId;
      const clientList = (await clients.get("list", { type: "json" }).catch(() => null)) || [];
      const client = clientList.find((c) => c.id === clientId);
      if (!client || !client.pageAccessToken) return json({ error: "Client not configured with API token" }, 400);

      const postList = (await posts.get(clientId, { type: "json" }).catch(() => null)) || [];
      const post = postList.find((p) => p.id === postId);
      if (!post) return json({ error: "Post not found" }, 404);

      const results = { facebook: null, instagram: null };
      const GRAPH = "https://graph.facebook.com/v21.0";

      // Post to Facebook
      if (post.platforms.includes("facebook") && client.fbPageId) {
        try {
          let ep, bd;
          if (post.imageUrl) {
            ep = `${GRAPH}/${client.fbPageId}/photos`;
            bd = new URLSearchParams({ url: post.imageUrl, message: post.caption, access_token: client.pageAccessToken });
          } else {
            ep = `${GRAPH}/${client.fbPageId}/feed`;
            bd = new URLSearchParams({ message: post.caption, access_token: client.pageAccessToken });
          }
          const r = await fetch(ep, { method: "POST", body: bd });
          const d = await r.json();
          results.facebook = d.error ? { success: false, error: d.error.message } : { success: true, id: d.id || d.post_id };
        } catch (e) { results.facebook = { success: false, error: e.message }; }
      }

      // Post to Instagram
      if (post.platforms.includes("instagram") && client.igUserId && post.imageUrl) {
        try {
          const cr = await fetch(`${GRAPH}/${client.igUserId}/media`, {
            method: "POST",
            body: new URLSearchParams({ image_url: post.imageUrl, caption: post.caption, access_token: client.pageAccessToken }),
          });
          const cd = await cr.json();
          if (cd.error) { results.instagram = { success: false, error: cd.error.message }; }
          else {
            let ready = false, attempts = 0;
            while (!ready && attempts < 10) {
              await new Promise((r) => setTimeout(r, 3000));
              const sr = await fetch(`${GRAPH}/${cd.id}?fields=status_code&access_token=${client.pageAccessToken}`);
              const sd = await sr.json();
              if (sd.status_code === "FINISHED") ready = true;
              else if (sd.status_code === "ERROR") { results.instagram = { success: false, error: "Processing failed" }; break; }
              attempts++;
            }
            if (ready) {
              const pr = await fetch(`${GRAPH}/${client.igUserId}/media_publish`, {
                method: "POST",
                body: new URLSearchParams({ creation_id: cd.id, access_token: client.pageAccessToken }),
              });
              const pd = await pr.json();
              results.instagram = pd.error ? { success: false, error: pd.error.message } : { success: true, id: pd.id };
            }
          }
        } catch (e) { results.instagram = { success: false, error: e.message }; }
      }

      // Update post status
      const pi = postList.findIndex((p) => p.id === postId);
      postList[pi].status = "published";
      postList[pi].publishedAt = new Date().toISOString();
      postList[pi].results = results;
      await posts.setJSON(clientId, postList);

      return json({ success: true, results });
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
        if (r.ok) {
          return json({ success: true, url: `https://grid-social-autoposter.netlify.app/photos/${filename}` });
        } else {
          return json({ error: d.message || "GitHub upload failed" }, 500);
        }
      } catch (e) { return json({ error: e.message }, 500); }
    }

    // ─── CONFIG CHECK ───
    if (action === "config") {
      const clientList = (await clients.get("list", { type: "json" }).catch(() => null)) || [];
      return json({ clientCount: clientList.length, clients: clientList.map((c) => ({ id: c.id, name: c.name, hasToken: !!c.pageAccessToken, hasFbPage: !!c.fbPageId, hasIg: !!c.igUserId })) });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
};

export const config = { path: "/api/admin" };
