export const API_BASE = '/api';

export const PLATFORMS = [
  { id: 'facebook', name: 'Facebook', icon: 'fb', color: '#1877f2' },
  { id: 'instagram', name: 'Instagram', icon: 'ig', color: '#e4405f' },
  { id: 'twitter', name: 'X / Twitter', icon: 'x', color: '#000000' },
  { id: 'tiktok', name: 'TikTok', icon: 'tt', color: '#000000' },
  { id: 'linkedin', name: 'LinkedIn', icon: 'li', color: '#0a66c2' },
  { id: 'google_business', name: 'Google Business', icon: 'gbp', color: '#4285f4' },
];

export const POST_TYPES = [
  { id: 'feed', name: 'Feed Post' },
  { id: 'story', name: 'Story' },
  { id: 'reel', name: 'Reel' },
];

// Helper links for client setup
export const PLATFORM_LINKS = {
  fbPageId: 'https://www.facebook.com/settings/?tab=pages',
  igUserId: 'https://developers.facebook.com/tools/explorer/?method=GET&path=me%2Faccounts%3Ffields%3Dinstagram_business_account',
  pageAccessToken: 'https://developers.facebook.com/tools/explorer/',
  twitterApiKey: 'https://developer.x.com/en/portal/dashboard',
  linkedinId: 'https://www.linkedin.com/company/',
  gbpId: 'https://business.google.com/',
  tiktokAccessToken: 'https://developers.tiktok.com/',
};
