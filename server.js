// server.js
import express from 'express';
import morgan from 'morgan';
import cors from 'cors';

const app = express();

// 1. Broad CORS configuration
app.use(cors({
  origin: '*', // For production, replace with your actual frontend URL
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

app.use(morgan('combined'));
app.use(express.text({ type: '*/*' }));

const events = [];
const MAX_EVENTS = 1000;
const clients = new Set();

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

app.post('/api/events', (req, res) => {
  const rawMessage = (req.body || '').trim();
  if (!rawMessage || typeof rawMessage !== 'string') {
    return res.status(400).json({ status: 'error', message: 'No raw string received' });
  }

  console.log('RAW EVENT RECEIVED:', rawMessage);

  let parsed = null;
  if (/^\d{10}$/.test(rawMessage)) {
    const siteId = rawMessage.substring(0, 4);
    const msgCode = rawMessage.substring(4, 6);
    const batonBattery = parseInt(rawMessage.substring(6, 8), 10);
    const mainBattery = parseInt(rawMessage.substring(8, 10), 10);

    let messageType = 'Unknown';
    let severity = 'info';

    switch (msgCode) {
      case '01': messageType = 'Panic'; severity = 'critical'; break;
      case '02': messageType = 'Patrol Fail'; severity = 'warning'; break;
      case '03': messageType = 'Patrol Start'; severity = 'info'; break;
      case '04': messageType = 'Fire'; severity = 'critical'; break;
      case '05': messageType = 'Medical'; severity = 'warning'; break;
      case '06': messageType = 'Patrol Complete'; severity = 'success'; break;
      default:   messageType = `Unknown (${msgCode})`;
    }

    parsed = {
      siteId,
      messageType,
      severity,
      batonBattery,
      mainBattery,
      description: `${messageType} from site ${siteId} — Batteries: ${batonBattery}% / ${mainBattery}%`
    };
  }

  const eventObject = {
    event: rawMessage,
    timestamp: Date.now(),
    parsed,
    isValid: !!parsed
  };

  events.unshift(eventObject);
  if (events.length > MAX_EVENTS) events.pop();

  const eventJson = JSON.stringify(eventObject);
  for (const client of clients) {
    try {
      client.write(`data: ${eventJson}\n\n`);
    } catch (err) {
      clients.delete(client);
    }
  }

  res.status(200).json({ status: 'ok' });
});

app.get('/api/events/stream', (req, res) => {
  // 2. Extra explicit headers for SSE stability on Render
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Access-Control-Allow-Origin', '*'); // Forces CORS for the stream
  
  res.flushHeaders();

  // Keep-alive/Welcome
  const welcomeData = JSON.stringify({ message: 'Connected' });
  res.write(`data: ${welcomeData}\n\n`);

  clients.add(res);
  console.log(`Client connected. Total: ${clients.size}`);

  const heartbeat = setInterval(() => {
    // Standard SSE comment format for heartbeat (starts with :)
    if (res.writableEnded) return;
    res.write(': heartbeat\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(res);
    console.log('Client disconnected');
  });
});

app.get('/api/events/all', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), MAX_EVENTS);
  res.json(events.slice(0, limit));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Control Room Server Live on port ${PORT}`));