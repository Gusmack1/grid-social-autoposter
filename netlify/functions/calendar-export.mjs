// iCal Calendar Export — returns .ics file with queued/scheduled posts
import { db } from './lib/db/index.mjs';
import { json } from './lib/http.mjs';
import { verifyJWT } from './lib/crypto/jwt.mjs';
import { logger } from './lib/logger.mjs';

function escapeICalText(text) {
  if (!text) return '';
  return text.replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\;').replace(/\\/g, '\\\\');
}

function formatICalDateTime(date) {
  // Returns format: 20260325T090000Z
  const d = new Date(date);
  return d.getUTCFullYear() +
    String(d.getUTCMonth() + 1).padStart(2, '0') +
    String(d.getUTCDate()).padStart(2, '0') + 'T' +
    String(d.getUTCHours()).padStart(2, '0') +
    String(d.getUTCMinutes()).padStart(2, '0') +
    String(d.getUTCSeconds()).padStart(2, '0') + 'Z';
}

function generateICalFile(clientName, posts) {
  let ical = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Grid Social//Auto-Poster//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:${escapeICalText(clientName)} - Social Media Queue
X-WR-TIMEZONE:UTC
BEGIN:VTIMEZONE
TZID:UTC
BEGIN:STANDARD
DTSTART:19700101T000000Z
TZOFFSETFROM:+0000
TZOFFSETTO:+0000
END:STANDARD
END:VTIMEZONE
`;

  for (const post of posts) {
    if (!post.scheduledFor) continue; // Skip if no scheduled time

    const postDate = new Date(post.scheduledFor);
    const endDate = new Date(postDate.getTime() + 3600 * 1000); // 1 hour duration
    
    const summary = escapeICalText(post.caption.substring(0, 100));
    const description = escapeICalText(post.caption);
    const platforms = post.platforms ? post.platforms.join(', ') : '';
    const fullDescription = `Platforms: ${platforms}${platforms ? '\\n' : ''}${description}`;

    ical += `BEGIN:VEVENT
UID:${post.id}@gridsocial.co.uk
DTSTAMP:${formatICalDateTime(new Date())}
DTSTART:${formatICalDateTime(postDate)}
DTEND:${formatICalDateTime(endDate)}
SUMMARY:${summary}
DESCRIPTION:${fullDescription}
STATUS:${post.status === 'published' ? 'CONFIRMED' : 'TENTATIVE'}
END:VEVENT
`;
  }

  ical += `END:VCALENDAR`;
  return ical;
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' } });

  // Auth check
  const adminKey = process.env.ADMIN_KEY;
  const jwtSecret = process.env.JWT_SECRET || 'gridsocial-jwt-secret-2026';
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');

  if (!token) return json({ error: 'Unauthorised' }, 401);

  let isAuthed = false;
  if (token === adminKey) isAuthed = true;
  else {
    const payload = await verifyJWT(token, jwtSecret);
    if (payload) isAuthed = true;
  }
  if (!isAuthed) return json({ error: 'Unauthorised' }, 401);

  const url = new URL(req.url);
  const clientId = url.searchParams.get('clientId');
  if (!clientId) return json({ error: 'clientId required' }, 400);

  const clients = await db.getClients();
  const client = clients.find(c => c.id === clientId);
  if (!client) return json({ error: 'Client not found' }, 404);

  const allPosts = await db.getPosts(clientId);
  const queuedScheduled = allPosts.filter(p => p.status === 'queued' || p.status === 'scheduled' || p.status === 'published');

  const icalContent = generateICalFile(client.name, queuedScheduled);

  return new Response(icalContent, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${client.name.replace(/[^a-z0-9]/gi, '_')}_queue.ics"`,
      'Access-Control-Allow-Origin': '*',
    },
  });
};
