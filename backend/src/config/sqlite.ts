import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { pool, isDbConnected } from './db';

dotenv.config();

let sqliteDb: DatabaseSync | null = null;
let isSqliteReady = false;

const defaultDbPath = path.join(__dirname, '../../data/campusiq.sqlite');
const dbFilePath = process.env.SQLITE_DB_PATH || defaultDbPath;

export const initSqlite = (): boolean => {
  try {
    const dir = path.dirname(dbFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    sqliteDb = new DatabaseSync(dbFilePath);
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS videos (
        id TEXT PRIMARY KEY,
        youtube_id TEXT DEFAULT '',
        local_video_path TEXT,
        title TEXT NOT NULL,
        topic TEXT NOT NULL,
        faculty_name TEXT NOT NULL,
        department_code TEXT NOT NULL,
        academic_year TEXT NOT NULL,
        thumbnail_url TEXT,
        study_material_url TEXT,
        description TEXT,
        duration_seconds INTEGER DEFAULT 120,
        semester INTEGER DEFAULT 1,
        subject_code TEXT DEFAULT 'GEN',
        subject_title TEXT DEFAULT 'General Engineering',
        unit_number INTEGER DEFAULT 1,
        tags TEXT,
        transcript TEXT,
        view_count INTEGER DEFAULT 0,
        published_date TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_videos_dept ON videos (department_code);
      CREATE INDEX IF NOT EXISTS idx_videos_sem ON videos (semester);
    `);

    isSqliteReady = true;
    console.log(`✅ [SQLite] Database initialized at: ${dbFilePath}`);

    // Auto-seed if database has 0 videos
    try {
      const countRow: any = sqliteDb.prepare('SELECT COUNT(*) as count FROM videos').get();
      if (!countRow || countRow.count === 0) {
        const candidatePaths = [
          path.join(__dirname, '../data/seedVideos.json'),
          path.join(__dirname, '../../src/data/seedVideos.json'),
          path.join(__dirname, '../../data/seedVideos.json'),
          path.join(process.cwd(), 'src/data/seedVideos.json'),
          path.join(process.cwd(), 'dist/data/seedVideos.json'),
          path.join(process.cwd(), 'backend/src/data/seedVideos.json'),
        ];
        const seedPath = candidatePaths.find((p) => fs.existsSync(p));
        if (seedPath) {
          const rawSeed = fs.readFileSync(seedPath, 'utf8');
          const seedVideos = JSON.parse(rawSeed);
          if (Array.isArray(seedVideos) && seedVideos.length > 0) {
            for (const v of seedVideos) {
              saveVideoToSqlite(v);
            }
            console.log(`✅ [SQLite] Auto-seeded ${seedVideos.length} initial videos from ${seedPath}`);
          }
        } else {
          console.warn('⚠️ [SQLite] No seedVideos.json found in candidate paths.');
        }
      }
    } catch (seedErr: any) {
      console.warn('⚠️ [SQLite] Auto-seed check failed:', seedErr.message);
    }

    return true;
  } catch (err: any) {
    console.error('⚠️ [SQLite] Failed to initialize SQLite database:', err.message);
    isSqliteReady = false;
    return false;
  }
};

export const getSqliteDb = (): DatabaseSync | null => {
  if (!sqliteDb && !isSqliteReady) {
    initSqlite();
  }
  return sqliteDb;
};

export const isSqliteActive = (): boolean => {
  return isSqliteReady && sqliteDb !== null;
};

/**
 * Insert or replace a video entry in SQLite.
 * Accepts either camelCase or snake_case video objects.
 */
export const saveVideoToSqlite = (video: any): boolean => {
  try {
    const db = getSqliteDb();
    if (!db) return false;

    const id = String(video.id);
    const youtubeId = String(video.youtubeId || video.youtube_id || '');
    const localVideoPath = (video.localVideoPath || video.local_video_path) ? String(video.localVideoPath || video.local_video_path) : null;
    const title = String(video.title || video.topicName || video.topic || 'Untitled Lecture');
    const topic = String(video.topic || video.topicName || title);
    const facultyName = String(video.facultyName || video.faculty_name || video.presentedBy || 'Faculty Member');
    const departmentCode = String(video.departmentCode || video.department_code || video.department || 'CSE');
    const academicYear = String(video.academicYear || video.academic_year || video.year || '2024-25');
    const thumbnailUrl = (video.thumbnailUrl || video.thumbnail_url) ? String(video.thumbnailUrl || video.thumbnail_url) : 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800';
    const studyMaterialUrl = (video.studyMaterialUrl || video.study_material_url) ? String(video.studyMaterialUrl || video.study_material_url) : null;
    const description = String(video.description || '');
    const durationSeconds = Number(video.durationSeconds || video.duration_seconds || 120);
    const semester = Number(video.semester || 1);
    const subjectCode = String(video.subjectCode || video.subject_code || 'GEN');
    const subjectTitle = String(video.subjectTitle || video.subject_title || 'General Engineering');
    const unitNumber = Number(video.unitNumber || video.unit_number || 1);
    const viewCount = Number(video.viewCount || video.view_count || 0);

    const rawPubDate = video.publishedDate || video.published_date;
    const publishedDate = rawPubDate instanceof Date 
      ? rawPubDate.toISOString().split('T')[0]
      : (rawPubDate ? String(rawPubDate).split('T')[0] : new Date().toISOString().split('T')[0]);

    let tagsStr: string | null = null;
    if (video.tags) {
      tagsStr = typeof video.tags === 'string' ? video.tags : JSON.stringify(video.tags);
    } else {
      tagsStr = JSON.stringify([departmentCode || 'Engineering', 'Lecture']);
    }

    let transcriptStr: string | null = null;
    if (video.transcript) {
      transcriptStr = typeof video.transcript === 'string' ? video.transcript : JSON.stringify(video.transcript);
    }

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO videos (
        id, youtube_id, local_video_path, title, topic, faculty_name,
        department_code, academic_year, thumbnail_url, study_material_url,
        description, duration_seconds, semester, subject_code, subject_title,
        unit_number, tags, transcript, view_count, published_date
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?
      )
    `);

    stmt.run(
      id, youtubeId, localVideoPath, title, topic, facultyName,
      departmentCode, academicYear, thumbnailUrl, studyMaterialUrl,
      description, durationSeconds, semester, subjectCode, subjectTitle,
      unitNumber, tagsStr, transcriptStr, viewCount, publishedDate
    );

    console.log(`✅ [SQLite] Video stored in SQLite (${id}): "${title}"`);
    return true;
  } catch (err: any) {
    console.error('⚠️ [SQLite] Error saving video:', err.message);
    return false;
  }
};

/**
 * Update an existing video record in SQLite.
 */
export const updateVideoInSqlite = (id: string, updates: any): boolean => {
  try {
    const db = getSqliteDb();
    if (!db) return false;

    const current: any = db.prepare('SELECT * FROM videos WHERE id = ?').get(id);
    if (!current) {
      // If not present in SQLite, insert fresh
      return saveVideoToSqlite({ id, ...updates });
    }

    const title = updates.title || updates.topicName || current.title;
    const topic = updates.topic || updates.topicName || current.topic;
    const facultyName = updates.facultyName || updates.faculty_name || updates.presentedBy || current.faculty_name;
    const departmentCode = updates.departmentCode || updates.department_code || updates.department || current.department_code;
    const academicYear = updates.academicYear || updates.academic_year || updates.year || current.academic_year;
    const description = updates.description !== undefined ? updates.description : current.description;
    const localVideoPath = updates.localVideoPath || updates.local_video_path || current.local_video_path;
    const thumbnailUrl = updates.thumbnailUrl || updates.thumbnail_url || current.thumbnail_url;
    const studyMaterialUrl = updates.studyMaterialUrl !== undefined ? updates.studyMaterialUrl : current.study_material_url;
    const durationSeconds = updates.durationSeconds ? Number(updates.durationSeconds) : current.duration_seconds;
    
    let transcriptStr = current.transcript;
    if (updates.transcript) {
      transcriptStr = typeof updates.transcript === 'string' ? updates.transcript : JSON.stringify(updates.transcript);
    }

    const stmt = db.prepare(`
      UPDATE videos SET
        title = ?,
        topic = ?,
        faculty_name = ?,
        department_code = ?,
        academic_year = ?,
        description = ?,
        local_video_path = ?,
        thumbnail_url = ?,
        study_material_url = ?,
        duration_seconds = ?,
        transcript = ?
      WHERE id = ?
    `);

    stmt.run(
      String(title),
      String(topic),
      String(facultyName),
      String(departmentCode),
      String(academicYear),
      String(description || ''),
      localVideoPath ? String(localVideoPath) : null,
      thumbnailUrl ? String(thumbnailUrl) : null,
      studyMaterialUrl ? String(studyMaterialUrl) : null,
      Number(durationSeconds || 120),
      transcriptStr ? String(transcriptStr) : null,
      String(id)
    );

    console.log(`✅ [SQLite] Video updated in SQLite (${id})`);
    return true;
  } catch (err: any) {
    console.error(`⚠️ [SQLite] Error updating video (${id}):`, err.message);
    return false;
  }
};

/**
 * Delete a video from SQLite.
 */
export const deleteVideoFromSqlite = (id: string): boolean => {
  try {
    const db = getSqliteDb();
    if (!db) return false;

    const stmt = db.prepare('DELETE FROM videos WHERE id = ?');
    stmt.run(id);
    console.log(`✅ [SQLite] Video deleted from SQLite (${id})`);
    return true;
  } catch (err: any) {
    console.error(`⚠️ [SQLite] Error deleting video (${id}):`, err.message);
    return false;
  }
};

/**
 * Increment view count for a video in SQLite.
 */
export const incrementViewCountInSqlite = (id: string): number => {
  try {
    const db = getSqliteDb();
    if (!db) return 0;

    db.prepare('UPDATE videos SET view_count = view_count + 1 WHERE id = ?').run(id);
    const row: any = db.prepare('SELECT view_count FROM videos WHERE id = ?').get(id);
    return row?.view_count || 1;
  } catch (err: any) {
    console.error(`⚠️ [SQLite] Error incrementing views (${id}):`, err.message);
    return 0;
  }
};

/**
 * Format raw SQLite row to API video format.
 */
const formatSqliteRow = (r: any) => ({
  id: r.id,
  youtubeId: r.youtube_id || '',
  localVideoPath: r.local_video_path || undefined,
  title: r.title,
  topic: r.topic,
  facultyName: r.faculty_name,
  departmentCode: r.department_code,
  academicYear: r.academic_year,
  thumbnailUrl: r.thumbnail_url,
  studyMaterialUrl: r.study_material_url || undefined,
  description: r.description,
  durationSeconds: r.duration_seconds || 120,
  semester: r.semester,
  subjectCode: r.subject_code,
  subjectTitle: r.subject_title,
  unitNumber: r.unit_number,
  viewCount: r.view_count || 0,
  publishedDate: r.published_date,
  tags: r.tags ? (typeof r.tags === 'string' ? JSON.parse(r.tags) : r.tags) : ['Engineering', 'Lecture'],
  transcript: r.transcript ? (typeof r.transcript === 'string' ? JSON.parse(r.transcript) : r.transcript) : undefined,
});

/**
 * Query all videos from SQLite with optional filters.
 */
export const getVideosFromSqlite = (filters?: {
  department?: string;
  semester?: number;
  unit?: number;
  search?: string;
}): any[] => {
  try {
    const db = getSqliteDb();
    if (!db) return [];

    let queryStr = 'SELECT * FROM videos WHERE 1=1';
    const params: any[] = [];

    if (filters?.department && filters.department !== 'ALL') {
      queryStr += ' AND department_code = ?';
      params.push(filters.department);
    }
    if (filters?.semester && filters.semester !== ('ALL' as any)) {
      queryStr += ' AND semester = ?';
      params.push(Number(filters.semester));
    }
    if (filters?.unit && filters.unit !== ('ALL' as any)) {
      queryStr += ' AND unit_number = ?';
      params.push(Number(filters.unit));
    }
    if (filters?.search && typeof filters.search === 'string') {
      queryStr += ' AND (LOWER(title) LIKE ? OR LOWER(topic) LIKE ? OR LOWER(faculty_name) LIKE ?)';
      const p = `%${filters.search.toLowerCase()}%`;
      params.push(p, p, p);
    }

    queryStr += ' ORDER BY created_at DESC';
    const rows = db.prepare(queryStr).all(...params);
    return rows.map(formatSqliteRow);
  } catch (err: any) {
    console.error('⚠️ [SQLite] Error querying videos:', err.message);
    return [];
  }
};

/**
 * Fetch a single video by ID from SQLite.
 */
export const getVideoByIdFromSqlite = (id: string): any | null => {
  try {
    const db = getSqliteDb();
    if (!db) return null;

    const row: any = db.prepare('SELECT * FROM videos WHERE id = ?').get(id);
    if (!row) return null;
    return formatSqliteRow(row);
  } catch (err: any) {
    console.error(`⚠️ [SQLite] Error getting video by ID (${id}):`, err.message);
    return null;
  }
};

/**
 * Bidirectional Sync: Keep MySQL and SQLite synchronized on startup.
 */
export const syncVideosBetweenDatabases = async (): Promise<void> => {
  try {
    if (!isDbConnected) return;
    const db = getSqliteDb();
    if (!db) return;

    // 1. Sync from MySQL to SQLite
    const [mysqlRows]: any = await pool.query('SELECT * FROM videos');
    if (Array.isArray(mysqlRows) && mysqlRows.length > 0) {
      for (const row of mysqlRows) {
        saveVideoToSqlite(row);
      }
      console.log(`✅ [SQLite] Synced ${mysqlRows.length} existing video(s) from MySQL into SQLite.`);
    }

    // 2. Sync from SQLite to MySQL (if MySQL has missing rows that SQLite possesses)
    const sqliteRows: any[] = db.prepare('SELECT * FROM videos').all();
    if (sqliteRows && sqliteRows.length > 0) {
      for (const sRow of sqliteRows) {
        const [existing]: any = await pool.query('SELECT id FROM videos WHERE id = ?', [sRow.id]);
        if (!existing || existing.length === 0) {
          await pool.query(`
            INSERT INTO videos (
              id, youtube_id, local_video_path, title, topic, faculty_name,
              department_code, academic_year, thumbnail_url, study_material_url,
              description, duration_seconds, semester, subject_code, subject_title,
              unit_number, tags, transcript, view_count, published_date
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            sRow.id,
            sRow.youtube_id || '',
            sRow.local_video_path || null,
            sRow.title,
            sRow.topic,
            sRow.faculty_name,
            sRow.department_code,
            sRow.academic_year,
            sRow.thumbnail_url,
            sRow.study_material_url || null,
            sRow.description,
            sRow.duration_seconds || 120,
            sRow.semester || 1,
            sRow.subject_code || 'GEN',
            sRow.subject_title || 'General Engineering',
            sRow.unit_number || 1,
            sRow.tags || null,
            sRow.transcript || null,
            sRow.view_count || 0,
            sRow.published_date || null
          ]);
          console.log(`✅ [MySQL] Synced video from SQLite into MySQL: ${sRow.id} ("${sRow.title}")`);
        }
      }
    }
  } catch (err: any) {
    console.error('⚠️ [Sync] Error syncing videos between MySQL and SQLite:', err.message);
  }
};
