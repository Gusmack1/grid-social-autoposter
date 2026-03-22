// Admin API v3 — Multi-client, multi-platform social media management
import { getStore } from "@netlify/blobs";
import crypto from "crypto";

const GRAPH_API = "https://graph.facebook.com/v21.0";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" },
  });
}
function unauthorized() { return json({ error: "Unauthorized" }, 401); }

async function postToFacebook(client, caption, imageUrl) {
  if (!client.fbPageId || !client.pageAccessToken) return null;
  try {
    let ep, bd;
    if (imageUrl) {
      ep = `${GRAPH_API}/${client.fbPageId}/photos`;
      bd = new URLSearchParams({ url: imageUrl, message: caption, access_token: client.pageAccessToken });
    } else {
      ep = `${GRAPH_API}/${client.fbPageId}/feed`;
      bd = new URLSearchParams({ message: caption, access_token: client.pageAccessToken });
    }
    const r = await fetch(ep, { method: "POST", body: bd });
    const d = await r.json();
    if (d.error) return { success: false, error: d.error.message };
    return { success: true, id: d.id || d.post_id };
  } catch (e) { return { success: false, error: e.message }; }
}

async function postToInstagram(client, caption, imageUrl) {
  if (!client.igUserId || !client.pageAccessToken || !imageUrl) return null;
  try {
    const cr = await fetch(`${GRAPH_API}/${client.igUserId}/media`, {
      method: "POST",
      body: new URLSearchParams({ image_url: imageUrl, caption, access_token: client.pageAccessToken }),
    });
    const cd = await cr.json();
    if (cd.error) return { success: false, error: cd.error.message };
    let ready = false, attempts = 0;
    while (!ready && attempts < 10) {
      await new Promise((r) => setTimeout(r, 3000));
      const sr = await fetch(`${GRAPH_API}/${cd.id}?fields=status_code&access_token=${client.pageAccessToken}`);
      const sd = await sr.json();
      if (sd.status_code === "FINISHED") ready = true;
      else if (sd.status_code === "ERROR") return { success: false, error: "Processing failed" };
      attempts++;
    }
    if (!ready) return { success: false, error: "Timed out" };
    const pr = await fetch(`${GRAPH_API}/${client.igUserId}/media_publish`, {
      method: "POST",
      body: new URLSearchParams({ creation_id: cd.id, access_token: client.pageAccessToken }),
    });
    const pd = await pr.json();
    if (pd.error) return { success: false, error: pd.error.message };
    return { success: true, id: pd.id };
  } catch (e) { return { success: false, error: e.message }; }
}

