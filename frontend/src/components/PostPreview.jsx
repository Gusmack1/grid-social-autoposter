import React from 'react';
import PlatformIcon from './PlatformIcon.jsx';

const CHAR_LIMITS = {
  facebook: 63206,
  instagram: 2200,
  twitter: 280,
  threads: 500,
  bluesky: 300,
  linkedin: 3000,
  tiktok: 2200,
  google_business: 1500,
  pinterest: 500,
};

const PLATFORM_STYLES = {
  facebook: { bg: '#242526', cardBg: '#3a3b3c', text: '#e4e6eb', accent: '#1877f2', radius: 8, fontFamily: 'Helvetica, Arial, sans-serif' },
  instagram: { bg: '#000', cardBg: '#262626', text: '#f5f5f5', accent: '#e4405f', radius: 0, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
  twitter: { bg: '#000', cardBg: '#16181c', text: '#e7e9ea', accent: '#1d9bf0', radius: 16, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
  threads: { bg: '#101010', cardBg: '#1e1e1e', text: '#f5f5f5', accent: '#fff', radius: 12, fontFamily: '-apple-system, sans-serif' },
  bluesky: { bg: '#000', cardBg: '#16181c', text: '#e7e9ea', accent: '#0085ff', radius: 12, fontFamily: '-apple-system, sans-serif' },
  linkedin: { bg: '#1b1f23', cardBg: '#1b1f23', text: '#ffffff', accent: '#0a66c2', radius: 8, fontFamily: '-apple-system, sans-serif' },
  tiktok: { bg: '#121212', cardBg: '#1e1e1e', text: '#fff', accent: '#fe2c55', radius: 8, fontFamily: 'sans-serif' },
  google_business: { bg: '#202124', cardBg: '#303134', text: '#e8eaed', accent: '#4285f4', radius: 8, fontFamily: 'Roboto, sans-serif' },
  pinterest: { bg: '#111', cardBg: '#1e1e1e', text: '#fff', accent: '#e60023', radius: 16, fontFamily: '-apple-system, sans-serif' },
};

const PLATFORM_NAMES = {
  facebook: 'Facebook', instagram: 'Instagram', twitter: 'X', threads: 'Threads',
  bluesky: 'Bluesky', linkedin: 'LinkedIn', tiktok: 'TikTok',
  google_business: 'Google Business', pinterest: 'Pinterest',
};

function PlatformPreview({ platform, caption, imageUrl, postType, clientName }) {
  const s = PLATFORM_STYLES[platform] || PLATFORM_STYLES.facebook;
  const limit = CHAR_LIMITS[platform] || 2200;
  const truncated = caption.length > limit ? caption.substring(0, limit) + '…' : caption;
  const overLimit = caption.length > limit;
  const name = clientName || 'Your Page';

  return (
    <div style={{
      background: s.cardBg,
      borderRadius: s.radius,
      overflow: 'hidden',
      border: '1px solid rgba(255,255,255,0.1)',
      fontFamily: s.fontFamily,
      maxWidth: 380,
    }}>
      {/* Header */}
      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%', background: s.accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 700, color: '#fff',
        }}>
          {name[0]?.toUpperCase()}
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: s.text }}>{name}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
            Just now · <PlatformIcon platform={platform} />
          </div>
        </div>
      </div>

      {/* Caption */}
      <div style={{
        padding: '0 14px 10px',
        fontSize: platform === 'twitter' || platform === 'bluesky' ? 14 : 13,
        lineHeight: 1.5,
        color: s.text,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {truncated}
      </div>

      {/* Image */}
      {imageUrl && (
        <div style={{
          width: '100%',
          aspectRatio: platform === 'instagram' ? '1/1' : platform === 'pinterest' ? '2/3' : '16/9',
          background: '#1a1a2e',
          overflow: 'hidden',
        }}>
          <img src={imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      )}

      {/* Post type badge */}
      {postType && postType !== 'feed' && (
        <div style={{
          padding: '6px 14px',
          fontSize: 11,
          color: 'rgba(255,255,255,0.5)',
          borderTop: '1px solid rgba(255,255,255,0.05)',
        }}>
          {postType === 'carousel' ? '📸 Carousel' : postType === 'story' ? '📱 Story' : postType === 'reel' ? '🎬 Reel' : postType}
        </div>
      )}

      {/* Engagement bar */}
      <div style={{
        padding: '8px 14px',
        display: 'flex',
        gap: 20,
        borderTop: '1px solid rgba(255,255,255,0.08)',
        fontSize: 12,
        color: 'rgba(255,255,255,0.5)',
      }}>
        <span>❤️ Like</span>
        <span>💬 Comment</span>
        <span>🔄 Share</span>
      </div>

      {/* Character count */}
      <div style={{
        padding: '6px 14px',
        fontSize: 10,
        color: overLimit ? '#ef4444' : 'rgba(255,255,255,0.3)',
        textAlign: 'right',
        borderTop: '1px solid rgba(255,255,255,0.05)',
      }}>
        {caption.length}/{limit} {overLimit && '⚠️ Over limit!'}
      </div>
    </div>
  );
}

export default function PostPreview({ platforms, caption, imageUrl, postType, clientName }) {
  if (!caption && !imageUrl) return null;

  return (
    <div>
      <div style={{
        fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
        marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px',
      }}>
        Preview
      </div>
      <div style={{
        display: 'flex',
        gap: 16,
        overflowX: 'auto',
        paddingBottom: 8,
      }}>
        {(platforms || []).map(p => (
          <div key={p} style={{ flexShrink: 0 }}>
            <div style={{
              fontSize: 11, fontWeight: 600, color: PLATFORM_STYLES[p]?.accent || '#888',
              marginBottom: 6, textAlign: 'center',
            }}>
              {PLATFORM_NAMES[p] || p}
            </div>
            <PlatformPreview
              platform={p}
              caption={caption || ''}
              imageUrl={imageUrl}
              postType={postType}
              clientName={clientName}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
