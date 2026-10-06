import React, { useState, useEffect } from 'react';
import {
  fetchAllVideos,
  getLocalStoredVideos,
  uploadAndPersistVideo,
  updateAndPersistVideo,
  deleteVideoAndPersist,
  fileToDataUrl
} from '../../lib/videoStore';
import { captureVideoFrameAtFirstSecond } from '../../lib/videoThumbnail';
import { parseTranscript, generateAutomaticTranscript } from '../../lib/transcriptParser';
import { Video, Plus, Upload, X, Trash2, FileText, CheckCircle2, ChevronDown, ChevronUp, Sparkles, Loader2, Eye, Pencil, Image as ImageIcon } from 'lucide-react';
import { Video as VideoType, TranscriptChunk } from '../../types';
import { resolveMediaUrl } from '../../config/api';

export const AdminVideosPage: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVideo, setEditingVideo] = useState<VideoType | null>(null);
  const [videos, setVideos] = useState<VideoType[]>(getLocalStoredVideos());
  const [isUploading, setIsUploading] = useState(false);

  const handleDeleteVideo = async (id: string, title: string) => {
    if (window.confirm(`Are you sure you want to delete "${title}"? This will remove it from MySQL and all dashboards.`)) {
      setVideos((prev) => prev.filter((v) => v.id !== id));
      await deleteVideoAndPersist(id);
      setVideos(getLocalStoredVideos());
    }
  };

  const handleOpenUploadModal = () => {
    setEditingVideo(null);
    resetForm();
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (v: VideoType) => {
    setEditingVideo(v);
    setTopicName(v.title || v.topic || '');
    setPresentedBy(v.facultyName || '');
    setDepartment(v.departmentCode || '');
    setYear(v.academicYear || '');
    setVideoFile(null);
    setThumbnailFile(null);
    setThumbnailPreview(v.thumbnailUrl || null);
    setIsAutoThumbnail(false);
    setIsGeneratingThumbnail(false);
    setStudyMaterial(null);
    setTranscriptFile(null);
    if (v.transcript && v.transcript.length > 0) {
      setTranscriptChunks(v.transcript);
      const formatted = v.transcript
        .map((c) => {
          const m = Math.floor(c.startTime / 60);
          const s = c.startTime % 60;
          return `[${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}] ${c.text}`;
        })
        .join('\n\n');
      setTranscriptText(formatted);
    } else {
      setTranscriptChunks([]);
      setTranscriptText('');
    }
    setShowManualTranscript(false);
    setIsModalOpen(true);
  };

  // Form State
  const [topicName, setTopicName] = useState('');
  const [presentedBy, setPresentedBy] = useState('');
  const [department, setDepartment] = useState('');
  const [year, setYear] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [isGeneratingThumbnail, setIsGeneratingThumbnail] = useState(false);
  const [isAutoThumbnail, setIsAutoThumbnail] = useState(false);
  const [studyMaterial, setStudyMaterial] = useState<File | null>(null);
  const [transcriptFile, setTranscriptFile] = useState<File | null>(null);
  const [transcriptText, setTranscriptText] = useState('');
  const [transcriptChunks, setTranscriptChunks] = useState<TranscriptChunk[]>([]);
  const [showManualTranscript, setShowManualTranscript] = useState(false);
  const [isGeneratingTranscript, setIsGeneratingTranscript] = useState(false);

  // Load videos on mount and sync with backend
  useEffect(() => {
    fetchAllVideos().then((loaded) => {
      setVideos(loaded);
    });

    const handleUpdate = () => {
      setVideos(getLocalStoredVideos());
    };
    window.addEventListener('campusiq_videos_updated', handleUpdate);
    return () => window.removeEventListener('campusiq_videos_updated', handleUpdate);
  }, []);

  const handleTranscriptFileUpload = async (file: File) => {
    setTranscriptFile(file);
    try {
      const text = await file.text();
      setTranscriptText(text);
      const parsed = parseTranscript(text, 240);
      setTranscriptChunks(parsed);
    } catch (err) {
      console.warn('Could not read transcript file:', err);
    }
  };

  const handleTranscriptTextChange = (text: string) => {
    setTranscriptText(text);
    const parsed = parseTranscript(text, 240);
    setTranscriptChunks(parsed);
  };

  const handleAutoGenerateTranscript = async () => {
    if (!topicName.trim()) {
      alert("Please enter a Video Topic Name first so AI knows what to generate.");
      return;
    }
    setIsGeneratingTranscript(true);
    try {
      let durationSec = 240;
      if (videoFile) {
        try {
          durationSec = await new Promise<number>((resolve) => {
            const tempVideo = document.createElement('video');
            tempVideo.preload = 'metadata';
            tempVideo.onloadedmetadata = () => {
              window.URL.revokeObjectURL(tempVideo.src);
              const secs = Math.round(tempVideo.duration);
              resolve(secs && !isNaN(secs) && secs > 0 ? secs : 240);
            };
            tempVideo.onerror = () => resolve(240);
            tempVideo.src = URL.createObjectURL(videoFile);
          });
        } catch (_) {}
      }

      const chunks = await generateAutomaticTranscript(
        topicName,
        department || 'CSE',
        durationSec,
        presentedBy
      );

      setTranscriptChunks(chunks);
      const formattedText = chunks
        .map((c) => {
          const m = Math.floor(c.startTime / 60);
          const s = c.startTime % 60;
          return `[${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}] ${c.text}`;
        })
        .join('\n\n');
      setTranscriptText(formattedText);
      setShowManualTranscript(true);
    } catch (err) {
      console.error('Error generating transcript:', err);
    } finally {
      setIsGeneratingTranscript(false);
    }
  };

  const handleVideoFileChange = async (file: File | null) => {
    setVideoFile(file);
    if (!file) {
      if (isAutoThumbnail) {
        setThumbnailFile(null);
        setThumbnailPreview(editingVideo ? (editingVideo.thumbnailUrl || null) : null);
        setIsAutoThumbnail(false);
      }
      return;
    }

    // Automatically capture the first second of the video as thumbnail!
    setIsGeneratingThumbnail(true);
    try {
      const result = await captureVideoFrameAtFirstSecond(file, 1.0);
      setThumbnailFile(result.file);
      setThumbnailPreview(result.dataUrl);
      setIsAutoThumbnail(true);
    } catch (err) {
      console.warn('Could not auto-generate thumbnail from 1st second:', err);
    } finally {
      setIsGeneratingThumbnail(false);
    }
  };

  const handleThumbnailFileChange = async (file: File | null) => {
    setThumbnailFile(file);
    if (file) {
      setIsAutoThumbnail(false);
      try {
        const dataUrl = await fileToDataUrl(file);
        setThumbnailPreview(dataUrl);
      } catch (_) {
        setThumbnailPreview(URL.createObjectURL(file));
      }
    } else if (editingVideo) {
      setThumbnailPreview(editingVideo.thumbnailUrl || null);
      setIsAutoThumbnail(false);
    } else {
      setThumbnailPreview(null);
      setIsAutoThumbnail(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topicName || !presentedBy || !department || !year) {
      alert("Please fill all compulsory fields.");
      return;
    }
    if (!editingVideo && !videoFile) {
      alert("Please select a video file.");
      return;
    }

    setIsUploading(true);

    try {
      let finalThumbnailFile = thumbnailFile;
      let finalThumbnailDataUrl = thumbnailPreview || undefined;

      // If user uploaded a video but thumbnail wasn't captured yet, generate from 1st second
      if (!finalThumbnailFile && videoFile) {
        try {
          setIsGeneratingThumbnail(true);
          const result = await captureVideoFrameAtFirstSecond(videoFile, 1.0);
          finalThumbnailFile = result.file;
          finalThumbnailDataUrl = result.dataUrl;
          setThumbnailFile(result.file);
          setThumbnailPreview(result.dataUrl);
          setIsAutoThumbnail(true);
        } catch (err) {
          console.warn('Fallback thumbnail extraction error:', err);
        } finally {
          setIsGeneratingThumbnail(false);
        }
      }

      const formData = new FormData();
      if (videoFile) formData.append('videoFile', videoFile);
      if (finalThumbnailFile) formData.append('thumbnailFile', finalThumbnailFile);
      if (studyMaterial) {
        formData.append('studyMaterialFile', studyMaterial);
      }
      formData.append('topicName', topicName);
      formData.append('presentedBy', presentedBy);
      formData.append('department', department);
      formData.append('year', year);

      if (transcriptChunks.length > 0) {
        formData.append('transcript', JSON.stringify(transcriptChunks));
      }

      let thumbnailDataUrl: string | undefined = finalThumbnailDataUrl;
      if (!thumbnailDataUrl && finalThumbnailFile) {
        try {
          thumbnailDataUrl = await fileToDataUrl(finalThumbnailFile);
        } catch (err) {
          console.warn('Thumbnail base64 conversion skipped:', err);
        }
      }

      let durationSeconds = editingVideo?.durationSeconds || 240;
      if (videoFile) {
        try {
          durationSeconds = await new Promise<number>((resolve) => {
            const tempVideo = document.createElement('video');
            tempVideo.preload = 'metadata';
            tempVideo.onloadedmetadata = () => {
              window.URL.revokeObjectURL(tempVideo.src);
              const secs = Math.round(tempVideo.duration);
              resolve(secs && !isNaN(secs) && secs > 0 ? secs : 240);
            };
            tempVideo.onerror = () => resolve(240);
            tempVideo.src = URL.createObjectURL(videoFile);
          });
        } catch (err) {
          console.warn('Could not read duration, defaulting to 240s:', err);
        }
      }

      formData.append('durationSeconds', durationSeconds.toString());

      // Automatically generate full AI transcript & jump points if not supplied manually
      let finalChunks = transcriptChunks;
      if (!editingVideo && (!finalChunks || finalChunks.length === 0)) {
        setIsGeneratingTranscript(true);
        try {
          finalChunks = await generateAutomaticTranscript(
            topicName,
            department,
            durationSeconds,
            presentedBy
          );
        } catch (err) {
          console.warn('Auto transcript generation during submission error:', err);
        } finally {
          setIsGeneratingTranscript(false);
        }
      }

      if (finalChunks && finalChunks.length > 0) {
        if (formData.has('transcript')) {
          formData.set('transcript', JSON.stringify(finalChunks));
        } else {
          formData.append('transcript', JSON.stringify(finalChunks));
        }
      }

      if (editingVideo) {
        await updateAndPersistVideo(editingVideo.id, formData, {
          topicName,
          presentedBy,
          department,
          year,
          thumbnailDataUrl,
          videoDataUrl: videoFile ? URL.createObjectURL(videoFile) : undefined,
          durationSeconds,
          transcript: finalChunks && finalChunks.length > 0 ? finalChunks : undefined,
        });
      } else {
        await uploadAndPersistVideo(formData, {
          topicName,
          presentedBy,
          department,
          year,
          thumbnailDataUrl,
          videoDataUrl: URL.createObjectURL(videoFile!),
          durationSeconds,
          transcript: finalChunks && finalChunks.length > 0 ? finalChunks : undefined,
        });
      }

      // Update state immediately
      setVideos(getLocalStoredVideos());
      setIsModalOpen(false);
      setEditingVideo(null);
      resetForm();
    } catch (err: any) {
      console.error('Operation error:', err);
      alert('Operation failed: ' + (err.message || 'Unknown error'));
    } finally {
      setIsUploading(false);
    }
  };

  const resetForm = () => {
    setTopicName('');
    setPresentedBy('');
    setDepartment('');
    setYear('');
    setVideoFile(null);
    setThumbnailFile(null);
    setThumbnailPreview(null);
    setIsGeneratingThumbnail(false);
    setIsAutoThumbnail(false);
    setStudyMaterial(null);
    setTranscriptFile(null);
    setTranscriptText('');
    setTranscriptChunks([]);
    setShowManualTranscript(false);
  };

  return (
    <div className="space-y-6 sm:space-y-8 pb-24 sm:pb-16">
      
      {/* Header with Mobile-Optimized Full-Width Action */}
      <div className="p-5 sm:p-8 rounded-3xl bg-white border border-gray-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
        <div className="space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider text-[#C49A55] flex items-center gap-1.5">
            <Video className="w-3.5 h-3.5" />
            <span>Video Repository Management</span>
          </span>
          <h1 className="text-xl sm:text-3xl font-black text-[#17201C] tracking-tight">
            Curated College Video Catalog
          </h1>
          <p className="text-xs sm:text-sm text-[#66736C]">
            Manage, upload and synchronize manual video lectures with optional study materials.
          </p>
        </div>

        {/* Big Mobile-First Upload Button */}
        <button
          onClick={handleOpenUploadModal}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 sm:py-2.5 bg-gradient-to-r from-[#173B2F] to-[#285443] hover:from-[#112a21] hover:to-[#173b2f] text-white rounded-2xl sm:rounded-xl font-bold text-sm sm:text-xs shadow-lg shadow-emerald-950/20 transition cursor-pointer active:scale-95 shrink-0"
        >
          <Upload className="w-4 h-4 text-[#C49A55]" />
          <span>Upload New Video</span>
        </button>
      </div>

      {/* Mobile Card List (Visible on Phone Screens) */}
      <div className="block sm:hidden space-y-4">
        <div className="flex items-center justify-between text-xs font-bold text-gray-700 px-1">
          <span>Uploaded Videos ({videos.length})</span>
        </div>
        {videos.map((v) => (
          <div
            key={v.id}
            className="p-4 rounded-2xl bg-white border border-gray-200 shadow-sm space-y-3"
          >
            <div className="flex gap-3">
              <div className="w-24 h-16 rounded-xl overflow-hidden bg-gray-900 shrink-0">
                <img src={resolveMediaUrl(v.thumbnailUrl)} alt={v.title} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-bold text-gray-900 truncate">{v.title}</h3>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleOpenEditModal(v)}
                      className="p-1 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                      title="Edit Video"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteVideo(v.id, v.title)}
                      className="p-1 text-red-500 hover:bg-red-50 rounded-lg transition"
                      title="Delete Video"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-500 truncate mt-0.5">{v.facultyName}</p>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <span className="px-2 py-0.5 rounded bg-[#173B2F]/10 text-[#173B2F] font-bold text-[10px]">
                    {v.departmentCode} • {v.academicYear}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold text-[10px] inline-flex items-center gap-1 border border-blue-200">
                    <Eye className="w-3 h-3 text-blue-600" />
                    {(v.viewCount || 0).toLocaleString()} {v.viewCount === 1 ? 'view' : 'views'}
                  </span>
                  {v.studyMaterialUrl ? (
                    <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold text-[10px]">
                      Study Material Available
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-500 font-bold text-[10px]">
                      No Material
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop & Tablet Table (Hidden on Mobile) */}
      <div className="hidden sm:block overflow-x-auto rounded-3xl bg-white border border-gray-200 shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 font-bold uppercase tracking-wider text-[10px]">
            <tr>
              <th className="p-4">Lecture Title</th>
              <th className="p-4">Department & Year</th>
              <th className="p-4">Faculty</th>
              <th className="p-4">Views</th>
              <th className="p-4">Transcript</th>
              <th className="p-4">Study Material</th>
              <th className="p-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {videos.map((v) => (
              <tr key={v.id} className="hover:bg-gray-50/80">
                <td className="p-4 font-semibold text-[#17201C]">{v.title}</td>
                <td className="p-4">
                  <span className="px-2 py-0.5 rounded bg-[#173B2F]/10 text-[#173B2F] font-bold text-[10px]">
                    {v.departmentCode} • {v.academicYear}
                  </span>
                </td>
                <td className="p-4 font-mono text-gray-500">{v.facultyName}</td>
                <td className="p-4">
                  <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-bold text-[11px] inline-flex items-center gap-1 border border-blue-200">
                    <Eye className="w-3 h-3 text-blue-600" />
                    <span>{(v.viewCount || 0).toLocaleString()}</span>
                    <span className="text-[10px] text-blue-500 font-normal">{v.viewCount === 1 ? 'view' : 'views'}</span>
                  </span>
                </td>
                <td className="p-4">
                  {v.transcript && v.transcript.length > 0 ? (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[10px] inline-flex items-center gap-1 border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3" />
                      {v.transcript.length} Segments
                    </span>
                  ) : (
                    <span className="text-[10px] text-gray-400">None</span>
                  )}
                </td>
                <td className="p-4">
                  {v.studyMaterialUrl ? (
                    <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold text-[10px]">
                      Available
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-500 font-bold text-[10px]">
                      None
                    </span>
                  )}
                </td>
                <td className="p-4 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      onClick={() => handleOpenEditModal(v)}
                      className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition inline-flex items-center gap-1 cursor-pointer"
                      title="Edit Lecture"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteVideo(v.id, v.title)}
                      className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition inline-flex items-center gap-1 cursor-pointer"
                      title="Delete Lecture"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile-Friendly Upload Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col my-auto border border-gray-200 animate-in fade-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-base sm:text-lg font-black text-gray-900">
                  {editingVideo ? 'Edit Video Lecture' : 'Upload New Video Lecture'}
                </h2>
                <p className="text-[11px] text-gray-500">
                  {editingVideo
                    ? 'Modify video metadata, presenter, transcript, or replace media files'
                    : 'All uploaded videos appear instantly on the student dashboard'}
                </p>
              </div>
              <button 
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingVideo(null);
                }} 
                className="p-1.5 hover:bg-gray-100 text-gray-400 hover:text-gray-700 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Modal Form Body */}
            <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Video Topic Name *</label>
                <input
                  type="text"
                  required
                  value={topicName}
                  onChange={(e) => setTopicName(e.target.value)}
                  className="w-full p-2.5 border border-gray-200 rounded-xl text-xs bg-gray-50 focus:bg-white focus:border-[#173B2F] focus:outline-none transition"
                  placeholder="e.g. Introduction to Neural Networks"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Presented By *</label>
                <input
                  type="text"
                  required
                  value={presentedBy}
                  onChange={(e) => setPresentedBy(e.target.value)}
                  className="w-full p-2.5 border border-gray-200 rounded-xl text-xs bg-gray-50 focus:bg-white focus:border-[#173B2F] focus:outline-none transition"
                  placeholder="e.g. Dr. A. Smith CSE"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Department *</label>
                  <input
                    type="text"
                    required
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full p-2.5 border border-gray-200 rounded-xl text-xs bg-gray-50 focus:bg-white focus:border-[#173B2F] focus:outline-none transition"
                    placeholder="e.g. CSE"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Year *</label>
                  <input
                    type="text"
                    required
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    className="w-full p-2.5 border border-gray-200 rounded-xl text-xs bg-gray-50 focus:bg-white focus:border-[#173B2F] focus:outline-none transition"
                    placeholder="e.g. 2024-25"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-gray-700">
                    Video File {editingVideo ? '(Optional replacement)' : '*'}
                  </label>
                  {editingVideo && (
                    <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      Current Video Kept
                    </span>
                  )}
                </div>
                <input
                  type="file"
                  required={!editingVideo}
                  accept="video/*"
                  onChange={(e) => handleVideoFileChange(e.target.files?.[0] || null)}
                  className="w-full text-xs text-gray-500 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer"
                />
                {editingVideo && (
                  <p className="text-[10px] text-gray-400 mt-1">Leave empty to keep the existing video file intact.</p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-gray-700">
                    Thumbnail Image
                  </label>
                  {isAutoThumbnail ? (
                    <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                      <Sparkles className="w-2.5 h-2.5" /> 1st Second Captured
                    </span>
                  ) : editingVideo && !thumbnailFile ? (
                    <span className="text-[10px] text-blue-700 font-semibold bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                      Current Thumbnail Kept
                    </span>
                  ) : thumbnailFile ? (
                    <span className="text-[10px] text-blue-700 font-semibold bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                      Custom Image Selected
                    </span>
                  ) : (
                    <span className="text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                      Auto from video 1s
                    </span>
                  )}
                </div>

                {isGeneratingThumbnail && (
                  <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50/80 p-2.5 rounded-xl border border-emerald-200 mb-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                    <span>Extracting 1st second frame for thumbnail...</span>
                  </div>
                )}

                {thumbnailPreview && !isGeneratingThumbnail && (
                  <div className="mb-2 p-2 rounded-xl bg-gray-50 border border-gray-200 flex items-center gap-3">
                    <img
                      src={thumbnailPreview}
                      alt="Thumbnail preview"
                      className="w-20 h-12 object-cover rounded-lg border border-gray-200 shadow-sm shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 text-[11px] font-semibold text-gray-800">
                        {isAutoThumbnail && <Sparkles className="w-3 h-3 text-emerald-600 shrink-0" />}
                        <span>{isAutoThumbnail ? 'Auto 1-Second Thumbnail' : 'Thumbnail Image'}</span>
                      </div>
                      <p className="text-[10px] text-gray-500 truncate">
                        {thumbnailFile?.name || (isAutoThumbnail ? 'Captured from 1st second of video' : 'Current thumbnail image')}
                      </p>
                    </div>
                  </div>
                )}

                <input
                  type="file"
                  required={false}
                  accept="image/*"
                  onChange={(e) => handleThumbnailFileChange(e.target.files?.[0] || null)}
                  className="w-full text-xs text-gray-500 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  {videoFile
                    ? '1st second of your video is automatically set as thumbnail. You can optionally select a custom image.'
                    : editingVideo
                    ? 'Leave empty to keep current thumbnail, or select a new image / video.'
                    : 'When you select a video, its first second is automatically used as thumbnail.'}
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-gray-700">Study Materials (Optional)</label>
                  {editingVideo && editingVideo.studyMaterialUrl && (
                    <span className="text-[10px] text-purple-700 font-semibold bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                      Attached
                    </span>
                  )}
                </div>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.ppt,.pptx"
                  onChange={(e) => setStudyMaterial(e.target.files?.[0] || null)}
                  className="w-full text-xs text-gray-500 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100 cursor-pointer"
                />
              </div>

              {/* Lecture Transcript & Jump Points (Optional) */}
              <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-[#173B2F]" />
                    <label className="text-xs font-bold text-gray-800">
                      Transcript & Interactive Jump Points (Optional)
                    </label>
                  </div>
                  {transcriptChunks.length > 0 ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                      <CheckCircle2 className="w-3 h-3" />
                      {transcriptChunks.length} segments ready
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#173B2F] bg-emerald-100/80 px-2.5 py-0.5 rounded-full border border-emerald-300">
                      <Sparkles className="w-3 h-3 text-[#C49A55]" />
                      Automatic AI Transcript Enabled
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-gray-600 leading-relaxed">
                  Generate lecture jump points automatically with AI, or upload a subtitle file (<strong>.srt</strong>, <strong>.vtt</strong>, <strong>.txt</strong>, <strong>.json</strong>).
                </p>

                {/* 1-Click Auto-Generation Button */}
                <div>
                  <button
                    type="button"
                    onClick={handleAutoGenerateTranscript}
                    disabled={isGeneratingTranscript || !topicName.trim()}
                    className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-[#173B2F] via-[#285443] to-[#173B2F] hover:bg-right text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition active:scale-95 disabled:opacity-50 cursor-pointer"
                    title={!topicName.trim() ? "Enter Topic Name first to auto-generate" : "Auto-generate timestamp jump points"}
                  >
                    {isGeneratingTranscript ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#C49A55]" />
                        <span>Generating Transcript & Jump Points with AI...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-[#C49A55]" />
                        <span>✨ Auto-Generate Transcript & Jump Points (AI)</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="flex items-center gap-2 my-1">
                  <div className="h-px bg-amber-200/80 flex-1"></div>
                  <span className="text-[10px] uppercase font-bold text-amber-800/60 tracking-wider">or upload subtitle file</span>
                  <div className="h-px bg-amber-200/80 flex-1"></div>
                </div>

                {/* Subtitle File Input */}
                <div>
                  <input
                    type="file"
                    accept=".srt,.vtt,.txt,.json"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleTranscriptFileUpload(file);
                    }}
                    className="w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-[#173B2F]/10 file:text-[#173B2F] hover:file:bg-[#173B2F]/20 cursor-pointer"
                  />
                </div>

                {/* Toggle Manual Text Area */}
                <div>
                  <button
                    type="button"
                    onClick={() => setShowManualTranscript(!showManualTranscript)}
                    className="text-[11px] font-semibold text-[#173B2F] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>{showManualTranscript ? 'Hide manual text editor' : 'Or paste / edit transcript manually'}</span>
                    {showManualTranscript ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>

                  {showManualTranscript && (
                    <div className="mt-2 space-y-2">
                      <textarea
                        rows={4}
                        value={transcriptText}
                        onChange={(e) => handleTranscriptTextChange(e.target.value)}
                        placeholder="Paste subtitle content (SRT/VTT) or timestamped outline:&#10;[00:00] Introduction to Subject&#10;[01:30] Relational Schema Architecture&#10;[03:45] Normalization & 3NF Rules"
                        className="w-full p-2.5 text-xs font-mono rounded-xl bg-white border border-gray-300 focus:border-[#173B2F] focus:outline-none"
                      />
                      <p className="text-[10px] text-gray-500">
                        Supports SRT / WebVTT timestamps, <code>[MM:SS] Topic</code> outlines, or raw paragraphs.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingVideo(null);
                  }}
                  className="w-1/2 sm:w-auto px-4 py-2.5 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="w-1/2 sm:w-auto px-6 py-2.5 text-xs font-bold bg-[#173B2F] hover:bg-[#102a21] text-white rounded-xl shadow-md transition cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  {isUploading
                    ? (editingVideo ? 'Saving Changes...' : 'Uploading...')
                    : (editingVideo ? 'Save Changes' : 'Upload')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

