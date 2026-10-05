/**
 * Video Thumbnail Extractor
 * Automatically captures a high-resolution frame from the first second of a video file
 * using HTML5 Video and Canvas APIs, returning both a standard File object and a Data URL.
 */

export interface VideoThumbnailResult {
  file: File;
  dataUrl: string;
  durationSeconds: number;
}

/**
 * Extracts a frame from the first second (default 1.0s) of a video file or URL.
 *
 * @param videoInput - File object or string URL of the video
 * @param targetTimeSeconds - The timestamp to capture (defaults to 1.0s)
 * @returns Promise<{ file: File, dataUrl: string, durationSeconds: number }>
 */
export const captureVideoFrameAtFirstSecond = (
  videoInput: File | string,
  targetTimeSeconds = 1.0
): Promise<VideoThumbnailResult> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');

    let objectUrl = '';
    let fileName = 'thumbnail_1s.jpg';

    if (typeof videoInput === 'string') {
      video.crossOrigin = 'anonymous';
    } else {
      objectUrl = URL.createObjectURL(videoInput);
      const baseName = videoInput.name.replace(/\.[^/.]+$/, '');
      fileName = `${baseName}_thumb_1s.jpg`;
    }

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      video.removeAttribute('src');
      video.load();
    };

    // Safety timeout after 12 seconds to prevent hanging
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('Video frame extraction timed out after 12 seconds'));
    }, 12000);

    const onSeeked = () => {
      clearTimeout(timeoutId);
      try {
        const width = video.videoWidth || 640;
        const height = video.videoHeight || 360;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          cleanup();
          reject(new Error('Canvas 2D context not available'));
          return;
        }

        ctx.drawImage(video, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.90);

        canvas.toBlob(
          (blob) => {
            const rawDuration = video.duration;
            const durationSeconds =
              rawDuration && !isNaN(rawDuration) && rawDuration > 0
                ? Math.round(rawDuration)
                : 240;

            cleanup();
            if (blob) {
              const file = new File([blob], fileName, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
              resolve({
                file,
                dataUrl,
                durationSeconds,
              });
            } else {
              reject(new Error('Failed to generate image blob from video frame canvas'));
            }
          },
          'image/jpeg',
          0.90
        );
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    let hasSeeked = false;
    const triggerSeek = () => {
      if (hasSeeked) return;
      hasSeeked = true;
      const duration = video.duration;
      let seekTime = targetTimeSeconds;
      if (duration && !isNaN(duration) && duration > 0) {
        // If the video is shorter than the target timestamp, seek halfway or at 0.05s
        if (duration <= targetTimeSeconds) {
          seekTime = Math.max(0.05, duration / 2);
        }
      }

      video.addEventListener('seeked', onSeeked, { once: true });
      if (Math.abs(video.currentTime - seekTime) < 0.05) {
        onSeeked();
      } else {
        video.currentTime = seekTime;
      }
    };

    video.addEventListener('loadeddata', triggerSeek, { once: true });
    video.addEventListener('loadedmetadata', triggerSeek, { once: true });
    video.addEventListener('canplay', triggerSeek, { once: true });
    video.addEventListener('error', () => {
      clearTimeout(timeoutId);
      cleanup();
      reject(new Error('Failed to decode video for thumbnail capture'));
    }, { once: true });

    // Set source AFTER attaching listeners and call load() to initiate media pipeline
    if (typeof videoInput === 'string') {
      video.src = videoInput;
    } else {
      video.src = objectUrl;
    }
    video.load();

    // Check if video is already ready
    if (video.readyState >= 2) {
      triggerSeek();
    }
  });
};
