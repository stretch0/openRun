// A pretend intervals.icu for the e2e tests: one athlete with one run from
// a Garmin watch yesterday, served as a GPX file. Any key but "wrong" works.
import { createServer } from 'node:http';

const port = Number(process.env.PORT ?? 3109);
const start = new Date(Date.now() - 86_400_000);
start.setUTCHours(7, 0, 0, 0);

function gpx() {
  const points = Array.from({ length: 601 }, (_, i) => {
    const time = new Date(start.getTime() + i * 1000).toISOString();
    return `<trkpt lat="${(51.5 + i * 0.00003).toFixed(6)}" lon="-0.100000"><time>${time}</time></trkpt>`;
  }).join('');
  return `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><type>running</type><trkseg>${points}</trkseg></trk></gpx>`;
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);
  const auth = req.headers.authorization ?? '';
  const key = Buffer.from(auth.replace(/^Basic /, ''), 'base64')
    .toString()
    .replace(/^API_KEY:/, '');
  const json = (body) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (url.pathname === '/health') return json({ ok: true });
  if (!key || key === 'wrong-key') {
    res.writeHead(401);
    return res.end();
  }
  if (url.pathname === '/api/v1/athlete/0') {
    return json({ id: 'i4242', name: 'Test Runner' });
  }
  if (url.pathname === '/api/v1/athlete/0/activities') {
    return json([
      {
        id: 'i9001',
        start_date: start.toISOString(),
        type: 'Run',
        name: 'Towpath tempo',
        source: 'GARMIN_CONNECT',
        file_type: 'gpx',
        device_name: 'Forerunner 265',
      },
    ]);
  }
  if (url.pathname === '/api/v1/activity/i9001/file') {
    res.writeHead(200, { 'content-type': 'application/gpx+xml' });
    return res.end(gpx());
  }
  res.writeHead(404);
  res.end();
}).listen(port);
