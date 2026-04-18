// Unified publisher — routes posts to platform modules via Promise.allSettled.
//
// Pre-publish voice gate (task #48): before dispatching any Meta Graph call
// we re-run the voice rubric against the caption for each platform this post
// targets. If ANY platform fails, the publish is aborted fail-closed and the
// caller must mark status='voice_rejected'. See lib/voice-gate.mjs.
import * as facebook from './platforms/facebook.mjs';
import * as instagram from './platforms/instagram.mjs';
import { postTweet, deleteTweet } from './platforms/twitter.mjs';
import { postLinkedIn } from './platforms/linkedin.mjs';
import { postGBP } from './platforms/google-business.mjs';
import { postTikTok } from './platforms/tiktok.mjs';
import { postThreads } from './platforms/threads.mjs';
import { postBluesky, deleteBlueskyPost } from './platforms/bluesky.mjs';
import { postPinterest, deletePinterestPin } from './platforms/pinterest.mjs';
import { notifyAdminPublishFailure } from './email.mjs';
import { logger } from './logger.mjs';
import { checkVoice } from './voice-gate.mjs';

// Sentinel returned when the voice gate rejects a post.
// Callers (scheduled-post.mjs, publish-webhook.mjs) detect this and set
// post.status = 'voice_rejected' instead of 'published', and do NOT call Meta.
export const VOICE_REJECTED = Symbol.for('grid-social.voice-rejected');

// Platforms the voice spec covers. Others are passed through (spec is FB+IG only).
const VOICE_GATED_PLATFORMS = new Set(['facebook', 'instagram']);

/**
 * Run the voice gate against every platform this post targets.
 * Returns { pass, failuresByPlatform, combinedError }.
 * Fail-closed: any platform failing → overall fail.
 */
function gateCaption(post) {
  const failuresByPlatform = {};
  let pass = true;
  for (const platform of post.platforms || []) {
    if (!VOICE_GATED_PLATFORMS.has(platform)) continue;
    const result = checkVoice(post.caption, platform);
    if (!result.pass) {
      failuresByPlatform[platform] = result.failures;
      pass = false;
    }
  }
  const combinedError = pass
    ? null
    : Object.entries(failuresByPlatform)
        .map(([p, f]) => `${p}: ${f.join(', ')}`)
        .join(' | ');
  return { pass, failuresByPlatform, combinedError };
}

