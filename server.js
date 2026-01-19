// server.js
import express from 'express';
import morgan from 'morgan';

const app = express();
app.use(morgan('combined'));

// Accept raw text bodies only
app.use(express.text({ type: '*/*' }));

// In-memory store of events
const events = [];
const clients = []; // SSE clients
const MAX_EVENTS = 1000;

// Health check
app.get('/health', (req, res) => res.status(200).send({ status: 'ok' }));

// POST endpoint to receive raw messages
app.post('/api/events', (req, res) => {
  const rawMessage = req.body;
  if (!rawMessage || typeof rawMessage !== 'string') {
    return res.status(400).json({ status: 'error', message: 'No raw string received' });
  }

  console.log('RAW EVENT:', rawMessage);

  const event = { rawMessage, timestamp: Date.now() };
  events.push(event);
  if (events.length > MAX_EVENTS) events.shift(); // keep size bounded

  // Push to all connected SSE clients
  clients.forEach(client => client.res.write(`data: ${JSON.stringify(event)}\n\n`));

  return res.status(200).json({ status: 'ok' });
});

// SSE stream endpoint
app.get('/api/events/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send a welcome event
  res.write(`data: ${JSON.stringify({ message: 'Connected to SSE stream' })}\n\n`);

  // Track client
  const client = { res };
  clients.push(client);

  // Remove client on disconnect
  req.on('close', () => {
    clients.splice(clients.indexOf(client), 1);
  });
});

// Optional: fetch recent events
app.get('/api/events/all', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), MAX_EVENTS);
  res.json(events.slice(-limit));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));

