// server.js
import express from 'express';
import morgan from 'morgan';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(morgan('combined'));

// Health check
app.get('/health', (req, res) => res.status(200).send({ status: 'ok' }));

// Accept raw text bodies
app.use(express.text({ type: '*/*' }));

app.post('/api/events', (req, res) => {
  const rawMessage = req.body; // e.g. "00240498861345"

  if (!rawMessage || typeof rawMessage !== 'string') {
    return res.status(400).json({ status: 'error', message: 'No raw string received' });
  }

  console.log('RAW EVENT:', rawMessage);

  // Later you can save rawMessage to a database or file
  return res.status(200).json({ status: 'ok' });
});


const PORT = process.env.PORT || 10000; // Render assigns PORT
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
