import React, { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost, apiDelete } from '../hooks/useApi.js';

export default function TemplatePicker({ clientId, onApply }) {
  const [templates, setTemplates] = useState([]);
  const [showSave, setShowSave] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [expanded, setExpanded] = useState(false);

  const loadTemplates = useCallback(async () => {
    if (!clientId) return;
    try {
      const data = await apiGet(`/admin?action=get-templates&clientId=${clientId}`);
      setTemplates(Array.isArray(data) ? data : []);
    } catch (e) { console.error('Load templates:', e); }
  }, [clientId]);

  useEffect(() => { loadTemplates(); }, [clientId]);

  const handleDelete = async (id) => {
    if (!confirm('Delete this template?')) return;
    try {
      await apiDelete(`/admin?action=delete-template&clientId=${clientId}`, { templateId: id });
      loadTemplates();
    } catch (e) { alert(e.message); }
  };

  if (!expanded) {
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn-ghost btn-sm"
          onClick={() => { setExpanded(true); loadTemplates(); }}
          style={{ fontSize: 12 }}>
          📄 Templates {templates.length > 0 ? `(${templates.length})` : ''}
        </button>
      </div>
    );
  }

  return (
    <div style={{
      background: 'var(--bg)', border: '1px solid var(--border)',
      borderRadius: 8, padding: 12, marginBottom: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>📄 Templates</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn-ghost btn-sm" onClick={() => setShowSave(!showSave)}
            style={{ fontSize: 11 }}>
            {showSave ? 'Cancel' : '+ Save Current'}
          </button>
          <button className="btn-ghost btn-sm" onClick={() => setExpanded(false)}
            style={{ fontSize: 11, padding: '2px 8px' }}>✕</button>
        </div>
      </div>

      {/* Save form */}
      {showSave && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <input
            type="text"
            placeholder="Template name..."
            value={saveName}
            onChange={e => setSaveName(e.target.value)}
            style={{ flex: 1, fontSize: 12, padding: '6px 10px' }}
          />
          <button className="btn-primary btn-sm" disabled={!saveName.trim()}
            onClick={async () => {
              if (!onApply) return;
              // Get current compose state from parent via callback
              const current = onApply('get');
              if (!current) return;
              try {
                await apiPost(`/admin?action=save-template&clientId=${clientId}`, {
                  name: saveName.trim(),
                  caption: current.caption || '',
                  platforms: current.platforms || ['facebook', 'instagram'],
                  postType: current.postType || 'feed',
                  imageUrl: current.imageUrl || null,
                });
                setSaveName('');
                setShowSave(false);
                loadTemplates();
              } catch (e) { alert(e.message); }
            }}>
            Save
          </button>
        </div>
      )}

      {/* Template list */}
      {templates.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>
          No templates yet. Create a post and click "Save Current" to save it as a template.
        </div>
      )}
      {templates.map(t => (
        <div key={t.id} style={{
          display: 'flex', gap: 8, alignItems: 'center',
          padding: '8px 0', borderTop: '1px solid var(--border)',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{t.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t.caption ? t.caption.substring(0, 60) + (t.caption.length > 60 ? '…' : '') : 'Empty caption'}
              {' · '}{t.postType || 'feed'}
              {' · '}{(t.platforms || []).join(', ')}
            </div>
          </div>
          <button className="btn-primary btn-sm" style={{ fontSize: 11, padding: '4px 10px' }}
            onClick={() => {
              onApply('apply', {
                caption: t.caption || '',
                platforms: t.platforms || ['facebook', 'instagram'],
                postType: t.postType || 'feed',
                imageUrl: t.imageUrl || '',
              });
            }}>
            Use
          </button>
          <button className="btn-ghost btn-sm" style={{ fontSize: 11, padding: '4px 8px', color: 'var(--danger)' }}
            onClick={() => handleDelete(t.id)}>✕</button>
        </div>
      ))}
    </div>
  );
}
