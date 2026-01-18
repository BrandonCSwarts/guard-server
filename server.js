// server.js
import express from 'express';
import morgan from 'morgan';

const app = express();
app.use(morgan('combined'));

// Accept raw text bodies only
app.use(express.text({ type: '*/*' }));

// Health check
app.get('/health', (req, res) => res.status(200).send({ status: 'ok' }));

// Events endpoint
app.post('/api/events', (req, res) => {
  const rawMessage = req.body; // e.g. "00240498861345"

  if (!rawMessage || typeof rawMessage !== 'string') {
    return res.status(400).json({ status: 'error', message: 'No raw string received' });
  }

  console.log('RAW EVENT:', rawMessage);

  return res.status(200).json({ status: 'ok' });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
