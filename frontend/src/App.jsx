import React, { useState, useEffect, useCallback } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { PLATFORMS, POST_TYPES, PLATFORM_LINKS, API_BASE } from './constants.js';
import { formatDateGMT, timeAgo, truncate } from './utils.js';
import { api, apiGet, apiPost, apiPut, apiDelete, clearToken } from './hooks/useApi.js';
import PlatformIcon from './components/PlatformIcon.jsx';

const TABS = [
  { id: 'compose', name: 'Create Post', icon: '✏️' },
  { id: 'queue', name: 'Queue', icon: '📋' },
  { id: 'calendar', name: 'Calendar', icon: '📅' },
  { id: 'published', name: 'Published', icon: '✅' },
  { id: 'analytics', name: 'Analytics', icon: '📊' },
  { id: 'billing', name: 'Billing', icon: '💳', admin: true },
  { id: 'team', name: 'Team', icon: '👥', admin: true },
  { id: 'clients', name: 'Clients & API', icon: '⚙️', admin: true },
];

export default function App({ user, onLogout }) {
  const [tab, setTab] = useState('compose');
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [posts, setPosts] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Compose state
  const [caption, setCaption] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageUrls, setImageUrls] = useState([]); // carousel
  const [videoUrl, setVideoUrl] = useState('');
  const [platforms, setPlatforms] = useState(['facebook', 'instagram']);
  const [postType, setPostType] = useState('feed');
  const [scheduledFor, setScheduledFor] = useState('');
  const [uploading, setUploading] = useState(false);

  // Team state
  const [users, setUsers] = useState([]);

  // Analytics state
  const [analytics, setAnalytics] = useState(null);
  const [analyticsRange, setAnalyticsRange] = useState(30);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Calendar state
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calSelectedDay, setCalSelectedDay] = useState(null);
  const [editingPost, setEditingPost] = useState(null);

  // CSV import state
  const [csvImporting, setCsvImporting] = useState(false);

  // Modal state
  const [deleteModal, setDeleteModal] = useState(null);
  const [clientModal, setClientModal] = useState(null);
  const [linkModal, setLinkModal] = useState(null); // { type, clientName, url, loading }

  const isAdmin = user?.role === 'admin';

  const loadClients = useCallback(async () => {
    try {
      const data = await apiGet('/admin?action=get-clients');
      setClients(Array.isArray(data) ? data : []);
      if (!selectedClient && data.length > 0) setSelectedClient(data[0].id);
    } catch (e) { console.error('Load clients:', e); }
  }, [selectedClient]);

  const loadPosts = useCallback(async () => {
    if (!selectedClient) return;
    try {
      const data = await apiGet(`/admin?action=get-posts&clientId=${selectedClient}`);
      setPosts(Array.isArray(data) ? data : []);
    } catch (e) { console.error('Load posts:', e); }
  }, [selectedClient]);

  const loadUsers = useCallback(async () => {
    if (!isAdmin) return;
    try { setUsers(await apiGet('/auth?action=get-users')); } catch (e) { console.error('Load users:', e); }
  }, [isAdmin]);

  useEffect(() => { loadClients(); }, []);
  useEffect(() => { loadPosts(); }, [selectedClient]);
  useEffect(() => { if (tab === 'team' || tab === 'billing') loadUsers(); }, [tab]);

  const loadAnalytics = useCallback(async () => {
    if (!selectedClient) return;
    setAnalyticsLoading(true);
    try {
      const data = await apiGet(`/analytics?clientId=${selectedClient}&range=${analyticsRange}`);
      setAnalytics(data);
    } catch (e) { console.error('Load analytics:', e); }
    setAnalyticsLoading(false);
  }, [selectedClient, analyticsRange]);

  useEffect(() => { if (tab === 'analytics') loadAnalytics(); }, [tab, selectedClient, analyticsRange]);

  const currentClient = clients.find(c => c.id === selectedClient);

  // Check which platforms the client has configured
  const clientPlatforms = currentClient ? PLATFORMS.filter(p => {
    if (p.id === 'facebook') return currentClient.fbPageId;
    if (p.id === 'instagram') return currentClient.igUserId;
    if (p.id === 'twitter') return currentClient._hasTokens && currentClient.twitterAccessToken;
    if (p.id === 'linkedin') return currentClient.linkedinAccessToken;
    if (p.id === 'google_business') return currentClient.gbpAccessToken;
    if (p.id === 'tiktok') return currentClient.tiktokAccessToken;
    if (p.id === 'threads') return currentClient.threadsUserId;
    if (p.id === 'bluesky') return currentClient.blueskyIdentifier;
    if (p.id === 'pinterest') return currentClient.pinterestAccessToken;
    return false;
  }).map(p => p.id) : [];

  // ── COMPOSE ──
  const handleSubmit = async (postNow = false) => {
    if (!caption.trim() || !selectedClient) return;
    setLoading(true);
    try {
      const postData = {
        caption, imageUrl: imageUrl || null, videoUrl: videoUrl || null,
        platforms, postType,
        ...(postType === 'carousel' && imageUrls.length > 1 ? { imageUrls } : {}),
      };
      if (postNow) {
        await apiPost(`/admin?action=post-now&clientId=${selectedClient}`, postData);
      } else {
        await apiPost(`/admin?action=add-post&clientId=${selectedClient}`, {
          ...postData, scheduledFor: scheduledFor || null,
        });
      }
      setCaption(''); setImageUrl(''); setImageUrls([]); setVideoUrl(''); setScheduledFor('');
      await loadPosts();
      if (!postNow) setTab('queue');
    } catch (e) { alert(e.message); }
    setLoading(false);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);

  const handleCsvImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedClient) return;
    setCsvImporting(true);
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) { alert('CSV must have a header row and at least one data row'); setCsvImporting(false); return; }

      // Parse header
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
      const captionIdx = headers.findIndex(h => h === 'caption' || h === 'text' || h === 'message');
      if (captionIdx === -1) { alert('CSV must have a "caption" column'); setCsvImporting(false); return; }

      const dateIdx = headers.findIndex(h => h === 'date' || h === 'scheduled' || h === 'scheduledfor');
      const imageIdx = headers.findIndex(h => h === 'imageurl' || h === 'image' || h === 'media');
      const platformsIdx = headers.findIndex(h => h === 'platforms' || h === 'platform');
      const typeIdx = headers.findIndex(h => h === 'posttype' || h === 'type');

      // Parse rows (handle quoted fields)
      const parseRow = (line) => {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (const ch of line) {
          if (ch === '"') { inQuotes = !inQuotes; continue; }
          if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
          current += ch;
        }
        result.push(current.trim());
        return result;
      };

      const postsToImport = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = parseRow(lines[i]);
        const caption = cols[captionIdx];
        if (!caption) continue;
        postsToImport.push({
          caption,
          scheduledFor: dateIdx >= 0 && cols[dateIdx] ? cols[dateIdx] : null,
          imageUrl: imageIdx >= 0 ? cols[imageIdx] || null : null,
          platforms: platformsIdx >= 0 && cols[platformsIdx]
            ? cols[platformsIdx].split(/[;|+]/).map(p => p.trim().toLowerCase()).filter(Boolean)
            : ['facebook', 'instagram'],
          postType: typeIdx >= 0 ? (cols[typeIdx] || 'feed') : 'feed',
        });
      }

      if (postsToImport.length === 0) { alert('No valid rows found in CSV'); setCsvImporting(false); return; }

      // Bulk import via API
      const result = await apiPost(`/admin?action=bulk-import&clientId=${selectedClient}`, { posts: postsToImport });
      alert(`Imported ${result.imported || postsToImport.length} posts!`);
      await loadPosts();
      e.target.value = '';
    } catch (err) { alert('Import failed: ' + err.message); }
    setCsvImporting(false);
  };
    try {
      // Compress client-side
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.src = URL.createObjectURL(file);
      await new Promise(r => img.onload = r);
      const max = 1200;
      let w = img.width, h = img.height;
      if (w > max || h > max) { const s = max / Math.max(w, h); w *= s; h *= s; }
      canvas.width = w; canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);
      const b64 = canvas.toDataURL('image/jpeg', 0.75).split(',')[1];
      const data = await apiPost(`/admin?action=upload-image&clientId=${selectedClient}`, {
        filename: file.name, content: b64,
      });
      if (data.url) setImageUrl(data.url);
    } catch (e) { alert('Upload failed: ' + e.message); }
    setUploading(false);
  };

  // ── QUEUE/PUBLISHED ACTIONS ──
  const handlePublish = async (postId) => {
    setLoading(true);
    try {
      await apiPost(`/admin?action=publish-now&clientId=${selectedClient}`, { postId });
      await loadPosts();
    } catch (e) { alert(e.message); }
    setLoading(false);
  };

  const handleDelete = async (postId) => {
    try {
      await apiDelete(`/admin?action=delete-post&clientId=${selectedClient}`, { postId });
      setDeleteModal(null);
      await loadPosts();
    } catch (e) { alert(e.message); }
  };

  const handleDeleteFromPlatform = async (postId) => {
    setLoading(true);
    try {
      await apiPost(`/admin?action=delete-from-platform&clientId=${selectedClient}`, { postId });
      await loadPosts();
    } catch (e) { alert(e.message); }
    setLoading(false);
    setDeleteModal(null);
  };

  // ── TEAM ACTIONS ──
  const handleApprove = async (email) => {
    await apiPost('/auth?action=approve-user', { email });
    loadUsers();
  };
  const handleDecline = async (email) => {
    await apiPost('/auth?action=decline-user', { email });
    loadUsers();
  };

  // ── CLIENT MANAGEMENT ──
  const handleSaveClient = async (clientData) => {
    try {
      if (clientData.id) {
        await apiPut('/admin?action=update-client', clientData);
      } else {
        await apiPost('/admin?action=add-client', clientData);
      }
      setClientModal(null);
      loadClients();
    } catch (e) { alert(e.message); }
  };

  // Filtered posts
  const queuedPosts = posts.filter(p => p.status === 'queued' || p.status === 'scheduled').sort((a, b) => {
    if (a.scheduledFor && b.scheduledFor) return new Date(a.scheduledFor) - new Date(b.scheduledFor);
    if (a.scheduledFor) return -1;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
  const publishedPosts = posts.filter(p => p.status === 'published' || p.status === 'deleted').sort((a, b) =>
    new Date(b.publishedAt || b.createdAt) - new Date(a.publishedAt || a.createdAt)
  );

  // ── RENDER ──
  return (
    <div className="layout">
      <button className="hamburger" onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button>

      {/* Sidebar */}
      <div className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">Grid Social</div>

        {/* Client selector */}
        <select value={selectedClient} onChange={e => setSelectedClient(e.target.value)}
          style={{ marginBottom: 16, fontSize: 13 }}>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <nav className="sidebar-nav">
          {TABS.filter(t => !t.admin || isAdmin).map(t => (
            <button key={t.id} className={`nav-item ${tab === t.id ? 'active' : ''}`}
              onClick={() => { setTab(t.id); setSidebarOpen(false); }}>
              <span>{t.icon}</span> {t.name}
            </button>
          ))}
        </nav>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 'auto' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
            {user?.email} ({user?.role})
          </div>
          <button className="btn-ghost btn-sm" style={{ width: '100%' }}
            onClick={() => { clearToken(); onLogout(); }}>Sign Out</button>
        </div>
      </div>

      {/* Main */}
      <div className="main-content">
        {/* ── COMPOSE TAB ── */}
        {tab === 'compose' && (
          <div>
            <div className="header">
              <h1>Create Post</h1>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Posting as: {currentClient?.name || '—'}
              </span>
            </div>

            <div className="card">
              {/* Post type */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                {POST_TYPES.map(pt => (
                  <button key={pt.id} className={`btn-sm ${postType === pt.id ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setPostType(pt.id)}>{pt.name}</button>
                ))}
              </div>

              {/* Caption */}
              <textarea placeholder="Write your caption..." value={caption}
                onChange={e => setCaption(e.target.value)} rows={4}
                style={{ marginBottom: 12 }} />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, textAlign: 'right' }}>
                {caption.length} characters
              </div>

              {/* Image */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
                <input type="text" placeholder="Image URL (or upload below)" value={imageUrl}
                  onChange={e => setImageUrl(e.target.value)} style={{ flex: 1 }} />
                <label className="btn-ghost btn-sm" style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {uploading ? '...' : 'Upload'}
                  <input type="file" accept="image/*" onChange={handleImageUpload} hidden />
                </label>
              </div>

              {/* Carousel images */}
              {postType === 'carousel' && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                    Carousel images ({imageUrls.length}/10) — first image above is slide 1
                  </div>
                  {imageUrls.map((url, i) => (
                    <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 20 }}>{i + 2}.</span>
                      <input type="text" placeholder={`Image ${i + 2} URL`} value={url}
                        onChange={e => {
                          const next = [...imageUrls];
                          next[i] = e.target.value;
                          setImageUrls(next);
                        }} style={{ flex: 1, fontSize: 13 }} />
                      <button className="btn-ghost btn-sm" onClick={() => setImageUrls(imageUrls.filter((_, j) => j !== i))}
                        style={{ padding: '2px 6px', fontSize: 11 }}>✕</button>
                    </div>
                  ))}
                  {imageUrls.length < 9 && (
                    <button className="btn-ghost btn-sm" onClick={() => setImageUrls([...imageUrls, ''])}
                      style={{ fontSize: 12, marginTop: 4 }}>+ Add image</button>
                  )}
                </div>
              )}

              {postType === 'reel' && (
                <input type="text" placeholder="Video URL" value={videoUrl}
                  onChange={e => setVideoUrl(e.target.value)} style={{ marginBottom: 12 }} />
              )}

              {/* Platform toggles */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                {PLATFORMS.map(p => {
                  const connected = clientPlatforms.includes(p.id);
                  const active = platforms.includes(p.id);
                  return (
                    <button key={p.id} className={`platform-toggle ${active && connected ? 'active' : ''}`}
                      disabled={!connected}
                      onClick={() => {
                        if (!connected) return;
                        setPlatforms(prev => active ? prev.filter(x => x !== p.id) : [...prev, p.id]);
                      }}
                      style={{ opacity: connected ? 1 : 0.4 }}>
                      <PlatformIcon platform={p.id} />
                      {p.name}
                      {!connected && ' ✗'}
                    </button>
                  );
                })}
              </div>

              {/* Schedule */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
                <input type="datetime-local" value={scheduledFor}
                  onChange={e => setScheduledFor(e.target.value)} style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>GMT</span>
              </div>

              {/* Approval mode warning */}
              {currentClient?.approvalMode && currentClient.approvalMode !== 'auto' && (
                <div className="approval-warning">
                  ⚠️ {currentClient.name} uses <strong>{currentClient.approvalMode}</strong> approval
                  {currentClient.approvalMode === 'manual'
                    ? ' — posts will need client approval before publishing.'
                    : ` — posts auto-approve after ${currentClient.passiveApprovalHours || 72} hours if no feedback.`}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-primary" onClick={() => handleSubmit(false)} disabled={!caption.trim() || loading}>
                  {scheduledFor ? 'Schedule' : 'Add to Queue'}
                </button>
                <button className="btn-success" onClick={() => handleSubmit(true)} disabled={!caption.trim() || loading}>
                  Post Now
                </button>
                <label className="btn-ghost" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                  {csvImporting ? '...' : '📥 Import CSV'}
                  <input type="file" accept=".csv" onChange={handleCsvImport} hidden />
                </label>
              </div>
            </div>
          </div>
        )}

        {/* ── QUEUE TAB ── */}
        {tab === 'queue' && (
          <div>
            <div className="header">
              <h1>Queue ({queuedPosts.length})</h1>
              <button className="btn-ghost btn-sm" onClick={loadPosts}>Refresh</button>
            </div>
            <div className="card" style={{ padding: 0 }}>
              {queuedPosts.length === 0 && (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                  No posts in the queue. Create one!
                </div>
              )}
              {queuedPosts.map(post => (
                <div key={post.id} className="post-item">
                  {post.imageUrl && (
                    <img src={post.imageUrl} alt="" style={{ width: 48, height: 48, borderRadius: 6, objectFit: 'cover' }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="post-caption">{truncate(post.caption, 120)}</div>
                    <div className="post-meta">
                      <span className={`badge badge-${post.status}`}>{post.status}</span>
                      {' '}
                      {post.approvalStatus && post.approvalStatus !== 'approved' && (
                        <span className={`badge badge-${post.approvalStatus}`}>
                          {post.approvalStatus === 'pending' ? '⏳ pending approval' : post.approvalStatus === 'changes_requested' ? '✎ changes requested' : post.approvalStatus}
                        </span>
                      )}
                      {post.approvalStatus === 'approved' && post.approvalMode && post.approvalMode !== 'auto' && (
                        <span className="badge badge-approved">✓ approved</span>
                      )}
                      {' '}
                      {post.platforms?.map(p => <PlatformIcon key={p} platform={p} />)}
                      {' '}
                      {post.postType && post.postType !== 'feed' && <span className="badge" style={{ background: '#4338ca', color: '#c7d2fe' }}>{post.postType}</span>}
                      {' '}
                      {post.scheduledFor && <span style={{ color: 'var(--warning)' }}>{formatDateGMT(post.scheduledFor)}</span>}
                    </div>
                    {post.approvalStatus === 'changes_requested' && post.clientComment && (
                      <div className="approval-comment">
                        💬 Client: {post.clientComment}
                      </div>
                    )}
                  </div>
                  <div className="post-actions">
                    <button className="btn-success btn-sm" onClick={() => handlePublish(post.id)}
                      disabled={loading || post.approvalStatus === 'pending' || post.approvalStatus === 'changes_requested'}
                      title={post.approvalStatus === 'pending' ? 'Awaiting client approval' : post.approvalStatus === 'changes_requested' ? 'Client requested changes' : 'Publish now'}>
                      Publish
                    </button>
                    <button className="btn-danger btn-sm" onClick={() => setDeleteModal({ post, type: 'queue' })}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── CALENDAR TAB ── */}
        {tab === 'calendar' && (() => {
          const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
          const firstDayOfWeek = new Date(calYear, calMonth, 1).getDay(); // 0=Sun
          const startDay = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1; // Mon=0
          const monthName = new Date(calYear, calMonth).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

          // All posts (queued + published) for this client, grouped by day
          const allPosts = posts;
          const postsByDay = {};
          for (const p of allPosts) {
            const d = p.scheduledFor || p.publishedAt || p.createdAt;
            if (!d) continue;
            const day = new Date(d).toISOString().split('T')[0];
            if (!postsByDay[day]) postsByDay[day] = [];
            postsByDay[day].push(p);
          }

          const cells = [];
          for (let i = 0; i < startDay; i++) cells.push(null);
          for (let d = 1; d <= daysInMonth; d++) cells.push(d);
          while (cells.length % 7 !== 0) cells.push(null);

          const today = new Date().toISOString().split('T')[0];

          const handleReschedule = async (postId, newDate) => {
            try {
              await apiPut(`/admin?action=update-post&clientId=${selectedClient}`, {
                postId, scheduledFor: newDate, status: 'scheduled',
              });
              await loadPosts();
              setEditingPost(null);
            } catch (e) { alert(e.message); }
          };

          const selectedDayStr = calSelectedDay
            ? `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(calSelectedDay).padStart(2, '0')}`
            : null;
          const dayPosts = selectedDayStr ? (postsByDay[selectedDayStr] || []) : [];

          return (
            <div>
              <div className="header">
                <h1>Calendar</h1>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button className="btn-ghost btn-sm" onClick={() => {
                    if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); }
                    else setCalMonth(calMonth - 1);
                    setCalSelectedDay(null);
                  }}>◀</button>
                  <span style={{ fontSize: 15, fontWeight: 600, minWidth: 140, textAlign: 'center' }}>{monthName}</span>
                  <button className="btn-ghost btn-sm" onClick={() => {
                    if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); }
                    else setCalMonth(calMonth + 1);
                    setCalSelectedDay(null);
                  }}>▶</button>
                </div>
              </div>

              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                    <div key={d} style={{ padding: '8px 4px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textAlign: 'center' }}>{d}</div>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                  {cells.map((day, i) => {
                    if (!day) return <div key={i} style={{ minHeight: 70, background: 'var(--bg)', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }} />;
                    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const dp = postsByDay[dateStr] || [];
                    const isToday = dateStr === today;
                    const isSelected = day === calSelectedDay;
                    return (
                      <div key={i} onClick={() => setCalSelectedDay(day === calSelectedDay ? null : day)}
                        style={{
                          minHeight: 70, padding: '4px 6px', cursor: 'pointer',
                          borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
                          background: isSelected ? 'var(--accent)15' : isToday ? '#3b82f610' : 'transparent',
                          transition: 'background 0.1s',
                        }}>
                        <div style={{ fontSize: 12, fontWeight: isToday ? 700 : 400, color: isToday ? 'var(--accent)' : 'var(--text-muted)', marginBottom: 4 }}>{day}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                          {dp.slice(0, 4).map(p => (
                            <div key={p.id} title={truncate(p.caption, 60)} style={{
                              width: 8, height: 8, borderRadius: '50%',
                              background: p.status === 'published' ? 'var(--success)' : p.status === 'failed' ? 'var(--danger)' : 'var(--accent)',
                            }} />
                          ))}
                          {dp.length > 4 && <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>+{dp.length - 4}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Day detail panel */}
              {calSelectedDay && (
                <div className="card" style={{ marginTop: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h3 style={{ fontSize: 15, margin: 0 }}>
                      {new Date(calYear, calMonth, calSelectedDay).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </h3>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{dayPosts.length} post{dayPosts.length !== 1 ? 's' : ''}</span>
                  </div>
                  {dayPosts.length === 0 && (
                    <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No posts on this day.</p>
                  )}
                  {dayPosts.map(p => (
                    <div key={p.id} className="post-item" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10, marginBottom: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="post-caption">{truncate(p.caption, 100)}</div>
                        <div className="post-meta" style={{ marginTop: 4 }}>
                          <span className={`badge badge-${p.status}`}>{p.status}</span>
                          {' '}{p.platforms?.map(pl => <PlatformIcon key={pl} platform={pl} />)}
                          {' '}{p.postType && p.postType !== 'feed' && <span className="badge" style={{ background: '#4338ca', color: '#c7d2fe' }}>{p.postType}</span>}
                          {p.scheduledFor && <span style={{ color: 'var(--warning)', fontSize: 11, marginLeft: 6 }}>{formatDateGMT(p.scheduledFor)}</span>}
                        </div>
                      </div>
                      {(p.status === 'queued' || p.status === 'scheduled') && (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                          {editingPost === p.id ? (
                            <>
                              <input type="datetime-local" id={`reschedule-${p.id}`}
                                defaultValue={p.scheduledFor ? p.scheduledFor.slice(0, 16) : ''}
                                style={{ fontSize: 12, padding: '4px 8px' }} />
                              <button className="btn-primary btn-sm" onClick={() => {
                                const v = document.getElementById(`reschedule-${p.id}`).value;
                                if (v) handleReschedule(p.id, v);
                              }}>Save</button>
                              <button className="btn-ghost btn-sm" onClick={() => setEditingPost(null)}>✕</button>
                            </>
                          ) : (
                            <button className="btn-ghost btn-sm" onClick={() => setEditingPost(p.id)}>Reschedule</button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Legend */}
              <div style={{ marginTop: 12, display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-muted)' }}>
                <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', marginRight: 4 }} />Queued</span>
                <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', marginRight: 4 }} />Published</span>
                <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)', marginRight: 4 }} />Failed</span>
              </div>
            </div>
          );
        })()}

        {/* ── PUBLISHED TAB ── */}
        {tab === 'published' && (
          <div>
            <div className="header">
              <h1>Published ({publishedPosts.length})</h1>
            </div>
            <div className="card" style={{ padding: 0 }}>
              {publishedPosts.length === 0 && (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>No published posts yet.</div>
              )}
              {publishedPosts.map(post => (
                <div key={post.id} className="post-item">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="post-caption">{truncate(post.caption, 120)}</div>
                    <div className="post-meta">
                      <span className={`badge badge-${post.status}`}>{post.status}</span>
                      {' '}
                      {post.platforms?.map(p => {
                        const r = post.results?.[p];
                        return (
                          <span key={p} style={{ marginRight: 6 }}>
                            <PlatformIcon platform={p} />
                            {r?.success ? '✓' : r ? '✗' : '—'}
                          </span>
                        );
                      })}
                      {' '}
                      <span>{post.publishedAt ? timeAgo(post.publishedAt) : ''}</span>
                    </div>
                  </div>
                  <div className="post-actions">
                    <button className="btn-danger btn-sm" onClick={() => setDeleteModal({ post, type: 'published' })}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ANALYTICS TAB ── */}
        {tab === 'analytics' && (
          <div className="tab-content">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>
                📊 Analytics {currentClient ? `— ${currentClient.name}` : ''}
              </h3>
              <div style={{ display: 'flex', gap: 6 }}>
                {[7, 14, 30, 90].map(d => (
                  <button key={d} className={analyticsRange === d ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'}
                    onClick={() => setAnalyticsRange(d)}>{d}d</button>
                ))}
                <button className="btn-ghost btn-sm" onClick={loadAnalytics}>↻</button>
              </div>
            </div>

            {analyticsLoading && <p style={{ color: 'var(--text-muted)' }}>Loading analytics...</p>}

            {analytics && !analyticsLoading && (
              <>
                {/* Summary cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 20 }}>
                  {[
                    { label: 'Published', value: analytics.summary?.recentPublished || 0, color: '#4ade80' },
                    { label: 'Queued', value: analytics.summary?.queued || 0, color: '#3b82f6' },
                    { label: 'Failed', value: analytics.summary?.failed || 0, color: '#ef4444' },
                    { label: 'Success Rate', value: `${analytics.summary?.successRate || 0}%`, color: '#a78bfa' },
                  ].map(card => (
                    <div key={card.label} style={{
                      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
                      padding: '14px 16px', textAlign: 'center',
                    }}>
                      <div style={{ fontSize: 24, fontWeight: 700, color: card.color }}>{card.value}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{card.label}</div>
                    </div>
                  ))}
                </div>

                {/* Platform insights */}
                {analytics.insights && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 20 }}>
                    {analytics.insights.fb_fans != null && (
                      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <PlatformIcon platform="facebook" />
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Facebook</span>
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                          <div>Followers: <strong>{(analytics.insights.fb_followers || 0).toLocaleString()}</strong></div>
                          <div>Page Fans: <strong>{(analytics.insights.fb_fans || 0).toLocaleString()}</strong></div>
                          {analytics.insights.fb_page_impressions && (
                            <div>Impressions ({analyticsRange}d): <strong>{analytics.insights.fb_page_impressions.total?.toLocaleString()}</strong></div>
                          )}
                          {analytics.insights.fb_page_engaged_users && (
                            <div>Engaged Users ({analyticsRange}d): <strong>{analytics.insights.fb_page_engaged_users.total?.toLocaleString()}</strong></div>
                          )}
                        </div>
                      </div>
                    )}
                    {analytics.insights.ig_followers != null && (
                      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <PlatformIcon platform="instagram" />
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Instagram</span>
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                          <div>Followers: <strong>{(analytics.insights.ig_followers || 0).toLocaleString()}</strong></div>
                          <div>Posts: <strong>{(analytics.insights.ig_media_count || 0).toLocaleString()}</strong></div>
                          {analytics.insights.ig_impressions && (
                            <div>Impressions ({analyticsRange}d): <strong>{analytics.insights.ig_impressions.total?.toLocaleString()}</strong></div>
                          )}
                          {analytics.insights.ig_reach && (
                            <div>Reach ({analyticsRange}d): <strong>{analytics.insights.ig_reach.total?.toLocaleString()}</strong></div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Engagement Over Time — Recharts */}
                {analytics.engagementByDay && Object.keys(analytics.engagementByDay).length > 0 && (
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
                    <h4 style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--text-primary)' }}>Engagement Over Time</h4>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={Object.entries(analytics.engagementByDay).sort(([a],[b]) => a.localeCompare(b)).map(([day, m]) => ({
                        day: day.slice(5), likes: m.likes, comments: m.comments, shares: m.shares,
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                        <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
                        <Line type="monotone" dataKey="likes" stroke="#f472b6" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="comments" stroke="#60a5fa" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="shares" stroke="#4ade80" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                    <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8, fontSize: 11 }}>
                      <span><span style={{ color: '#f472b6' }}>●</span> Likes</span>
                      <span><span style={{ color: '#60a5fa' }}>●</span> Comments</span>
                      <span><span style={{ color: '#4ade80' }}>●</span> Shares</span>
                    </div>
                  </div>
                )}

                {/* Publishing Activity — Recharts Bar Chart */}
                {analytics.postsByDay && Object.keys(analytics.postsByDay).length > 0 && (
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
                    <h4 style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--text-primary)' }}>Publishing Activity</h4>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={Object.entries(analytics.postsByDay).sort(([a],[b]) => a.localeCompare(b)).slice(-30).map(([day, count]) => ({
                        day: day.slice(5), posts: count,
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="day" tick={{ fontSize: 9, fill: '#94a3b8' }} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
                        <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
                        <Bar dataKey="posts" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Platform breakdown */}
                {analytics.platformBreakdown && Object.keys(analytics.platformBreakdown).length > 0 && (
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
                    <h4 style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--text-primary)' }}>Posts by Platform</h4>
                    {Object.entries(analytics.platformBreakdown).map(([platform, stats]) => (
                      <div key={platform} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <PlatformIcon platform={platform} />
                        <span style={{ flex: 1, fontSize: 13, color: 'var(--text-secondary)' }}>
                          {PLATFORMS.find(p => p.id === platform)?.name || platform}
                        </span>
                        <span style={{ fontSize: 13, color: '#4ade80' }}>{stats.success} ✓</span>
                        {stats.failed > 0 && <span style={{ fontSize: 13, color: '#ef4444' }}>{stats.failed} ✗</span>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Per-post engagement table */}
                {analytics.postEngagement && analytics.postEngagement.length > 0 && (
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
                    <h4 style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--text-primary)' }}>Post Engagement</h4>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border)' }}>
                            <th style={{ textAlign: 'left', padding: '8px 6px', color: 'var(--text-muted)', fontWeight: 500 }}>Post</th>
                            <th style={{ textAlign: 'left', padding: '8px 6px', color: 'var(--text-muted)', fontWeight: 500 }}>Date</th>
                            <th style={{ textAlign: 'center', padding: '8px 6px', color: 'var(--text-muted)', fontWeight: 500 }}>❤️ Likes</th>
                            <th style={{ textAlign: 'center', padding: '8px 6px', color: 'var(--text-muted)', fontWeight: 500 }}>💬 Comments</th>
                            <th style={{ textAlign: 'center', padding: '8px 6px', color: 'var(--text-muted)', fontWeight: 500 }}>🔄 Shares</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analytics.postEngagement.map(pe => {
                            const totalLikes = Object.values(pe.metrics).reduce((s, m) => s + (m.likes || 0), 0);
                            const totalComments = Object.values(pe.metrics).reduce((s, m) => s + (m.comments || 0), 0);
                            const totalShares = Object.values(pe.metrics).reduce((s, m) => s + (m.shares || 0), 0);
                            return (
                              <tr key={pe.postId} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '8px 6px', maxWidth: 200 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {pe.platforms?.map(pl => <PlatformIcon key={pl} platform={pl} />)}
                                    <span style={{ color: 'var(--text)' }}>{pe.caption || '—'}</span>
                                  </div>
                                </td>
                                <td style={{ padding: '8px 6px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                  {pe.publishedAt ? new Date(pe.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}
                                </td>
                                <td style={{ padding: '8px 6px', textAlign: 'center', color: '#f472b6', fontWeight: 600 }}>{totalLikes}</td>
                                <td style={{ padding: '8px 6px', textAlign: 'center', color: '#60a5fa', fontWeight: 600 }}>{totalComments}</td>
                                <td style={{ padding: '8px 6px', textAlign: 'center', color: '#4ade80', fontWeight: 600 }}>{totalShares}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}

            {!analytics && !analyticsLoading && (
              <p style={{ color: 'var(--text-muted)' }}>Select a client to view analytics.</p>
            )}
          </div>
        )}

        {/* ── BILLING TAB ── */}
        {tab === 'billing' && isAdmin && (() => {
          const PLAN_DATA = [
            { id: 'free', name: 'Free', price: '£0', profiles: 3, users: 1, features: ['3 social profiles', '1 user', 'Basic scheduling', 'Manual posting'] },
            { id: 'starter', name: 'Starter', price: '£15/mo', profiles: 10, users: 2, features: ['10 social profiles', '2 users', 'AI Writer', 'Approval workflows', 'Email notifications'], priceEnv: 'STRIPE_PRICE_STARTER' },
            { id: 'agency', name: 'Agency', price: '£59/mo', profiles: 25, users: 5, features: ['25 social profiles', '5 users', 'White-label ready', 'Client connect portal', 'Priority support'], priceEnv: 'STRIPE_PRICE_AGENCY', popular: true },
            { id: 'agency_pro', name: 'Agency Pro', price: '£119/mo', profiles: 50, users: -1, features: ['50 social profiles', 'Unlimited users', 'Custom branding', 'API access', 'Dedicated support'], priceEnv: 'STRIPE_PRICE_AGENCY_PRO' },
          ];
          const currentPlan = user?.plan || 'free';
          const profileCount = clients.length;
          const userCount = users.length || 1;
          const planInfo = PLAN_DATA.find(p => p.id === currentPlan) || PLAN_DATA[0];

          const handleUpgrade = async (priceEnv) => {
            try {
              setLoading(true);
              const data = await apiPost('/stripe-checkout', { priceId: priceEnv });
              if (data.url) window.open(data.url, '_blank');
              else alert(data.error || 'Could not create checkout session');
            } catch (e) { alert(e.message); }
            setLoading(false);
          };

          const handlePortal = async () => {
            if (!user?.stripeCustomerId) { alert('No Stripe subscription found. Upgrade first.'); return; }
            try {
              setLoading(true);
              const data = await apiGet(`/stripe-checkout?action=portal&customerId=${user.stripeCustomerId}`);
              if (data.url) window.open(data.url, '_blank');
            } catch (e) { alert(e.message); }
            setLoading(false);
          };

          return (
            <div>
              <div className="header"><h1>Billing</h1></div>

              {/* Current plan */}
              <div className="card" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>Current Plan</div>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>{planInfo.name} <span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 400 }}>{planInfo.price}</span></div>
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
                    <div><span style={{ color: 'var(--text-muted)' }}>Profiles:</span> <strong>{profileCount}</strong>{planInfo.profiles > 0 ? `/${planInfo.profiles}` : ''}</div>
                    <div><span style={{ color: 'var(--text-muted)' }}>Users:</span> <strong>{userCount}</strong>{planInfo.users > 0 ? `/${planInfo.users}` : planInfo.users === -1 ? ' (unlimited)' : ''}</div>
                  </div>
                </div>
                {user?.stripeCustomerId && (
                  <button className="btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={handlePortal} disabled={loading}>
                    Manage Subscription →
                  </button>
                )}
              </div>

              {/* Plan comparison */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                {PLAN_DATA.map(plan => (
                  <div key={plan.id} className="card" style={{
                    border: plan.popular ? '2px solid var(--accent)' : plan.id === currentPlan ? '2px solid var(--success)' : undefined,
                    position: 'relative',
                  }}>
                    {plan.popular && (
                      <div style={{ position: 'absolute', top: -10, right: 12, background: 'var(--accent)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 10px', borderRadius: 10, textTransform: 'uppercase' }}>
                        Most Popular
                      </div>
                    )}
                    <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{plan.name}</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)', marginBottom: 12 }}>{plan.price}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.8 }}>
                      {plan.features.map((f, i) => <div key={i}>✓ {f}</div>)}
                    </div>
                    {plan.id === currentPlan ? (
                      <button className="btn-ghost btn-sm" disabled style={{ width: '100%', opacity: 0.5 }}>Current Plan</button>
                    ) : plan.id === 'free' ? (
                      <button className="btn-ghost btn-sm" disabled style={{ width: '100%', opacity: 0.5 }}>Free Tier</button>
                    ) : (
                      <button className="btn-primary btn-sm" style={{ width: '100%' }}
                        onClick={() => handleUpgrade(plan.priceEnv)} disabled={loading}>
                        {currentPlan === 'free' ? 'Start 14-day Trial' : 'Upgrade'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* ── TEAM TAB ── */}
        {tab === 'team' && isAdmin && (
          <div>
            <div className="header"><h1>Team Management</h1></div>
            <div className="card" style={{ padding: 0 }}>
              {users.map(u => (
                <div key={u.email} className="post-item">
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>{u.name}</div>
                    <div className="post-meta">{u.email} · {u.role} · <span className={`badge badge-${u.status === 'active' ? 'published' : u.status === 'pending' ? 'scheduled' : 'deleted'}`}>{u.status}</span></div>
                  </div>
                  <div className="post-actions">
                    {u.status === 'pending' && (
                      <>
                        <button className="btn-success btn-sm" onClick={() => handleApprove(u.email)}>Approve</button>
                        <button className="btn-danger btn-sm" onClick={() => handleDecline(u.email)}>Decline</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── CLIENTS TAB ── */}
        {tab === 'clients' && isAdmin && (
          <div>
            <div className="header">
              <h1>Clients & API</h1>
              <button className="btn-primary btn-sm" onClick={() => setClientModal({ name: '' })}>+ Add Client</button>
            </div>
            {clients.map(c => (
              <div key={c.id} className="card" style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong>{c.name}</strong>
                    <div className="post-meta" style={{ marginTop: 4 }}>
                      FB: {c.fbPageId || '—'} · IG: {c.igUserId || '—'} · Token: {c.pageAccessToken ? '✓' : '✗'}
                      {c.linkedinId && <> · LI: ✓</>}
                      {c.tokenHealth && (
                        <span style={{ marginLeft: 8 }}>
                          · Health: {Object.values(c.tokenHealth.platforms || {}).every(p => p.valid) ?
                            <span style={{ color: 'var(--success)' }}>✓ OK</span> :
                            <span style={{ color: 'var(--danger)' }}>✗ Issue</span>}
                        </span>
                      )}
                    </div>
                    {c.approvalMode && c.approvalMode !== 'auto' && (
                      <div className="post-meta" style={{ marginTop: 2 }}>
                        Approval: <span style={{ color: c.approvalMode === 'manual' ? '#f59e0b' : '#a78bfa' }}>{c.approvalMode}</span>
                      </div>
                    )}
                    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Approval:</span>
                      <select
                        value={c.approvalMode || 'auto'}
                        onChange={async (e) => {
                          try {
                            await apiPut('/admin?action=set-approval-mode', { clientId: c.id, approvalMode: e.target.value });
                            loadClients();
                          } catch (err) { alert('Error: ' + err.message); }
                        }}
                        style={{ fontSize: 12, padding: '2px 6px', background: 'var(--bg-main)', color: 'var(--text-main)', border: '1px solid var(--border)', borderRadius: 6 }}
                      >
                        <option value="auto">Auto (no approval)</option>
                        <option value="manual">Manual (client approves)</option>
                        <option value="passive">Passive (72h auto-approve)</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button className="btn-ghost btn-sm" onClick={async () => {
                      setLinkModal({ type: 'invite', clientName: c.name, url: null, loading: true });
                      try {
                        const data = await apiPost('/admin?action=generate-invite', { clientId: c.id });
                        setLinkModal({ type: 'invite', clientName: c.name, url: data.url, loading: false });
                      } catch (e) { setLinkModal({ type: 'invite', clientName: c.name, url: null, loading: false, error: e.message }); }
                    }}>🔗 Invite</button>
                    <button className="btn-ghost btn-sm" onClick={async () => {
                      setLinkModal({ type: 'approval', clientName: c.name, url: null, loading: true });
                      try {
                        const data = await apiPost('/admin?action=generate-approval-link', { clientId: c.id });
                        setLinkModal({ type: 'approval', clientName: c.name, url: data.url, loading: false });
                      } catch (e) { setLinkModal({ type: 'approval', clientName: c.name, url: null, loading: false, error: e.message }); }
                    }}>✓ Approve Link</button>
                    <button className="btn-ghost btn-sm" onClick={() => setClientModal({ ...c })}>Edit</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── DELETE MODAL ── */}
      {deleteModal && (
        <div className="modal-overlay" onClick={() => setDeleteModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Delete Post</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              {truncate(deleteModal.post.caption, 100)}
            </p>

            {deleteModal.type === 'published' && deleteModal.post.results && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 13, marginBottom: 8 }}>This post has been published to:</p>
                {Object.entries(deleteModal.post.results).filter(([, r]) => r?.success).map(([p]) => (
                  <div key={p} style={{ fontSize: 13, marginBottom: 4 }}>
                    <PlatformIcon platform={p} /> {p}
                  </div>
                ))}
              </div>
            )}

            <div className="modal-actions" style={{ flexDirection: 'column', gap: 8 }}>
              {deleteModal.type === 'published' && deleteModal.post.status !== 'deleted' && (
                <button className="btn-danger" style={{ width: '100%' }}
                  onClick={() => handleDeleteFromPlatform(deleteModal.post.id)} disabled={loading}>
                  Delete from platforms & remove
                </button>
              )}
              <button className="btn-ghost" style={{ width: '100%', color: 'var(--danger)' }}
                onClick={() => handleDelete(deleteModal.post.id)}>
                Remove from dashboard only
              </button>
              <button className="btn-ghost" style={{ width: '100%' }}
                onClick={() => setDeleteModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── CLIENT MODAL ── */}
      {clientModal && (
        <div className="modal-overlay" onClick={() => setClientModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 550 }}>
            <h2>{clientModal.id ? 'Edit Client' : 'Add Client'}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Client Name</label>
              <input value={clientModal.name || ''} onChange={e => setClientModal({ ...clientModal, name: e.target.value })} />

              <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Client Email <span style={{ fontSize: 10, color: '#6b7280' }}>(for approval notifications)</span></label>
              <input type="email" value={clientModal.clientEmail || ''} onChange={e => setClientModal({ ...clientModal, clientEmail: e.target.value })} placeholder="client@example.com" />

              <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Facebook Page ID
                <a href={PLATFORM_LINKS.fbPageId} target="_blank" rel="noopener" style={{ color: 'var(--accent)', marginLeft: 6, fontSize: 11 }}>Find it →</a>
              </label>
              <input value={clientModal.fbPageId || ''} onChange={e => setClientModal({ ...clientModal, fbPageId: e.target.value })} placeholder="e.g. 569602312902858" />

              <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Instagram Business Account ID
                <a href={PLATFORM_LINKS.igUserId} target="_blank" rel="noopener" style={{ color: 'var(--accent)', marginLeft: 6, fontSize: 11 }}>Find it →</a>
              </label>
              <input value={clientModal.igUserId || ''} onChange={e => setClientModal({ ...clientModal, igUserId: e.target.value })} placeholder="e.g. 17841400969633192" />

              <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Page Access Token
                <a href={PLATFORM_LINKS.pageAccessToken} target="_blank" rel="noopener" style={{ color: 'var(--accent)', marginLeft: 6, fontSize: 11 }}>Graph Explorer →</a>
              </label>
              <input type="password" value={clientModal.pageAccessToken || ''} onChange={e => setClientModal({ ...clientModal, pageAccessToken: e.target.value })} placeholder="Paste token (will be encrypted)" />

              <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 12 }}>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>White-Label Branding</label>
              </div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Brand Name <span style={{ fontSize: 10, color: '#6b7280' }}>(shown on connect &amp; approval portals)</span></label>
              <input value={clientModal.brandName || ''} onChange={e => setClientModal({ ...clientModal, brandName: e.target.value })} placeholder="e.g. Acme Marketing" />
              <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Brand Color <span style={{ fontSize: 10, color: '#6b7280' }}>(hex)</span></label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="color" value={clientModal.brandColor || '#3b82f6'} onChange={e => setClientModal({ ...clientModal, brandColor: e.target.value })} style={{ width: 40, height: 34, padding: 2, cursor: 'pointer' }} />
                <input value={clientModal.brandColor || ''} onChange={e => setClientModal({ ...clientModal, brandColor: e.target.value })} placeholder="#3b82f6" style={{ flex: 1 }} />
              </div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Logo URL</label>
              <input value={clientModal.logoUrl || ''} onChange={e => setClientModal({ ...clientModal, logoUrl: e.target.value })} placeholder="https://example.com/logo.png" />

              <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 12 }}>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Threads</label>
              </div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Threads User ID</label>
              <input value={clientModal.threadsUserId || ''} onChange={e => setClientModal({ ...clientModal, threadsUserId: e.target.value })} placeholder="Threads user ID (from Meta)" />

              <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 12 }}>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Bluesky</label>
              </div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Bluesky Handle</label>
              <input value={clientModal.blueskyIdentifier || ''} onChange={e => setClientModal({ ...clientModal, blueskyIdentifier: e.target.value })} placeholder="e.g. yourname.bsky.social" />
              <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Bluesky App Password</label>
              <input type="password" value={clientModal.blueskyAppPassword || ''} onChange={e => setClientModal({ ...clientModal, blueskyAppPassword: e.target.value })} placeholder="Generate at bsky.app/settings/app-passwords" />
            </div>

            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setClientModal(null)}>Cancel</button>
              <button className="btn-primary" onClick={() => handleSaveClient(clientModal)} disabled={!clientModal.name}>
                {clientModal.id ? 'Save' : 'Add Client'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── LINK MODAL (Invite / Approval) ── */}
      {linkModal && (
        <div className="modal-overlay" onClick={() => setLinkModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <h2>{linkModal.type === 'invite' ? '🔗 Connect Invite' : '✓ Approval Link'}</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              {linkModal.type === 'invite'
                ? `Send this link to ${linkModal.clientName} so they can connect their social accounts.`
                : `Send this link to ${linkModal.clientName} so they can approve pending posts.`}
            </p>
            {linkModal.loading ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Generating link...</p>
            ) : linkModal.error ? (
              <p style={{ fontSize: 13, color: 'var(--danger)' }}>Error: {linkModal.error}</p>
            ) : linkModal.url ? (
              <>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    readOnly
                    value={linkModal.url}
                    onClick={e => e.target.select()}
                    style={{
                      flex: 1, background: 'var(--bg-main)', border: '1px solid var(--border)',
                      borderRadius: 8, padding: '10px 12px', color: 'var(--text-main)',
                      fontSize: 12, fontFamily: 'monospace', cursor: 'text',
                    }}
                  />
                  <button
                    className="btn-primary btn-sm"
                    style={{ whiteSpace: 'nowrap', padding: '10px 16px' }}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(linkModal.url);
                        setLinkModal(prev => ({ ...prev, copied: true }));
                        setTimeout(() => setLinkModal(prev => prev ? ({ ...prev, copied: false }) : null), 2000);
                      } catch {
                        // Fallback: select the input
                        const input = document.querySelector('.modal input[readonly]');
                        if (input) { input.select(); document.execCommand('copy'); }
                      }
                    }}
                  >
                    {linkModal.copied ? '✓ Copied!' : 'Copy'}
                  </button>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>
                  {linkModal.type === 'invite' ? 'Expires in 7 days.' : 'Expires in 14 days.'}
                </p>
              </>
            ) : null}
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setLinkModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
