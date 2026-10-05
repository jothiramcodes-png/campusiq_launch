import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

export let isDbConnected = false;

export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'campusiq_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

let reconnectTimer: NodeJS.Timeout | null = null;

export const initDatabase = async (): Promise<boolean> => {
  try {
    const connection = await pool.getConnection();
    isDbConnected = true;
    if (reconnectTimer) {
      clearInterval(reconnectTimer);
      reconnectTimer = null;
    }
    console.log('✅ [MySQL] Successfully connected to MySQL database: ' + (process.env.DB_NAME || 'campusiq_db'));
    
    // Ensure videos table exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS videos (
        id VARCHAR(50) PRIMARY KEY,
        youtube_id VARCHAR(50) DEFAULT '',
        local_video_path VARCHAR(500),
        title VARCHAR(255) NOT NULL,
        topic VARCHAR(255) NOT NULL,
        faculty_name VARCHAR(255) NOT NULL,
        department_code VARCHAR(20) NOT NULL,
        academic_year VARCHAR(20) NOT NULL,
        thumbnail_url TEXT,
        study_material_url TEXT,
        description TEXT,
        duration_seconds INT DEFAULT 120,
        semester INT DEFAULT 1,
        subject_code VARCHAR(50) DEFAULT 'GEN',
        subject_title VARCHAR(255) DEFAULT 'General Engineering',
        unit_number INT DEFAULT 1,
        tags JSON,
        transcript JSON,
        view_count INT DEFAULT 0,
        published_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Ensure users table exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(100) PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        role ENUM('STUDENT','FACULTY','HOD','ADMIN','SUPER_ADMIN','APPLICANT') NOT NULL DEFAULT 'STUDENT',
        department_id VARCHAR(50) DEFAULT 'dept_cse',
        department_name VARCHAR(255) DEFAULT 'Computer Science & Engineering',
        student_id VARCHAR(50) DEFAULT NULL,
        faculty_id VARCHAR(50) DEFAULT NULL,
        program VARCHAR(255) DEFAULT 'B.E. Computer Science & Engineering',
        semester INT DEFAULT 5,
        batch VARCHAR(50) DEFAULT '2022-2026',
        avatar_url TEXT DEFAULT NULL,
        phone VARCHAR(50) DEFAULT NULL,
        student_type VARCHAR(50) DEFAULT 'Day Scholar',
        bus_route VARCHAR(255) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Auto-seeding disabled to ensure user deletions in phpMyAdmin are permanently respected

    connection.release();
    return true;
  } catch (err: any) {
    isDbConnected = false;
    console.warn(`⚠️ [MySQL] Note: Could not connect to MySQL at ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 3306} (${err.message}). Using in-memory store for fallback.`);
    
    // Auto-retry in background every 5 seconds until connected
    if (!reconnectTimer) {
      reconnectTimer = setInterval(async () => {
        const ok = await initDatabase();
        if (ok && reconnectTimer) {
          clearInterval(reconnectTimer);
          reconnectTimer = null;
        }
      }, 5000);
    }
    return false;
  }
};

export const ensureDbConnection = async (): Promise<boolean> => {
  if (isDbConnected) return true;
  return await initDatabase();
};

export const query = async (text: string, params?: any[]) => {
  const start = Date.now();
  const [rows, fields] = await pool.query(text, params);
  const duration = Date.now() - start;
  
  if (process.env.NODE_ENV === 'development') {
    console.log('[DB Query]', { 
      text: text.slice(0, 100), 
      duration, 
      rowsCount: Array.isArray(rows) ? rows.length : 0 
    });
  }
  
  return { rows, fields };
};