export async function publishToAll(client, post) {
  // ── PRE-PUBLISH VOICE GATE (fail-closed) ──
  // Runs on every post regardless of source (generator / manual / import).
  const gate = gateCaption(post);
  if (!gate.pass) {
    logger.warn('Voice gate rejected post — not publishing', {
      postId: post.id,
      clientId: post.clientId,
      platforms: post.platforms,
      failures: gate.failuresByPlatform,
    });
    return {
      [VOICE_REJECTED]: true,
      voiceRejected: true,
      error: gate.combinedError,
      failuresByPlatform: gate.failuresByPlatform,
    };
  }

  const pt = post.postType || 'feed';
  const tasks = [];

  if (pt === 'story') {
    // Stories: Facebook + Instagram
    if (post.platforms.includes('facebook') && client.fbPageId && post.imageUrl) {
      tasks.push({ platform: 'facebook', fn: () => facebook.postStory(client, post.caption, post.imageUrl) });
    }
    if (post.platforms.includes('instagram') && client.igUserId && post.imageUrl) {
      tasks.push({ platform: 'instagram', fn: () => instagram.postStory(client, post.caption, post.imageUrl) });
    }
  } else if (pt === 'reel') {
    const vid = post.videoUrl || post.imageUrl;
    if (post.platforms.includes('instagram') && client.igUserId && vid) {
      tasks.push({ platform: 'instagram', fn: () => instagram.postReel(client, post.caption, vid) });
    }
    if (post.platforms.includes('facebook') && client.fbPageId && vid) {
      tasks.push({ platform: 'facebook', fn: () => facebook.postReel(client, post.caption, vid) });
    }
  } else if (pt === 'carousel' && post.imageUrls?.length > 1) {
    // Carousel: multiple images
    if (post.platforms.includes('facebook') && client.fbPageId) {
      tasks.push({ platform: 'facebook', fn: () => facebook.postCarousel(client, post.caption, post.imageUrls) });
    }
    if (post.platforms.includes('instagram') && client.igUserId) {
      tasks.push({ platform: 'instagram', fn: () => instagram.postCarousel(client, post.caption, post.imageUrls) });
    }
    // Other platforms get single image fallback
    const fallbackImg = post.imageUrls[0];
    if (post.platforms.includes('twitter') && client.twitterAccessToken) {
      tasks.push({ platform: 'twitter', fn: () => postTweet(client, post.caption, fallbackImg) });
    }
    if (post.platforms.includes('linkedin') && client.linkedinAccessToken) {
      tasks.push({ platform: 'linkedin', fn: () => postLinkedIn(client, post.caption, fallbackImg) });
    }
    if (post.platforms.includes('threads') && client.threadsUserId) {
      tasks.push({ platform: 'threads', fn: () => postThreads(client, post.caption, fallbackImg) });
    }
    if (post.platforms.includes('bluesky') && client.blueskyIdentifier) {
      tasks.push({ platform: 'bluesky', fn: () => postBluesky(client, post.caption, fallbackImg) });
    }
    if (post.platforms.includes('pinterest') && client.pinterestAccessToken && fallbackImg) {
      tasks.push({ platform: 'pinterest', fn: () => postPinterest(client, post.caption, fallbackImg) });
    }
  } else {
    // Standard feed
    if (post.platforms.includes('facebook') && client.fbPageId) {
      tasks.push({ platform: 'facebook', fn: () => facebook.postFeed(client, post.caption, post.imageUrl) });
    }
    if (post.platforms.includes('instagram') && client.igUserId && post.imageUrl) {
      tasks.push({ platform: 'instagram', fn: () => instagram.postFeed(client, post.caption, post.imageUrl) });
    }
    if (post.platforms.includes('twitter') && client.twitterAccessToken) {
      tasks.push({ platform: 'twitter', fn: () => postTweet(client, post.caption, post.imageUrl) });
    }
    if (post.platforms.includes('linkedin') && client.linkedinAccessToken) {
      tasks.push({ platform: 'linkedin', fn: () => postLinkedIn(client, post.caption, post.imageUrl) });
    }
    if (post.platforms.includes('google_business') && client.gbpAccessToken) {
      tasks.push({ platform: 'google_business', fn: () => postGBP(client, post.caption, post.imageUrl) });
    }
    if (post.platforms.includes('tiktok') && client.tiktokAccessToken) {
      tasks.push({ platform: 'tiktok', fn: () => postTikTok(client, post.caption, post.imageUrl) });
    }
    if (post.platforms.includes('threads') && client.threadsUserId) {
      tasks.push({ platform: 'threads', fn: () => postThreads(client, post.caption, post.imageUrl) });
    }
    if (post.platforms.includes('bluesky') && client.blueskyIdentifier) {
      tasks.push({ platform: 'bluesky', fn: () => postBluesky(client, post.caption, post.imageUrl) });
    }
    if (post.platforms.includes('pinterest') && client.pinterestAccessToken && post.imageUrl) {
      tasks.push({ platform: 'pinterest', fn: () => postPinterest(client, post.caption, post.imageUrl) });
    }
  }

  if (tasks.length === 0) {
    logger.warn('No platforms matched for post', { postId: post.id, platforms: post.platforms, postType: pt });
    return {};
  }

  // Parallel dispatch — all platforms at once
  const settled = await Promise.allSettled(tasks.map(t => t.fn()));
  const results = {};
  tasks.forEach((t, i) => {
    const s = settled[i];
    results[t.platform] = s.status === 'fulfilled' ? s.value : { success: false, error: s.reason?.message || 'Unknown error' };
  });

  logger.info('Publish complete', {
    postId: post.id,
    clientId: post.clientId,
    platforms: Object.keys(results),
    successes: Object.entries(results).filter(([, r]) => r?.success).map(([p]) => p),
    failures: Object.entries(results).filter(([, r]) => r && !r.success).map(([p, r]) => `${p}: ${r.error}`),
  });

  // Alert admin if any platform failed — guard so Resend errors don't cascade
  const failures = Object.entries(results)
    .filter(([, r]) => r && r.success === false)
    .map(([platform, r]) => ({ platform, error: r?.error || 'Unknown error' }));
  if (failures.length > 0) {
    const adminEmail = process.env.ADMIN_EMAIL || 'gridsocial.agency@gmail.com';
    try {
      await notifyAdminPublishFailure({
        adminEmail,
        clientName: client?.name || client?.id || 'unknown client',
        postId: post.id,
        failures,
      });
    } catch (e) {
      logger.error('Admin failure-notification email errored', { postId: post.id, error: e.message });
    }
  }

  return results;
}

export async function deleteFromPlatforms(client, post) {
  const r = {};
  if (post.results?.facebook?.success && post.results.facebook.id) {
    r.facebook = await facebook.deletePost(client, post.results.facebook.id);
  }
  if (post.results?.instagram?.success && post.results.instagram.id) {
    r.instagram = await instagram.deletePost(client, post.results.instagram.id);
  }
  if (post.results?.twitter?.success && post.results.twitter.id) {
    r.twitter = await deleteTweet(client, post.results.twitter.id);
  }
  if (post.results?.bluesky?.success && post.results.bluesky.id) {
    r.bluesky = await deleteBlueskyPost(client, post.results.bluesky.id);
  }
  if (post.results?.pinterest?.success && post.results.pinterest.id) {
    r.pinterest = await deletePinterestPin(client, post.results.pinterest.id);
  }
  return r;
}
