import { Video } from '../types';
import { generateAutomaticTranscript } from './transcriptParser';
import { getApiUrl } from '../config/api';
import rawSeedVideos from '../data/seedVideos.json';

const STORAGE_KEY = 'campusiq_uploaded_videos';

const formatSeedVideo = (r: any): Video => ({
  id: r.id,
  youtubeId: r.youtube_id || r.youtubeId || '',
  localVideoPath: r.local_video_path || r.localVideoPath || undefined,
  title: r.title,
  topic: r.topic || r.title,
  facultyName: r.faculty_name || r.facultyName || 'Faculty',
  departmentCode: r.department_code || r.departmentCode || 'CSE',
  departmentId: 'dept_' + (r.department_code || r.departmentCode || 'cse').toLowerCase(),
  program: 'B.E',
  academicYear: r.academic_year || r.academicYear || '2026-27',
  thumbnailUrl: r.thumbnail_url || r.thumbnailUrl || 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800',
  studyMaterialUrl: r.study_material_url || r.studyMaterialUrl || undefined,
  description: r.description || '',
  durationSeconds: r.duration_seconds || r.durationSeconds || 120,
  semester: r.semester || 1,
  subjectCode: r.subject_code || r.subjectCode || 'GEN',
  subjectTitle: r.subject_title || r.subjectTitle || 'General Engineering',
  unitNumber: r.unit_number || r.unitNumber || 1,
  viewCount: r.view_count || r.viewCount || 0,
  publishedDate: r.published_date || r.publishedDate || new Date().toISOString().split('T')[0],
  tags: r.tags ? (typeof r.tags === 'string' ? JSON.parse(r.tags) : r.tags) : ['Engineering', 'Lecture'],
  transcript: r.transcript ? (typeof r.transcript === 'string' ? JSON.parse(r.transcript) : r.transcript) : undefined,
});

export const DEFAULT_VIDEOS: Video[] = Array.isArray(rawSeedVideos)
  ? (rawSeedVideos as any[]).map(formatSeedVideo)
  : [];

// Helper to get local stored videos
export const getLocalStoredVideos = (): Video[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Error reading localStorage videos:', e);
  }
  return DEFAULT_VIDEOS;
};

// Helper to save videos permanently in localStorage with change detection
export const saveVideosToLocalStorage = (videos: Video[], forceDispatch = false): void => {
  try {
    const prevRaw = localStorage.getItem(STORAGE_KEY);
    const newRaw = JSON.stringify(videos);
    if (prevRaw !== newRaw || forceDispatch) {
      localStorage.setItem(STORAGE_KEY, newRaw);
      // Trigger custom event so all pages re-render instantly in real time
      window.dispatchEvent(new Event('campusiq_videos_updated'));
    }
  } catch (e) {
    console.error('Error saving videos to localStorage:', e);
  }
};

// Fetch videos directly from backend MySQL API and synchronize immediately with frontend state
export const fetchAllVideos = async (): Promise<Video[]> => {
  try {
    const res = await fetch(getApiUrl('/api/videos'));
    if (res.ok) {
      const json = await res.json();
      if (json && Array.isArray(json.data) && json.data.length > 0) {
        saveVideosToLocalStorage(json.data);
        return json.data;
      }
    }
  } catch (err) {
    console.log('[videoStore] Backend API offline or unreachable, using local storage cache.');
  }

  const current = getLocalStoredVideos();
  if (current.length === 0 && DEFAULT_VIDEOS.length > 0) {
    saveVideosToLocalStorage(DEFAULT_VIDEOS);
    return DEFAULT_VIDEOS;
  }
  return current;
};

// Real-time automatic background polling & window focus synchronization with MySQL
let autoSyncStarted = false;
let autoSyncInterval: any = null;

export const startAutoSync = (intervalMs: number = 3000): void => {
  if (typeof window === 'undefined' || autoSyncStarted) return;
  autoSyncStarted = true;

  // Immediate sync on load
  fetchAllVideos().catch(() => {});

  // Periodic poll every 3 seconds while active
  autoSyncInterval = setInterval(() => {
    if (!document.hidden) {
      fetchAllVideos().catch(() => {});
    }
  }, intervalMs);

  // Sync immediately when the user switches tabs back to this app (e.g. from phpMyAdmin)
  window.addEventListener('focus', () => {
    fetchAllVideos().catch(() => {});
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      fetchAllVideos().catch(() => {});
    }
  });
};

