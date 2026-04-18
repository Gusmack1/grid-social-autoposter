// audit-pdf.mjs — render the 10-finding audit to a 1-page PDF buffer using pdfkit.
// Pure-node, no puppeteer. Returns a Uint8Array suitable for upload.

import PDFDocument from 'pdfkit';

export async function renderAuditPdf({ pageInfo, summary, cadence, findings }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 48 });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
      doc.on('error', reject);

      // ── Header ──
      doc.fontSize(22).fillColor('#0F172A').text('Grid Social', { continued: true })
         .fontSize(22).fillColor('#64748B').text('  Facebook & Instagram audit');
      doc.moveDown(0.2);
      doc.fontSize(10).fillColor('#475569').text(
        `Page: ${pageInfo.name || pageInfo.username || 'Facebook Page'}   •   ` +
        `Followers: ${pageInfo.followers_count || pageInfo.fan_count || 'n/a'}   •   ` +
        `Delivered: ${new Date().toISOString().slice(0, 10)}`
      );
      doc.moveTo(48, doc.y + 6).lineTo(547, doc.y + 6).strokeColor('#E2E8F0').stroke();
      doc.moveDown(0.8);

      // ── Stats band ──
      doc.fontSize(11).fillColor('#0F172A');
      const stats = [
        `Voice pass rate: ${summary.passRate}% (${summary.passCount}/${summary.sampleSize} posts)`,
        `Mean engagement per post: ${summary.engagement.mean} (max ${summary.engagement.max}, min ${summary.engagement.min})`,
        `Posting cadence: ${cadence.perWeek} posts per week`,
        `Hashtag-waste posts: ${summary.hashtagWaste}`,
      ];
      for (const s of stats) doc.text('• ' + s);
      doc.moveDown(0.4);

      // ── Top failure modes ──
      doc.fontSize(12).fillColor('#0F172A').text('Top voice-failure modes');
      doc.fontSize(10).fillColor('#334155');
      if (summary.topFailures?.length) {
        for (const f of summary.topFailures) doc.text(`• ${f.mode} — ${f.count}`);
      } else {
        doc.text('• None detected in sample');
      }
      doc.moveDown(0.6);

      // ── Findings ──
      doc.fontSize(13).fillColor('#0F172A').text('10 findings & next-30-days actions');
      doc.moveDown(0.2);
      doc.fontSize(9.5).fillColor('#0F172A');
      (findings || []).slice(0, 10).forEach((f, i) => {
        doc.fillColor('#0F172A').text(`${i + 1}. ${f.title || 'Finding'}`, { continued: false });
        doc.fillColor('#334155').text(`   Diagnosis: ${f.diagnosis || ''}`);
        doc.fillColor('#0369A1').text(`   Action: ${f.action || ''}`);
        doc.moveDown(0.25);
      });

      // ── Footer ──
      doc.fontSize(8).fillColor('#64748B').text(
        'Want Grid Social to implement these for you? Reply to this email or visit gridsocial.co.uk.',
        48, 800, { width: 500, align: 'center' }
      );

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}
