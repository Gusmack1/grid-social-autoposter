import React, { useState, useEffect, useCallback } from 'react';
import { PLATFORMS, POST_TYPES, PLATFORM_LINKS, API_BASE } from './constants.js';
import { formatDateGMT, timeAgo, truncate } from './utils.js';
import { api, apiGet, apiPost, apiPut, apiDelete, clearToken } from './hooks/useApi.js';
import PlatformIcon from './components/PlatformIcon.jsx';

const TABS = [
  { id: 'compose', name: 'Create Post', icon: '✏️' },
  { id: 'queue', name: 'Queue', icon: '📋' },
  { id: 'published', name: 'Published', icon: '✅' },
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
  const [videoUrl, setVideoUrl] = useState('');
  const [platforms, setPlatforms] = useState(['facebook', 'instagram']);
  const [postType, setPostType] = useState('feed');
  const [scheduledFor, setScheduledFor] = useState('');
  const [uploading, setUploading] = useState(false);

  // Team state
  const [users, setUsers] = useState([]);

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
  useEffect(() => { if (tab === 'team') loadUsers(); }, [tab]);

  const currentClient = clients.find(c => c.id === selectedClient);

  // Check which platforms the client has configured
  const clientPlatforms = currentClient ? PLATFORMS.filter(p => {
    if (p.id === 'facebook') return currentClient.fbPageId;
    if (p.id === 'instagram') return currentClient.igUserId;
    if (p.id === 'twitter') return currentClient._hasTokens && currentClient.twitterAccessToken;
    if (p.id === 'linkedin') return currentClient.linkedinAccessToken;
    if (p.id === 'google_business') return currentClient.gbpAccessToken;
    if (p.id === 'tiktok') return currentClient.tiktokAccessToken;
    return false;
  }).map(p => p.id) : [];

  // ── COMPOSE ──
  const handleSubmit = async (postNow = false) => {
    if (!caption.trim() || !selectedClient) return;
    setLoading(true);
    try {
      if (postNow) {
        await apiPost(`/admin?action=post-now&clientId=${selectedClient}`, {
          caption, imageUrl: imageUrl || null, videoUrl: videoUrl || null,
          platforms, postType,
        });
      } else {
        await apiPost(`/admin?action=add-post&clientId=${selectedClient}`, {
          caption, imageUrl: imageUrl || null, videoUrl: videoUrl || null,
          platforms, postType, scheduledFor: scheduledFor || null,
        });
      }
      setCaption(''); setImageUrl(''); setVideoUrl(''); setScheduledFor('');
      await loadPosts();
      if (!postNow) setTab('queue');
    } catch (e) { alert(e.message); }
    setLoading(false);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
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