function percentEncode(str) {
  return encodeURIComponent(str).replace(/!/g, "%21").replace(/\*/g, "%2A").replace(/'/g, "%27").replace(/\(/g, "%28").replace(/\)/g, "%29");
}
function oauthSig(method, url, params, cs, ts) {
  const sorted = Object.keys(params).sort().map(k => `${percentEncode(k)}=${percentEncode(params[k])}`).join("&");
  const base = `${method}&${percentEncode(url)}&${percentEncode(sorted)}`;
  return crypto.createHmac("sha1", `${percentEncode(cs)}&${percentEncode(ts)}`).update(base).digest("base64");
}
function oauthHeader(method, url, ak, as, at, ats) {
  const oa = { oauth_consumer_key: ak, oauth_nonce: crypto.randomBytes(16).toString("hex"), oauth_signature_method: "HMAC-SHA1", oauth_timestamp: Math.floor(Date.now()/1000).toString(), oauth_token: at, oauth_version: "1.0" };
  oa.oauth_signature = oauthSig(method, url, oa, as, ats);
  return `OAuth ${Object.keys(oa).sort().map(k=>`${percentEncode(k)}="${percentEncode(oa[k])}"`).join(", ")}`;
}

async function postToTwitter(client, caption, imageUrl) {
  if (!client.twitterApiKey || !client.twitterApiSecret || !client.twitterAccessToken || !client.twitterAccessSecret) return null;
  try {
    let mediaId = null;
    if (imageUrl) {
      try {
        const imgRes = await fetch(imageUrl);
        if (imgRes.ok) {
          const b64 = Buffer.from(await imgRes.arrayBuffer()).toString("base64");
          const uUrl = "https://upload.twitter.com/1.1/media/upload.json";
          const body = { media_data: b64, media_category: "tweet_image" };
          const oa = { oauth_consumer_key: client.twitterApiKey, oauth_nonce: crypto.randomBytes(16).toString("hex"), oauth_signature_method: "HMAC-SHA1", oauth_timestamp: Math.floor(Date.now()/1000).toString(), oauth_token: client.twitterAccessToken, oauth_version: "1.0" };
          oa.oauth_signature = oauthSig("POST", uUrl, {...oa,...body}, client.twitterApiSecret, client.twitterAccessSecret);
          const auth = `OAuth ${Object.keys(oa).sort().map(k=>`${percentEncode(k)}="${percentEncode(oa[k])}"`).join(", ")}`;
          const ud = await (await fetch(uUrl, { method: "POST", headers: {"Authorization": auth, "Content-Type": "application/x-www-form-urlencoded"}, body: new URLSearchParams(body) })).json();
          if (ud.media_id_string) mediaId = ud.media_id_string;
        }
      } catch(me) { console.log("[twitter] media err:", me.message); }
    }
    const tUrl = "https://api.x.com/2/tweets";
    const tb = { text: caption.substring(0, 280) };
    if (mediaId) tb.media = { media_ids: [mediaId] };
    const auth = oauthHeader("POST", tUrl, client.twitterApiKey, client.twitterApiSecret, client.twitterAccessToken, client.twitterAccessSecret);
    const td = await (await fetch(tUrl, { method: "POST", headers: {"Authorization": auth, "Content-Type": "application/json"}, body: JSON.stringify(tb) })).json();
    if (td.data?.id) return { success: true, id: td.data.id };
    return { success: false, error: td.detail || td.title || JSON.stringify(td.errors||td) };
  } catch (e) { return { success: false, error: e.message }; }
}

async function postToLinkedIn(client, caption, imageUrl) {
  if (!client.linkedinId || !client.linkedinAccessToken) return null;
  try {
    const orgUrn = client.linkedinId.startsWith("urn:") ? client.linkedinId : `urn:li:organization:${client.linkedinId}`;
    let mediaAsset = null;
    if (imageUrl) {
      try {
        const rd = await (await fetch("https://api.linkedin.com/v2/assets?action=registerUpload", { method: "POST", headers: {"Authorization":`Bearer ${client.linkedinAccessToken}`,"Content-Type":"application/json","X-Restli-Protocol-Version":"2.0.0"}, body: JSON.stringify({registerUploadRequest:{recipes:["urn:li:digitalmediaRecipe:feedshare-image"],owner:orgUrn,serviceRelationships:[{relationshipType:"OWNER",identifier:"urn:li:userGeneratedContent"}]}}) })).json();
        const uploadUrl = rd.value?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]?.uploadUrl;
        const asset = rd.value?.asset;
        if (uploadUrl && asset) {
          const ir = await fetch(imageUrl);
          if (ir.ok) { await fetch(uploadUrl, { method:"PUT", headers:{"Authorization":`Bearer ${client.linkedinAccessToken}`,"Content-Type":ir.headers.get("content-type")||"image/jpeg"}, body:Buffer.from(await ir.arrayBuffer()) }); mediaAsset = asset; }
        }
      } catch(me) { console.log("[linkedin] media err:", me.message); }
    }
    const pb = { author:orgUrn, lifecycleState:"PUBLISHED", specificContent:{"com.linkedin.ugc.ShareContent":{shareCommentary:{text:caption},shareMediaCategory:mediaAsset?"IMAGE":"NONE"}}, visibility:{"com.linkedin.ugc.MemberNetworkVisibility":"PUBLIC"} };
    if (mediaAsset) pb.specificContent["com.linkedin.ugc.ShareContent"].media = [{status:"READY",media:mediaAsset}];
    const pr = await fetch("https://api.linkedin.com/v2/ugcPosts", { method:"POST", headers:{"Authorization":`Bearer ${client.linkedinAccessToken}`,"Content-Type":"application/json","X-Restli-Protocol-Version":"2.0.0"}, body:JSON.stringify(pb) });
    if (pr.status === 201) return { success: true, id: pr.headers.get("x-restli-id")||"created" };
    const ed = await pr.json().catch(()=>({}));
    return { success: false, error: ed.message||`HTTP ${pr.status}` };
  } catch (e) { return { success: false, error: e.message }; }
}

