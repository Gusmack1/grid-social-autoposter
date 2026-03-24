// Unified publisher — routes posts to platform modules via Promise.allSettled
import * as facebook from './platforms/facebook.mjs';
import * as instagram from './platforms/instagram.mjs';
import { postTweet, deleteTweet } from './platforms/twitter.mjs';
import { postLinkedIn } from './platforms/linkedin.mjs';
import { postGBP } from './platforms/google-business.mjs';
import { postTikTok } from './platforms/tiktok.mjs';
import { logger } from './logger.mjs';

export async function publishToAll(client, post) {
  const pt = post.postType || 'feed';
  const tasks = [];

  if (pt === 'story') {
    // Stories: Instagram only
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
  return r;
}
