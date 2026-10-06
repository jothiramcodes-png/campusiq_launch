import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import apiRouter from './routes/api';
import { initDatabase, isDbConnected } from './config/db';
import { initSqlite, isSqliteActive, syncVideosBetweenDatabases } from './config/sqlite';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Security & Parsing Middleware
const configuredOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim())
  : [];
const defaultOrigins = ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'];
if (process.env.FRONTEND_URL) {
  configuredOrigins.push(process.env.FRONTEND_URL.trim());
}

app.use(cors({
  origin: (origin, callback) => {
    // allow requests with no origin (like mobile apps, curl, Postman, server-to-server)
    if (!origin) return callback(null, true);
    if (
      configuredOrigins.includes('*') ||
      defaultOrigins.includes(origin) ||
      configuredOrigins.includes(origin) ||
      origin.endsWith('.vercel.app') ||
      origin.endsWith('.onrender.com') ||
      origin.endsWith('.railway.app')
    ) {
      return callback(null, origin);
    }
    return callback(null, origin);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve uploaded video and material files statically
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health Check
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'online',
    service: 'CAMPUSIQ Institutional Backend',
    college: 'Nadar Saraswathi College of Engineering & Technology (NSCET Theni)',
    timestamp: new Date().toISOString(),
    database: isDbConnected ? 'MySQL (Connected)' : 'MySQL (In-Memory Fallback)',
    sqlite: isSqliteActive() ? 'SQLite (Active: campusiq.sqlite)' : 'SQLite (Inactive)',
    storage: {
      mysql: isDbConnected,
      sqlite: isSqliteActive(),
    },
  });
});

// API Routes
app.use('/api', apiRouter);

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[CAMPUSIQ Server Error]:', err);
  res.status(500).json({
    error: 'Internal Institutional Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Start Server
app.listen(PORT, async () => {
  console.log(`=======================================================`);
  console.log(` CAMPUSIQ Backend Server Active`);
  console.log(` College: NSCET Theni District, Tamil Nadu`);
  console.log(` Port: ${PORT}`);
  console.log(` Health: http://localhost:${PORT}/health`);
  console.log(` API Base: http://localhost:${PORT}/api`);
  console.log(` Databases: Dual Persistence [MySQL + SQLite]`);
  console.log(`=======================================================`);
  
  // Initialize SQLite database
  initSqlite();

  // Test and initialize MySQL tables
  await initDatabase();

  // Sync existing records between MySQL and SQLite
  await syncVideosBetweenDatabases();
});

export default app;

