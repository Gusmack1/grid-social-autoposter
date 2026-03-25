// Unified publisher — routes posts to platform modules via Promise.allSettled
import * as facebook from './platforms/facebook.mjs';
import * as instagram from './platforms/instagram.mjs';
import { postTweet, deleteTweet } from './platforms/twitter.mjs';
import { postLinkedIn } from './platforms/linkedin.mjs';
import { postGBP } from './platforms/google-business.mjs';
import { postTikTok } from './platforms/tiktok.mjs';
import { postThreads } from './platforms/threads.mjs';
import { postBluesky, deleteBlueskyPost } from './platforms/bluesky.mjs';
import { postPinterest, deletePinterestPin } from './platforms/pinterest.mjs';
import { logger } from './logger.mjs';

export async function publishToAll(client, post) {
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