async function postToGoogleBusiness(client, caption, imageUrl) {
  if (!client.gbpId || !client.gbpAccessToken) return null;
  try {
    const loc = client.gbpId.startsWith("accounts/") ? client.gbpId : `accounts/${client.gbpId}`;
    const body = { languageCode:"en-GB", summary:caption.substring(0,1500), topicType:"STANDARD" };
    if (imageUrl) body.media = [{mediaFormat:"PHOTO",sourceUrl:imageUrl}];
    if (client.gbpCta && client.gbpCtaUrl) body.callToAction = {actionType:client.gbpCta,url:client.gbpCtaUrl};
    const d = await (await fetch(`https://mybusiness.googleapis.com/v4/${loc}/localPosts`, { method:"POST", headers:{"Authorization":`Bearer ${client.gbpAccessToken}`,"Content-Type":"application/json"}, body:JSON.stringify(body) })).json();
    if (d.name) return { success: true, id: d.name };
    return { success: false, error: d.error?.message||`HTTP ${d.error?.code}` };
  } catch (e) { return { success: false, error: e.message }; }
}

async function postToTikTok(client, caption, imageUrl) {
  if (!client.tiktokAccessToken || !imageUrl) return null;
  try {
    const pd = await (await fetch("https://open.tiktokapis.com/v2/post/publish/inbox/video/init/", { method:"POST", headers:{"Authorization":`Bearer ${client.tiktokAccessToken}`,"Content-Type":"application/json"}, body:JSON.stringify({post_info:{title:caption.substring(0,2200),privacy_level:"PUBLIC_TO_EVERYONE",disable_duet:false,disable_comment:false,disable_stitch:false},source_info:{source:"PULL_FROM_URL",photo_cover_index:0,photo_images:[imageUrl]},post_mode:"DIRECT_POST",media_type:"PHOTO"}) })).json();
    if (pd.data?.publish_id) return { success: true, id: pd.data.publish_id };
    return { success: false, error: pd.error?.message||`HTTP ${pd.error?.code}` };
  } catch (e) { return { success: false, error: e.message }; }
}

async function publishToAll(client, post) {
  const r = {};
  if (post.platforms.includes("facebook") && client.fbPageId) r.facebook = await postToFacebook(client, post.caption, post.imageUrl);
  if (post.platforms.includes("instagram") && client.igUserId && post.imageUrl) r.instagram = await postToInstagram(client, post.caption, post.imageUrl);
  if (post.platforms.includes("twitter") && client.twitterAccessToken) r.twitter = await postToTwitter(client, post.caption, post.imageUrl);
  if (post.platforms.includes("linkedin") && client.linkedinAccessToken) r.linkedin = await postToLinkedIn(client, post.caption, post.imageUrl);
  if (post.platforms.includes("google_business") && client.gbpAccessToken) r.google_business = await postToGoogleBusiness(client, post.caption, post.imageUrl);
  if (post.platforms.includes("tiktok") && client.tiktokAccessToken) r.tiktok = await postToTikTok(client, post.caption, post.imageUrl);
  return r;
}

