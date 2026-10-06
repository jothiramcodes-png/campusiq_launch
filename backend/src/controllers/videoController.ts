import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { pool, isDbConnected, ensureDbConnection } from '../config/db';
import { extract1sThumbnail } from '../utils/thumbnailGenerator';
import {
  saveVideoToSqlite,
  updateVideoInSqlite,
  deleteVideoFromSqlite,
  incrementViewCountInSqlite,
  getVideosFromSqlite,
  getVideoByIdFromSqlite,
} from '../config/sqlite';

// In-memory fallback matching the user's manual local videos
let fallbackVideos: any[] = [];

export const listVideos = async (req: Request, res: Response): Promise<void> => {
  const { department, semester, unit, search } = req.query;

  try {
    await ensureDbConnection();
    if (isDbConnected) {
      let queryStr = 'SELECT * FROM videos WHERE 1=1';
      const params: any[] = [];

      if (department && department !== 'ALL') {
        queryStr += ' AND department_code = ?';
        params.push(department);
      }
      if (semester && semester !== 'ALL') {
        queryStr += ' AND semester = ?';
        params.push(Number(semester));
      }
      if (unit && unit !== 'ALL') {
        queryStr += ' AND unit_number = ?';
        params.push(Number(unit));
      }
      if (search && typeof search === 'string') {
        queryStr += ' AND (LOWER(title) LIKE ? OR LOWER(topic) LIKE ? OR LOWER(faculty_name) LIKE ?)';
        const searchPattern = `%${search.toLowerCase()}%`;
        params.push(searchPattern, searchPattern, searchPattern);
      }

      queryStr += ' ORDER BY created_at DESC';
      const [rows]: any = await pool.query(queryStr, params);

      if (Array.isArray(rows) && rows.length > 0) {
        const formatted = rows.map((r: any) => ({
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
        }));
        res.json({ count: formatted.length, data: formatted });
        return;
      }
    }
  } catch (err) {
    console.warn('[videoController] MySQL query failed, falling back to SQLite:', err);
  }

  // Fallback to SQLite store
  const sqliteVideos = getVideosFromSqlite({
    department: department as string,
    semester: semester ? Number(semester) : undefined,
    unit: unit ? Number(unit) : undefined,
    search: search as string,
  });

  if (sqliteVideos.length > 0) {
    res.json({ count: sqliteVideos.length, data: sqliteVideos });
    return;
  }

  // Fallback to in-memory store
  let result = [...fallbackVideos];
  if (department && department !== 'ALL') {
    result = result.filter(v => v.departmentCode === department);
  }
  if (semester && semester !== 'ALL') {
    result = result.filter(v => v.semester === Number(semester));
  }
  if (unit && unit !== 'ALL') {
    result = result.filter(v => v.unitNumber === Number(unit));
  }
  if (search && typeof search === 'string') {
    const q = search.toLowerCase();
    result = result.filter(v =>
      v.title.toLowerCase().includes(q) ||
      v.subjectTitle.toLowerCase().includes(q) ||
      v.facultyName.toLowerCase().includes(q)
    );
  }

  res.json({ count: result.length, data: result });
};

