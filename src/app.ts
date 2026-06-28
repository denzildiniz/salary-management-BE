import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import apiRoutes from './routes';
import { errorHandler } from './middleware/errorHandler';

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const mutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many write requests, please try again later.' },
});

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type'],
  }));
  app.use(generalLimiter);

  app.use(express.json({ limit: '10mb' }));
  app.use(express.text({ type: 'text/csv', limit: '10mb' }));

  // Stricter rate limit on state-changing endpoints
  app.use('/api/employees/import', mutationLimiter);
  app.use('/api/employees/bulk-raise', mutationLimiter);

  app.use('/api', apiRoutes);

  // Global error handler — must be registered after routes
  app.use(errorHandler);

  return app;
}
