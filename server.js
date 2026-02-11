// server.js
import express from 'express';
import morgan from 'morgan';
import cors from 'cors';

const app = express();

// 1. Broad CORS configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

app.use(morgan('combined'));
app.use(express.text({ type: '*/*' }));

const events = [];
const MAX_EVENTS = 1000;
const clients = new Set();

// Helper to notify all dashboards of system changes (like connection counts)
const broadcastStatus = () => {
  const statusUpdate = JSON.stringify({ 
    type: 'SYSTEM_STATUS', 
    count: clients.size 
  });
  for (const client of clients) {
    try {
      client.write(`data: ${statusUpdate}\n\n`);
      if (typeof client.flush === 'function') client.flush();
    } catch (err) {
      clients.delete(client);
    }
  }
};

/**
 * Common logic: parse message, store event, broadcast to SSE clients
 * @param {string} rawMessage 
 * @param {string} source - 'hookdeck', 'direct', etc.
 */
function processIncomingMessage(rawMessage, source = 'unknown') {
  console.log(`[${source.toUpperCase()}] Received: "${rawMessage}"`);

  let parsed = null;

  // Regex check for exactly 10 digits
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
    isValid: !!parsed,
    source,           // ← helps debugging & future analytics
  };

  events.unshift(eventObject);
  if (events.length > MAX_EVENTS) events.pop();

  const eventJson = JSON.stringify(eventObject);

  // Broadcast to all connected SSE clients
  for (const client of clients) {
    try {
      client.write(`data: ${eventJson}\n\n`);
      if (typeof client.flush === 'function') client.flush();
    } catch (err) {
      clients.delete(client);
    }
  }
}

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// ────────────────────────────────────────────────
//  Deprecated legacy endpoint – still works but logs warning
// ────────────────────────────────────────────────
app.post('/api/events', (req, res) => {
  console.warn('Warning: Using deprecated endpoint /api/events – please update to /hookdeck or /direct');
  const rawMessage = (req.body || '').toString().trim();
  
  if (!rawMessage) {
    return res.status(400).json({ status: 'error', message: 'No raw string received' });
  }

  processIncomingMessage(rawMessage, 'legacy');
  res.status(200).json({ status: 'ok' });
});

// ────────────────────────────────────────────────
//  For SIM800L → Hookdeck → server
// ────────────────────────────────────────────────
app.post('/api/events/hookdeck', (req, res) => {
  const rawMessage = (req.body || '').toString().trim();

  if (!rawMessage) {
    return res.status(400).json({ error: 'No message received' });
  }

  processIncomingMessage(rawMessage, 'hookdeck');
  res.status(200).json({ status: 'received' });
});

// ────────────────────────────────────────────────
//  For A7670E → direct to server
// ────────────────────────────────────────────────
app.post('/api/events/direct', (req, res) => {
  const rawMessage = (req.body || '').toString().trim();

  if (!rawMessage) {
    return res.status(400).json({ error: 'No message received' });
  }

  processIncomingMessage(rawMessage, 'direct');
  res.status(200).json({ status: 'received' });
});

app.get('/api/events/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  
  res.flushHeaders();

  // Welcome message
  const welcomeData = JSON.stringify({ message: 'Connected', type: 'SYSTEM_WELCOME' });
  res.write(`data: ${welcomeData}\n\n`);
  if (typeof res.flush === 'function') res.flush();

  clients.add(res);
  console.log(`Client connected. Total: ${clients.size}`);
  
  // Trigger a status update
  broadcastStatus();

  const heartbeat = setInterval(() => {
    if (res.writableEnded) return;
    res.write(': heartbeat\n\n');
    if (typeof res.flush === 'function') res.flush();
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(res);
    console.log('Client disconnected');
    broadcastStatus();
  });
});

app.get('/api/events/all', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), MAX_EVENTS);
  res.json(events.slice(0, limit));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Control Room Server Live on port ${PORT}`));