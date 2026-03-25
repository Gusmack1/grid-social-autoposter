import React, { useState } from 'react';
import { apiGet } from '../hooks/useApi.js';

export default function AnalyticsPdfExport({ clientId, clientName, range }) {
  const [generating, setGenerating] = useState(false);

  const handleExport = async () => {
    if (!clientId) return;
    setGenerating(true);
    try {
      const data = await apiGet(`/admin?action=export-analytics&clientId=${clientId}&range=${range}`);

      // Build a printable HTML report
      const sortedDays = Object.entries(data.postsByDay || {}).sort(([a], [b]) => a.localeCompare(b));
      const maxPosts = Math.max(...sortedDays.map(([, c]) => c), 1);

      const platformRows = Object.entries(data.platformBreakdown || {}).map(([p, s]) =>
        `<tr><td style="padding:6px 12px">${p}</td><td style="padding:6px 12px;text-align:center;color:#22c55e">${s.success}</td><td style="padding:6px 12px;text-align:center;color:#ef4444">${s.failed}</td></tr>`
      ).join('');

      const recentRows = (data.recentPosts || []).map(p =>
        `<tr>
          <td style="padding:6px 12px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.caption || '—'}</td>
          <td style="padding:6px 12px">${(p.platforms || []).join(', ')}</td>
          <td style="padding:6px 12px">${p.postType || 'feed'}</td>
          <td style="padding:6px 12px">${p.publishedAt ? new Date(p.publishedAt).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '—'}</td>
        </tr>`
      ).join('');

      const barChart = sortedDays.slice(-30).map(([day, count]) => {
        const pct = (count / maxPosts) * 100;
        return `<div style="display:flex;align-items:center;gap:8px;margin:2px 0">
          <span style="width:60px;font-size:11px;color:#6b7280;text-align:right">${day.slice(5)}</span>
          <div style="flex:1;background:#1e293b;border-radius:4px;height:18px">
            <div style="width:${pct}%;background:#3b82f6;border-radius:4px;height:18px;min-width:${count > 0 ? 4 : 0}px"></div>
          </div>
          <span style="width:24px;font-size:11px;color:#94a3b8">${count}</span>
        </div>`;
      }).join('');

      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Analytics Report — ${data.clientName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #f1f5f9; padding: 40px; }
    .container { max-width: 800px; margin: 0 auto; }
    h1 { font-size: 24px; margin-bottom: 4px; }
    .subtitle { color: #94a3b8; font-size: 13px; margin-bottom: 32px; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 32px; }
    .stat { background: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 16px; text-align: center; }
    .stat-val { font-size: 28px; font-weight: 700; }
    .stat-label { font-size: 12px; color: #94a3b8; margin-top: 4px; }
    .section { margin-bottom: 32px; }
    .section h2 { font-size: 16px; margin-bottom: 12px; color: #e2e8f0; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; padding: 8px 12px; border-bottom: 2px solid #334155; color: #94a3b8; font-weight: 500; }
    td { border-bottom: 1px solid #1e293b; }
    tr:nth-child(even) { background: rgba(30,41,59,0.5); }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #334155; font-size: 11px; color: #64748b; text-align: center; }
    @media print {
      body { background: white; color: #1e293b; padding: 20px; }
      .stat { border-color: #e2e8f0; }
      .stat-val { color: #1e293b; }
      th { border-bottom-color: #e2e8f0; color: #64748b; }
      td { border-bottom-color: #f1f5f9; }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>📊 ${data.clientName} — Analytics Report</h1>
    <div class="subtitle">Last ${data.range} days · Generated ${new Date(data.generatedAt).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' })}</div>

    <div class="summary">
      <div class="stat"><div class="stat-val" style="color:#4ade80">${data.summary.totalPublished}</div><div class="stat-label">Published</div></div>
      <div class="stat"><div class="stat-val" style="color:#3b82f6">${data.summary.queued}</div><div class="stat-label">Queued</div></div>
      <div class="stat"><div class="stat-val" style="color:#ef4444">${data.summary.failed}</div><div class="stat-label">Failed</div></div>
      <div class="stat"><div class="stat-val" style="color:#a78bfa">${data.summary.successRate}%</div><div class="stat-label">Success Rate</div></div>
    </div>

    ${platformRows ? `
    <div class="section">
      <h2>Posts by Platform</h2>
      <table>
        <thead><tr><th>Platform</th><th style="text-align:center">Success</th><th style="text-align:center">Failed</th></tr></thead>
        <tbody>${platformRows}</tbody>
      </table>
    </div>` : ''}

    ${barChart ? `
    <div class="section">
      <h2>Publishing Activity</h2>
      ${barChart}
    </div>` : ''}

    ${recentRows ? `
    <div class="section">
      <h2>Recent Posts</h2>
      <table>
        <thead><tr><th>Caption</th><th>Platforms</th><th>Type</th><th>Published</th></tr></thead>
        <tbody>${recentRows}</tbody>
      </table>
    </div>` : ''}

    <div class="footer">
      Grid Social Auto-Poster · gridsocial.co.uk · Report generated automatically
    </div>
  </div>
</body>
</html>`;

      // Open in new window for print-to-PDF
      const w = window.open('', '_blank');
      w.document.write(html);
      w.document.close();
      // Auto-trigger print dialog after a short delay
      setTimeout(() => { w.print(); }, 500);

    } catch (e) {
      alert('Export failed: ' + e.message);
    }
    setGenerating(false);
  };

  return (
    <button
      className="btn-ghost btn-sm"
      onClick={handleExport}
      disabled={generating || !clientId}
      style={{ fontSize: 12 }}
    >
      {generating ? '...' : '📄 Export PDF'}
    </button>
  );
}
