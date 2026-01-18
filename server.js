// server.js
import express from 'express';
import morgan from 'morgan';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(morgan('combined'));

// Health check
app.get('/health', (req, res) => res.status(200).send({ status: 'ok' }));

// Events endpoint — matches API_PATH "/api/events"
app.post('/api/events', (req, res) => {
  const event = req.body;
  if (!event || typeof event !== 'object') {
    return res.status(400).json({ status: 'error', message: 'Invalid JSON' });
  }

  // Basic validation
  const { event_code, timestamp, device_id } = event;
  if (!event_code || !timestamp || !device_id) {
    return res.status(422).json({ status: 'error', message: 'Missing required fields' });
  }

  // For now, log to console (Render captures logs)
  console.log('EVENT:', JSON.stringify(event));

  // TODO: Save to DB later
  return res.status(200).json({ status: 'ok' });
});

const PORT = process.env.PORT || 10000; // Render assigns PORT
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