// Automatically start background sync on browser startup
if (typeof window !== 'undefined') {
  startAutoSync();
}

// Delete video from both backend MySQL and local storage
export const deleteVideoAndPersist = async (id: string): Promise<boolean> => {
  // 1. Immediately remove from local storage so UI updates instantly
  const current = getLocalStoredVideos();
  const updated = current.filter((v) => v.id !== id);
  saveVideosToLocalStorage(updated, true);

  // 2. Call backend DELETE endpoint to remove from MySQL and disk
  try {
    const res = await fetch(getApiUrl(`/api/videos/${id}`), { method: 'DELETE' });
    if (!res.ok) {
      console.warn('[videoStore] Failed to delete video on backend, status:', res.status);
    }
  } catch (e) {
    console.warn('[videoStore] Failed to delete video on backend:', e);
  }

  return true;
};

// Increment video view count both in local storage and backend MySQL
export const recordVideoView = async (id: string): Promise<number> => {
  if (!id) return 0;
  
  // 1. Optimistically update local storage
  const current = getLocalStoredVideos();
  let updatedCount = 1;
  const updated = current.map((v) => {
    if (v.id === id) {
      updatedCount = (v.viewCount || 0) + 1;
      return { ...v, viewCount: updatedCount };
    }
    return v;
  });
  saveVideosToLocalStorage(updated, true);

  // 2. Synchronize with backend API & MySQL
  try {
    const res = await fetch(getApiUrl(`/api/videos/${id}/view`), { method: 'POST' });
    if (res.ok) {
      const json = await res.json();
      if (json && typeof json.viewCount === 'number') {
        updatedCount = json.viewCount;
        const fresh = getLocalStoredVideos().map((v) =>
          v.id === id ? { ...v, viewCount: updatedCount } : v
        );
        saveVideosToLocalStorage(fresh, true);
      }
    }
  } catch (err) {
    console.warn('[videoStore] Failed to sync view count to backend:', err);
  }

  return updatedCount;
};

// Convert file to Base64 data URL for permanent offline backup
export const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// Save newly uploaded video permanently to MySQL and LocalStorage
export const uploadAndPersistVideo = async (
  formData: FormData,
  metadata: {
    topicName: string;
    presentedBy: string;
    department: string;
    year: string;
    thumbnailDataUrl?: string;
    videoDataUrl?: string;
    studyMaterialDataUrl?: string;
    description?: string;
    durationSeconds?: number;
    transcript?: any[];
  }
): Promise<Video> => {
  let createdVideo: Video | null = null;
  let finalTranscript = metadata.transcript;

  if (!finalTranscript || finalTranscript.length === 0) {
    try {
      finalTranscript = await generateAutomaticTranscript(
        metadata.topicName,
        metadata.department,
        metadata.durationSeconds || 240,
        metadata.presentedBy
      );
    } catch (err) {
      console.warn('[videoStore] Failed auto transcript generation:', err);
    }
  }

  // 1. Attempt upload to backend Express & MySQL
  try {
    if (metadata.durationSeconds && !formData.has('durationSeconds')) {
      formData.append('durationSeconds', metadata.durationSeconds.toString());
    }
    if (finalTranscript && finalTranscript.length > 0) {
      if (formData.has('transcript')) {
        formData.set('transcript', JSON.stringify(finalTranscript));
      } else {
        formData.append('transcript', JSON.stringify(finalTranscript));
      }
    }
    const res = await fetch(getApiUrl('/api/videos/upload'), {
      method: 'POST',
      body: formData,
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success && json.data) {
        createdVideo = json.data as Video;
        if (!createdVideo.transcript && finalTranscript) {
          createdVideo.transcript = finalTranscript;
        }
      }
    }
  } catch (err) {
    console.warn('[videoStore] Failed to upload via backend API, saving locally:', err);
  }

  // 2. If backend was offline or failed, create resilient local record
  if (!createdVideo) {
    const id = 'vid-local-' + Date.now().toString(36);
    createdVideo = {
      id,
      youtubeId: '',
      localVideoPath: metadata.videoDataUrl || '',
      title: metadata.topicName,
      topic: metadata.topicName,
      facultyName: metadata.presentedBy,
      departmentCode: metadata.department,
      departmentId: 'dept_' + metadata.department.toLowerCase(),
      program: 'B.E',
      semester: 1,
      academicYear: metadata.year,
      subjectCode: 'GEN',
      subjectTitle: 'General Engineering',
      unitNumber: 1,
      thumbnailUrl: metadata.thumbnailDataUrl || 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800',
      studyMaterialUrl: metadata.studyMaterialDataUrl,
      description: metadata.description || 'Manually uploaded video lecture.',
      durationSeconds: metadata.durationSeconds || 240,
      tags: [metadata.department, 'Lecture'],
      viewCount: 0,
      publishedDate: new Date().toISOString().split('T')[0],
      transcript: finalTranscript || metadata.transcript,
    };
  }

  // 3. Always persist to localStorage permanently and sync with MySQL
  const current = getLocalStoredVideos();
  const updated = [createdVideo, ...current.filter((v) => v.id !== createdVideo!.id)];
  saveVideosToLocalStorage(updated, true);
  await fetchAllVideos();

  return createdVideo;
};

