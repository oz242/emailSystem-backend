import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import adminUserRoutes from './routes/adminUserRoutes.js';
import authRoutes from './routes/authRoutes.js';
import emailRoutes from './routes/emailRoutes.js';
import smtpRoutes from './routes/smtpRoutes.js';
import { requireAuth } from './middleware/auth.js';
import { generalLimiter } from './middleware/rateLimiter.js';
import { connectMongo } from './utils/db.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 5000;

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is required. Add it to backend/.env before starting the server.');
  process.exit(1);
}

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/api', generalLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminUserRoutes);
app.use('/api/smtp', requireAuth, smtpRoutes);
app.use('/api', requireAuth, emailRoutes);

app.use('/uploads', requireAuth, express.static(path.join(__dirname, 'uploads')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

connectMongo()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Bulk Email Sender Backend running on http://localhost:${PORT}`);
      console.log(`Data directory: ${path.join(__dirname, 'data')}`);
      console.log(`Uploads directory: ${path.join(__dirname, 'uploads')}`);
      console.log('MongoDB connected');
    });
  })
  .catch((error) => {
    console.error('Failed to connect to MongoDB:', error);
    process.exit(1);
  });

export default app;
