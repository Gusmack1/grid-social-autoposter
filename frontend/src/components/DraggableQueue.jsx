import React, { useState, useRef } from 'react';
import { apiPut } from '../hooks/useApi.js';
import PlatformIcon from './PlatformIcon.jsx';
import { truncate, formatDateGMT } from '../utils.js';

export default function DraggableQueue({ posts, clientId, onRefresh, onPublish, onDelete, onDuplicate, loading, selectedIds, onToggleSelect, onSelectAll }) {
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);
  const [saving, setSaving] = useState(false);
  const dragItem = useRef(null);

  const allSelected = posts.length > 0 && selectedIds.length === posts.length;
  const someSelected = selectedIds.length > 0 && selectedIds.length < posts.length;

  const handleDragStart = (e, idx) => {
    dragItem.current = idx;
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    const ghost = e.target.cloneNode(true);
    ghost.style.opacity = '0.5';
    ghost.style.position = 'absolute';
    ghost.style.top = '-1000px';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => document.body.removeChild(ghost), 0);
  };

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOverIdx(idx);
  };

  const handleDrop = async (e, dropIdx) => {
    e.preventDefault();
    const fromIdx = dragItem.current;
    if (fromIdx === null || fromIdx === dropIdx) {
      setDragIdx(null);
      setOverIdx(null);
      return;
    }
    const reordered = [...posts];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(dropIdx, 0, moved);
    setDragIdx(null);
    setOverIdx(null);
    setSaving(true);
    try {
      await apiPut(`/admin?action=reorder-queue&clientId=${clientId}`, {
        order: reordered.map(p => p.id),
      });
      onRefresh();
    } catch (e) {
      alert('Reorder failed: ' + e.message);
    }
    setSaving(false);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
    setOverIdx(null);
    dragItem.current = null;
  };

  return (
    <div className="card" style={{ padding: 0 }}>
      {posts.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          No posts in the queue. Create one!
        </div>
      )}
      {saving && (
        <div style={{ padding: '6px 14px', fontSize: 11, color: 'var(--accent)', background: 'rgba(59,130,246,0.1)', textAlign: 'center' }}>
          Saving new order...
        </div>
      )}

      {/* Select all header */}
      {posts.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px',
          borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)',
        }}>
          <input
            type="checkbox"
            checked={allSelected}
            ref={el => { if (el) el.indeterminate = someSelected; }}
            onChange={() => onSelectAll()}
            style={{ cursor: 'pointer', width: 16, height: 16, accentColor: 'var(--accent)' }}
            title={allSelected ? 'Deselect all' : 'Select all'}
          />
          <span>{selectedIds.length > 0 ? `${selectedIds.length} selected` : 'Select all'}</span>
        </div>
      )}

      {posts.map((post, idx) => (
        <div
          key={post.id}
          draggable
          onDragStart={e => handleDragStart(e, idx)}
          onDragOver={e => handleDragOver(e, idx)}
          onDrop={e => handleDrop(e, idx)}
          onDragEnd={handleDragEnd}
          className="post-item"
          style={{
            cursor: 'grab',
            opacity: dragIdx === idx ? 0.4 : 1,
            borderTop: overIdx === idx && dragIdx !== idx ? '2px solid var(--accent)' : 'none',
            transition: 'opacity 0.15s, border-top 0.1s',
            background: selectedIds.includes(post.id) ? 'rgba(59,130,246,0.08)' : undefined,
          }}
        >
          {/* Checkbox */}
          <input
            type="checkbox"
            checked={selectedIds.includes(post.id)}
            onChange={() => onToggleSelect(post.id)}
            onClick={e => e.stopPropagation()}
            style={{ cursor: 'pointer', width: 16, height: 16, accentColor: 'var(--accent)', flexShrink: 0 }}
          />

          {/* Drag handle */}
          <div style={{
            display: 'flex', alignItems: 'center', color: 'var(--text-muted)',
            fontSize: 16, cursor: 'grab', userSelect: 'none', padding: '0 2px',
          }}
            title="Drag to reorder">
            ⠿
          </div>

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
              {post.postType && post.postType !== 'feed' && (
                <span className="badge" style={{ background: '#4338ca', color: '#c7d2fe' }}>{post.postType}</span>
              )}
              {' '}
              {post.scheduledFor && <span style={{ color: 'var(--warning)' }}>{formatDateGMT(post.scheduledFor)}</span>}
            </div>
            {post.approvalStatus === 'changes_requested' && post.clientComment && (
              <div className="approval-comment">
                💬 Client: {post.clientComment}
              </div>
            )}
          </div>
          <div className="post-actions" style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            {onDuplicate && (
              <button className="btn-ghost btn-sm" onClick={() => onDuplicate(post.id)} title="Duplicate post">⎘</button>
            )}
            <button className="btn-success btn-sm" onClick={() => onPublish(post.id)}
              disabled={loading || post.approvalStatus === 'pending' || post.approvalStatus === 'changes_requested'}
              title={post.approvalStatus === 'pending' ? 'Awaiting client approval' : post.approvalStatus === 'changes_requested' ? 'Client requested changes' : 'Publish now'}>
              Publish
            </button>
            <button className="btn-danger btn-sm" onClick={() => onDelete(post)}>✕</button>
          </div>
        </div>
      ))}
    </div>
  );
}