// Update existing video permanently in MySQL and LocalStorage
export const updateAndPersistVideo = async (
  id: string,
  formData: FormData,
  metadata: {
    topicName: string;
    presentedBy: string;
    department: string;
    year: string;
    thumbnailDataUrl?: string;
    videoDataUrl?: string;
    studyMaterialDataUrl?: string;
    description?: string;
    durationSeconds?: number;
    transcript?: any[];
  }
): Promise<Video> => {
  let updatedVideo: Video | null = null;
  const current = getLocalStoredVideos();
  const existing = current.find((v) => v.id === id);

  try {
    if (metadata.durationSeconds && !formData.has('durationSeconds')) {
      formData.append('durationSeconds', metadata.durationSeconds.toString());
    }
    if (metadata.transcript && metadata.transcript.length > 0) {
      if (formData.has('transcript')) {
        formData.set('transcript', JSON.stringify(metadata.transcript));
      } else {
        formData.append('transcript', JSON.stringify(metadata.transcript));
      }
    }
    if (!formData.has('topicName')) formData.append('topicName', metadata.topicName);
    if (!formData.has('presentedBy')) formData.append('presentedBy', metadata.presentedBy);
    if (!formData.has('department')) formData.append('department', metadata.department);
    if (!formData.has('year')) formData.append('year', metadata.year);
    if (metadata.description !== undefined && !formData.has('description')) {
      formData.append('description', metadata.description);
    }

    const res = await fetch(getApiUrl(`/api/videos/${id}`), {
      method: 'PUT',
      body: formData,
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success && json.data) {
        updatedVideo = json.data as Video;
      }
    }
  } catch (err) {
    console.warn('[videoStore] Failed to update via backend API, updating locally:', err);
  }

  if (!updatedVideo && existing) {
    updatedVideo = {
      ...existing,
      title: metadata.topicName,
      topic: metadata.topicName,
      facultyName: metadata.presentedBy,
      departmentCode: metadata.department,
      departmentId: 'dept_' + metadata.department.toLowerCase(),
      academicYear: metadata.year,
      description: metadata.description !== undefined ? metadata.description : existing.description,
      thumbnailUrl: metadata.thumbnailDataUrl || existing.thumbnailUrl,
      localVideoPath: metadata.videoDataUrl || existing.localVideoPath,
      studyMaterialUrl: metadata.studyMaterialDataUrl || existing.studyMaterialUrl,
      durationSeconds: metadata.durationSeconds || existing.durationSeconds,
      transcript: metadata.transcript || existing.transcript,
    };
  }

  if (updatedVideo) {
    const fresh = current.map((v) => (v.id === id ? updatedVideo! : v));
    saveVideosToLocalStorage(fresh, true);
    await fetchAllVideos();
    return updatedVideo;
  }

  throw new Error('Video not found for update');
};