async function deleteFromPlatforms(client, post) {
  const r = {};
  const t = client.pageAccessToken;
  if (post.results?.facebook?.success && post.results.facebook.id && t) {
    try { const d = await (await fetch(`${GRAPH_API}/${post.results.facebook.id}?access_token=${t}`, {method:"DELETE"})).json(); r.facebook = d.success!==false?{deleted:true}:{deleted:false,error:d.error?.message}; } catch(e) { r.facebook={deleted:false,error:e.message}; }
  }
  if (post.results?.instagram?.success && post.results.instagram.id && t) {
    try { const d = await (await fetch(`${GRAPH_API}/${post.results.instagram.id}?access_token=${t}`, {method:"DELETE"})).json(); r.instagram = d.success!==false?{deleted:true}:{deleted:false,error:d.error?.message}; } catch(e) { r.instagram={deleted:false,error:e.message}; }
  }
  if (post.results?.twitter?.success && post.results.twitter.id && client.twitterAccessToken) {
    try { const dUrl = `https://api.x.com/2/tweets/${post.results.twitter.id}`; const auth = oauthHeader("DELETE",dUrl,client.twitterApiKey,client.twitterApiSecret,client.twitterAccessToken,client.twitterAccessSecret); const d = await (await fetch(dUrl,{method:"DELETE",headers:{"Authorization":auth}})).json(); r.twitter = d.data?.deleted?{deleted:true}:{deleted:false,error:JSON.stringify(d)}; } catch(e) { r.twitter={deleted:false,error:e.message}; }
  }
  return r;
}

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

    if (action === "get-clients") { return json(await clients.get("list",{type:"json"}).catch(()=>null)||[]); }
    if (action === "add-client" && req.method === "POST") {
      const body = await req.json(); if(!body.name) return json({error:"Client name required"},400);
      const list = await clients.get("list",{type:"json"}).catch(()=>null)||[];
      const nc = {id:"client_"+Date.now(),...body,createdAt:new Date().toISOString()};
      list.push(nc); await clients.setJSON("list",list); return json({success:true,client:nc});
    }
    if (action === "update-client" && req.method === "PUT") {
      const body = await req.json();
      const list = await clients.get("list",{type:"json"}).catch(()=>null)||[];
      const idx = list.findIndex(c=>c.id===body.id); if(idx===-1) return json({error:"Not found"},404);
      list[idx] = {...list[idx],...body,updatedAt:new Date().toISOString()};
      await clients.setJSON("list",list); return json({success:true,client:list[idx]});
    }
    if (action === "delete-client" && req.method === "DELETE") {
      const body = await req.json();
      let list = await clients.get("list",{type:"json"}).catch(()=>null)||[];
      list = list.filter(c=>c.id!==body.id); await clients.setJSON("list",list); return json({success:true});
    }
    if (!clientId && ["get-posts","add-post","update-post","delete-post","publish-now","post-now","delete-from-platform"].includes(action)) return json({error:"clientId required"},400);
    if (action === "get-posts") { return json(await posts.get(clientId,{type:"json"}).catch(()=>null)||[]); }
    if (action === "add-post" && req.method === "POST") {
      const body = await req.json(); if(!body.caption) return json({error:"Caption required"},400);
      const list = await posts.get(clientId,{type:"json"}).catch(()=>null)||[];
      const np = {id:"post_"+Date.now(),clientId,caption:body.caption,imageUrl:body.imageUrl||null,platforms:body.platforms||["facebook"],status:body.scheduledFor?"scheduled":"queued",scheduledFor:body.scheduledFor||null,createdAt:new Date().toISOString(),publishedAt:null,results:null};
      list.push(np); await posts.setJSON(clientId,list); return json({success:true,post:np});
    }
    if (action === "update-post" && req.method === "PUT") {
      const body = await req.json();
      const list = await posts.get(clientId,{type:"json"}).catch(()=>null)||[];
      const idx = list.findIndex(p=>p.id===body.postId); if(idx===-1) return json({error:"Not found"},404);
      Object.assign(list[idx],body); await posts.setJSON(clientId,list); return json({success:true,post:list[idx]});
    }
    if (action === "delete-post" && req.method === "DELETE") {
      const body = await req.json();
      let list = await posts.get(clientId,{type:"json"}).catch(()=>null)||[];
      list = list.filter(p=>p.id!==body.postId); await posts.setJSON(clientId,list); return json({success:true});
    }
    if (action === "post-now" && req.method === "POST") {
      const body = await req.json(); if(!body.caption) return json({error:"Caption required"},400);
      const cl = await clients.get("list",{type:"json"}).catch(()=>null)||[];
      const client = cl.find(c=>c.id===clientId); if(!client) return json({error:"Client not found"},404);
      const np = {id:"post_"+Date.now(),clientId,caption:body.caption,imageUrl:body.imageUrl||null,platforms:body.platforms||["facebook"],status:"publishing",createdAt:new Date().toISOString(),publishedAt:null,results:null};
      const results = await publishToAll(client, np);
      np.status = "published"; np.publishedAt = new Date().toISOString(); np.results = results;
      const list = await posts.get(clientId,{type:"json"}).catch(()=>null)||[];
      list.push(np); await posts.setJSON(clientId,list);
      return json({success:true,post:np,results});
    }
    if (action === "publish-now" && req.method === "POST") {
      const body = await req.json();
      const cl = await clients.get("list",{type:"json"}).catch(()=>null)||[];
      const client = cl.find(c=>c.id===clientId); if(!client) return json({error:"Client not configured"},400);
      const pl = await posts.get(clientId,{type:"json"}).catch(()=>null)||[];
      const post = pl.find(p=>p.id===body.postId); if(!post) return json({error:"Post not found"},404);
      const results = await publishToAll(client, post);
      const pi = pl.findIndex(p=>p.id===body.postId);
      pl[pi].status="published"; pl[pi].publishedAt=new Date().toISOString(); pl[pi].results=results;
      await posts.setJSON(clientId,pl); return json({success:true,results});
    }
    if (action === "delete-from-platform" && req.method === "POST") {
      const body = await req.json();
      const cl = await clients.get("list",{type:"json"}).catch(()=>null)||[];
      const client = cl.find(c=>c.id===clientId); if(!client) return json({error:"Client not found"},404);
      const pl = await posts.get(clientId,{type:"json"}).catch(()=>null)||[];
      const post = pl.find(p=>p.id===body.postId); if(!post) return json({error:"Post not found"},404);
      if(!post.results) return json({error:"No publish results"},400);
      const dr = await deleteFromPlatforms(client, post);
      const pi = pl.findIndex(p=>p.id===body.postId);
      pl[pi].status="deleted"; pl[pi].deletedAt=new Date().toISOString(); pl[pi].deleteResults=dr;
      await posts.setJSON(clientId,pl); return json({success:true,deleteResults:dr});
    }
    if (action === "upload-image" && req.method === "POST") {
      let body;
      try { body = await req.json(); } catch(e) { return json({error:"Request body too large or invalid JSON. Try a smaller image."},413); }
      if(!body.filename||!body.content) return json({error:"filename and content required"},400);
      // Check base64 size (~1.37x the actual file size)
      const estSize = Math.round(body.content.length * 0.75 / 1024);
      if(body.content.length > 6 * 1024 * 1024) return json({error:`Image too large (${estSize}KB). Max ~4MB after compression.`},413);
      const ghToken = process.env.GITHUB_TOKEN; if(!ghToken) return json({error:"GITHUB_TOKEN not set on server"},500);
      const path = `public/photos/${Date.now()}-${body.filename.replace(/[^a-zA-Z0-9._-]/g,'')}`;
      try {
        const ghRes = await fetch(`https://api.github.com/repos/Gusmack1/grid-social-autoposter/contents/${path}`, { 
          method:"PUT", 
          headers:{Authorization:`token ${ghToken}`,"Content-Type":"application/json"}, 
          body:JSON.stringify({message:`Upload ${body.filename}`,content:body.content}) 
        });
        const gd = await ghRes.json();
        if(gd.content?.download_url) return json({success:true,url:gd.content.download_url,path,size:`${estSize}KB`});
        console.error("[upload] GitHub error:", JSON.stringify(gd));
        return json({error:gd.message||"GitHub upload failed. Check GITHUB_TOKEN permissions.",details:gd.documentation_url||null},500);
      } catch(e) {
        console.error("[upload] Fetch error:", e.message);
        return json({error:"Upload request failed: "+e.message},500);
      }
    }
    if (action === "config") { return json({metaAppId:process.env.META_APP_ID||"",hasSecret:!!process.env.META_APP_SECRET,hasGithubToken:!!process.env.GITHUB_TOKEN}); }
    return json({error:"Unknown action: "+action},400);
  } catch(err) { console.error("[admin] Error:",err); return json({error:err.message},500); }
};