export const getVideoById = async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);

  try {
    await ensureDbConnection();
    if (isDbConnected) {
      const [rows]: any = await pool.query('SELECT * FROM videos WHERE id = ?', [id]);
      if (Array.isArray(rows) && rows.length > 0) {
        const r = rows[0];
        res.json({
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
        return;
      }
    }
  } catch (err) {
    console.warn('[videoController] MySQL getVideoById failed, checking SQLite:', err);
  }

  // Fallback to SQLite
  const sqliteVideo = getVideoByIdFromSqlite(id);
  if (sqliteVideo) {
    res.json(sqliteVideo);
    return;
  }

  const video = fallbackVideos.find(v => v.id === id);
  if (!video) {
    res.status(404).json({ error: 'Video lecture not found' });
    return;
  }

  res.json(video);
};

export const createVideo = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureDbConnection();
    const {
      topicName,
      presentedBy,
      department,
      year,
      videoPath,
      thumbnailUrl,
      studyMaterialUrl,
      description
    } = req.body;

    if (!topicName || !presentedBy || !department || !year) {
      res.status(400).json({ error: 'Compulsory fields: topicName, presentedBy, department, year' });
      return;
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const videoFile = files?.['videoFile']?.[0];
    const thumbnailFile = files?.['thumbnailFile']?.[0];
    const studyMaterialFile = files?.['studyMaterialFile']?.[0];

    const finalVideoPath = videoFile 
      ? `/uploads/videos/${videoFile.filename}` 
      : (videoPath || '');

    let finalThumbnailUrl = thumbnailFile 
      ? `/uploads/thumbnails/${thumbnailFile.filename}` 
      : (thumbnailUrl || '');

    // If no custom thumbnail was uploaded, automatically extract 1st second frame of video
    if ((!finalThumbnailUrl || finalThumbnailUrl.includes('unsplash.com')) && videoFile) {
      const autoThumb = extract1sThumbnail(videoFile.path);
      if (autoThumb) {
        finalThumbnailUrl = autoThumb;
      }
    }

    if (!finalThumbnailUrl) {
      finalThumbnailUrl = 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800';
    }

    const finalStudyMaterialUrl = studyMaterialFile 
      ? `/uploads/materials/${studyMaterialFile.filename}` 
      : (studyMaterialUrl || undefined);

    const newId = 'vid-' + Date.now().toString(36);
    const newVideo = {
      id: newId,
      youtubeId: '',
      localVideoPath: finalVideoPath,
      title: topicName,
      topic: topicName,
      facultyName: presentedBy,
      departmentCode: department,
      academicYear: year,
      thumbnailUrl: finalThumbnailUrl,
      studyMaterialUrl: finalStudyMaterialUrl,
      description: description || 'Manually uploaded video lecture.',
      durationSeconds: req.body.durationSeconds ? Number(req.body.durationSeconds) : 240,
      semester: 1,
      subjectCode: 'GEN',
      subjectTitle: 'General Engineering',
      unitNumber: 1,
      viewCount: 0,
      publishedDate: new Date().toISOString().split('T')[0],
      tags: [department || 'Engineering', 'Lecture'],
      transcript: (() => {
        let parsed = req.body.transcript
          ? (typeof req.body.transcript === 'string' ? JSON.parse(req.body.transcript) : req.body.transcript)
          : undefined;
        if (!parsed || !Array.isArray(parsed) || parsed.length === 0) {
          const dur = req.body.durationSeconds ? Number(req.body.durationSeconds) : 240;
          const step = Math.floor(dur / 5);
          parsed = [
            {
              id: 'chunk_1',
              startTime: 0,
              endTime: step,
              text: `Introduction to ${topicName}: Institutional syllabus orientation, learning outcomes, and foundational principles.`
            },
            {
              id: 'chunk_2',
              startTime: step,
              endTime: step * 2,
              text: `Core Conceptual Framework: Mathematical definitions, architectural models, and core properties of ${topicName}.`
            },
            {
              id: 'chunk_3',
              startTime: step * 2,
              endTime: step * 3,
              text: `Technical Workflow & Implementation: Step-by-step procedures, data pipeline, and standard execution methods.`
            },
            {
              id: 'chunk_4',
              startTime: step * 3,
              endTime: step * 4,
              text: `Practical Case Studies & Tradeoffs: Performance bottlenecks, security considerations, and industrial applications.`
            },
            {
              id: 'chunk_5',
              startTime: step * 4,
              endTime: dur,
              text: `Anna University Exam Focus: Critical Part A (2 Marks) definitions, formulas, and Part B (13/16 Marks) essay review.`
            }
          ];
        }
        return parsed;
      })(),
    };

    // Save to MySQL if available
    if (isDbConnected) {
      await pool.query(`
        INSERT INTO videos (
          id, local_video_path, title, topic, faculty_name, department_code, academic_year,
          thumbnail_url, study_material_url, description, duration_seconds, semester,
          subject_code, subject_title, unit_number, view_count, published_date, transcript
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        newVideo.id,
        newVideo.localVideoPath,
        newVideo.title,
        newVideo.topic,
        newVideo.facultyName,
        newVideo.departmentCode,
        newVideo.academicYear,
        newVideo.thumbnailUrl,
        newVideo.studyMaterialUrl || null,
        newVideo.description,
        newVideo.durationSeconds,
        newVideo.semester,
        newVideo.subjectCode,
        newVideo.subjectTitle,
        newVideo.unitNumber,
        newVideo.viewCount,
        newVideo.publishedDate,
        newVideo.transcript ? JSON.stringify(newVideo.transcript) : null,
      ]);
      console.log('✅ [MySQL] Inserted new video with transcript into MySQL:', newVideo.id);
    }

    // Save to SQLite (Dual Persistence)
    try {
      saveVideoToSqlite(newVideo);
      console.log('✅ [SQLite] Inserted new video into SQLite database:', newVideo.id);
    } catch (sqliteErr: any) {
      console.error('⚠️ [SQLite] Failed to insert video into SQLite:', sqliteErr.message);
    }

    // Also update in-memory fallback
    fallbackVideos.unshift(newVideo);

    res.status(201).json({ success: true, data: newVideo });
  } catch (error: any) {
    console.error('Error creating video:', error);
    res.status(500).json({ error: 'Failed to create video', details: error.message });
  }
};

export const updateVideo = async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);
  try {
    await ensureDbConnection();
    const {
      topicName,
      presentedBy,
      department,
      year,
      description,
      durationSeconds,
      transcript,
    } = req.body;

    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const newVideoFile = files?.['videoFile']?.[0];
    const newThumbnailFile = files?.['thumbnailFile']?.[0];
    const newStudyMaterialFile = files?.['studyMaterialFile']?.[0];

    let currentVideo: any = null;

    if (isDbConnected) {
      const [rows]: any = await pool.query('SELECT * FROM videos WHERE id = ?', [id]);
      if (Array.isArray(rows) && rows.length > 0) {
        currentVideo = rows[0];
      }
    }
    if (!currentVideo) {
      currentVideo = fallbackVideos.find((v) => v.id === id);
    }

    if (!currentVideo) {
      res.status(404).json({ error: 'Video not found' });
      return;
    }

    const updatedTitle = topicName || currentVideo.title || currentVideo.topic;
    const updatedFaculty = presentedBy || currentVideo.faculty_name || currentVideo.facultyName;
    const updatedDept = department || currentVideo.department_code || currentVideo.departmentCode;
    const updatedYear = year || currentVideo.academic_year || currentVideo.academicYear;
    const updatedDesc = description !== undefined ? description : (currentVideo.description || '');

    const updatedLocalVideoPath = newVideoFile
      ? `/uploads/videos/${newVideoFile.filename}`
      : (currentVideo.local_video_path || currentVideo.localVideoPath || '');

    let updatedThumbnailUrl = newThumbnailFile
      ? `/uploads/thumbnails/${newThumbnailFile.filename}`
      : (currentVideo.thumbnail_url || currentVideo.thumbnailUrl || '');

    // If new video file is uploaded and no new thumbnail image provided, extract 1s frame
    if (newVideoFile && !newThumbnailFile) {
      const autoThumb = extract1sThumbnail(newVideoFile.path);
      if (autoThumb) {
        updatedThumbnailUrl = autoThumb;
      }
    }

    const updatedStudyMaterialUrl = newStudyMaterialFile
      ? `/uploads/materials/${newStudyMaterialFile.filename}`
      : (currentVideo.study_material_url || currentVideo.studyMaterialUrl || null);

    const updatedDuration = durationSeconds
      ? Number(durationSeconds)
      : (currentVideo.duration_seconds || currentVideo.durationSeconds || 240);

    let updatedTranscript = currentVideo.transcript;
    if (transcript) {
      updatedTranscript = typeof transcript === 'string' ? JSON.parse(transcript) : transcript;
    }

    if (isDbConnected) {
      await pool.query(
        `UPDATE videos SET
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
        WHERE id = ?`,
        [
          updatedTitle,
          updatedTitle,
          updatedFaculty,
          updatedDept,
          updatedYear,
          updatedDesc,
          updatedLocalVideoPath,
          updatedThumbnailUrl,
          updatedStudyMaterialUrl,
          updatedDuration,
          updatedTranscript ? (typeof updatedTranscript === 'string' ? updatedTranscript : JSON.stringify(updatedTranscript)) : null,
          id,
        ]
      );
      console.log('✅ [MySQL] Updated video in MySQL:', id);
    }

    // Update in SQLite
    try {
      updateVideoInSqlite(id, {
        title: updatedTitle,
        topic: updatedTitle,
        facultyName: updatedFaculty,
        departmentCode: updatedDept,
        academicYear: updatedYear,
        description: updatedDesc,
        localVideoPath: updatedLocalVideoPath,
        thumbnailUrl: updatedThumbnailUrl,
        studyMaterialUrl: updatedStudyMaterialUrl,
        durationSeconds: updatedDuration,
        transcript: updatedTranscript,
      });
      console.log('✅ [SQLite] Updated video in SQLite:', id);
    } catch (sqliteErr: any) {
      console.error('⚠️ [SQLite] Error updating video in SQLite:', sqliteErr.message);
    }

    const updatedVideoObj = {
      id,
      youtubeId: currentVideo.youtube_id || currentVideo.youtubeId || '',
      localVideoPath: updatedLocalVideoPath,
      title: updatedTitle,
      topic: updatedTitle,
      facultyName: updatedFaculty,
      departmentCode: updatedDept,
      academicYear: updatedYear,
      thumbnailUrl: updatedThumbnailUrl,
      studyMaterialUrl: updatedStudyMaterialUrl,
      description: updatedDesc,
      durationSeconds: updatedDuration,
      semester: currentVideo.semester || 1,
      subjectCode: currentVideo.subject_code || currentVideo.subjectCode || 'GEN',
      subjectTitle: currentVideo.subject_title || currentVideo.subjectTitle || 'General Engineering',
      unitNumber: currentVideo.unit_number || currentVideo.unitNumber || 1,
      viewCount: currentVideo.view_count !== undefined ? currentVideo.view_count : (currentVideo.viewCount || 0),
      publishedDate: currentVideo.published_date || currentVideo.publishedDate,
      transcript: updatedTranscript,
    };

    const fbIdx = fallbackVideos.findIndex((v) => v.id === id);
    if (fbIdx !== -1) {
      fallbackVideos[fbIdx] = { ...fallbackVideos[fbIdx], ...updatedVideoObj };
    } else {
      fallbackVideos.unshift(updatedVideoObj);
    }

    res.json({ success: true, data: updatedVideoObj });
  } catch (error: any) {
    console.error('Error updating video:', error);
    res.status(500).json({ error: 'Failed to update video', details: error.message });
  }
};

export const deleteVideo = async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);
  try {
    await ensureDbConnection();
    const filesToDelete: string[] = [];

    if (isDbConnected) {
      const [rows]: any = await pool.query('SELECT local_video_path, thumbnail_url, study_material_url FROM videos WHERE id = ?', [id]);
      if (Array.isArray(rows) && rows.length > 0) {
        const r = rows[0];
        if (r.local_video_path) filesToDelete.push(r.local_video_path);
        if (r.thumbnail_url) filesToDelete.push(r.thumbnail_url);
        if (r.study_material_url) filesToDelete.push(r.study_material_url);
      }
      await pool.query('DELETE FROM videos WHERE id = ?', [id]);
      console.log('✅ [MySQL] Deleted video from MySQL:', id);
    }

    // Delete from SQLite
    try {
      deleteVideoFromSqlite(id);
      console.log('✅ [SQLite] Deleted video from SQLite:', id);
    } catch (sqliteErr: any) {
      console.error('⚠️ [SQLite] Error deleting video from SQLite:', sqliteErr.message);
    }

    const fallbackVid = fallbackVideos.find((v) => v.id === id);
    if (fallbackVid) {
      if (fallbackVid.localVideoPath) filesToDelete.push(fallbackVid.localVideoPath);
      if (fallbackVid.thumbnailUrl) filesToDelete.push(fallbackVid.thumbnailUrl);
      if (fallbackVid.studyMaterialUrl) filesToDelete.push(fallbackVid.studyMaterialUrl);
    }
    fallbackVideos = fallbackVideos.filter((v) => v.id !== id);
    viewCountsMap.delete(id);

    // Delete associated uploaded files from disk
    for (const relPath of filesToDelete) {
      if (relPath && relPath.startsWith('/uploads/')) {
        const fullPath = path.join(__dirname, '../..', relPath);
        if (fs.existsSync(fullPath)) {
          fs.unlink(fullPath, (err) => {
            if (err) console.warn('[videoController] Could not unlink file:', fullPath, err.message);
          });
        }
      }
    }

    res.json({ success: true, message: 'Video deleted successfully', id });
  } catch (error: any) {
    console.error('Error deleting video:', error);
    res.status(500).json({ error: 'Failed to delete video', details: error.message });
  }
};

const viewCountsMap = new Map<string, number>();

export const incrementViewCount = async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);
  try {
    await ensureDbConnection();
    let currentViews = 1;

    const prevCount = viewCountsMap.get(id) || 0;
    viewCountsMap.set(id, prevCount + 1);

    if (isDbConnected) {
      await pool.query('UPDATE videos SET view_count = view_count + 1 WHERE id = ?', [id]);
      const [rows]: any = await pool.query('SELECT view_count FROM videos WHERE id = ?', [id]);
      if (Array.isArray(rows) && rows.length > 0) {
        currentViews = rows[0].view_count;
      }
      console.log(`✅ [MySQL] Incremented view count for video ${id} -> ${currentViews}`);
    }

    // Increment in SQLite
    try {
      const sqliteViews = incrementViewCountInSqlite(id);
      if (!isDbConnected && sqliteViews > 0) {
        currentViews = sqliteViews;
      }
    } catch (sqliteErr: any) {
      console.error('⚠️ [SQLite] Error incrementing views in SQLite:', sqliteErr.message);
    }

    const fallbackIndex = fallbackVideos.findIndex(v => v.id === id);
    if (fallbackIndex !== -1) {
      fallbackVideos[fallbackIndex].viewCount = (fallbackVideos[fallbackIndex].viewCount || 0) + 1;
      if (!isDbConnected && currentViews === 1) {
        currentViews = fallbackVideos[fallbackIndex].viewCount;
      }
    } else if (!isDbConnected && currentViews === 1) {
      currentViews = viewCountsMap.get(id)!;
    }

    res.json({ success: true, id, viewCount: currentViews });
  } catch (error: any) {
    console.error('Error incrementing video view count:', error);
    res.status(500).json({ error: 'Failed to increment view count', details: error.message });
  }
};

export const syncVideos = async (req: Request, res: Response): Promise<void> => {
  const { videos } = req.body;
  if (!Array.isArray(videos)) {
    res.status(400).json({ error: 'Expected array of videos' });
    return;
  }

  try {
    await ensureDbConnection();
    if (isDbConnected) {
      for (const v of videos) {
        if (!v.id || !v.title) continue;
        const [existing]: any = await pool.query('SELECT id FROM videos WHERE id = ?', [v.id]);
        if (!existing || existing.length === 0) {
          await pool.query(`
            INSERT INTO videos (
              id, local_video_path, title, topic, faculty_name, department_code, academic_year,
              thumbnail_url, study_material_url, description, duration_seconds, semester,
              subject_code, subject_title, unit_number, view_count, published_date, transcript
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            v.id,
            v.localVideoPath || '',
            v.title || v.topic,
            v.topic || v.title,
            v.facultyName || 'Faculty',
            v.departmentCode || 'CSE',
            v.academicYear || '2024-25',
            v.thumbnailUrl || 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800',
            v.studyMaterialUrl || null,
            v.description || '',
            v.durationSeconds || 240,
            v.semester || 1,
            v.subjectCode || 'GEN',
            v.subjectTitle || 'General Engineering',
            v.unitNumber || 1,
            v.viewCount || 0,
            v.publishedDate || new Date().toISOString().split('T')[0],
            v.transcript ? (typeof v.transcript === 'string' ? v.transcript : JSON.stringify(v.transcript)) : null,
          ]);
          console.log(`✅ [MySQL] Synced video from local into MySQL: ${v.title} (${v.id})`);
        } else if (v.viewCount) {
          await pool.query('UPDATE videos SET view_count = GREATEST(view_count, ?) WHERE id = ?', [v.viewCount, v.id]);
        }
      }
    }

    // Mirror to SQLite
    try {
      for (const v of videos) {
        saveVideoToSqlite(v);
      }
      console.log(`✅ [SQLite] Synced ${videos.length} videos into SQLite`);
    } catch (sqliteErr: any) {
      console.error('⚠️ [SQLite] Error syncing videos to SQLite:', sqliteErr.message);
    }

    res.json({ success: true, count: videos.length });
  } catch (error: any) {
    console.error('Error syncing videos:', error);
    res.status(500).json({ error: 'Failed to sync videos', details: error.message });
  }
};




