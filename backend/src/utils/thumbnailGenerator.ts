import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const uploadsBase = path.join(__dirname, '../../uploads');
const pythonScriptPath = path.join(__dirname, '../../extract_single_thumb.py');

/**
 * Extracts the 1st second frame from a video file on disk using OpenCV (Python)
 * and saves it into the uploads/thumbnails directory.
 * Returns the relative URL path (e.g. '/uploads/thumbnails/<filename>') or null on error.
 */
export const extract1sThumbnail = (videoDiskPath: string): string | null => {
  try {
    const thumbsDir = path.join(uploadsBase, 'thumbnails');
    if (!fs.existsSync(thumbsDir)) {
      fs.mkdirSync(thumbsDir, { recursive: true });
    }

    const videoFilename = path.basename(videoDiskPath);
    const baseName = path.parse(videoFilename).name;
    const thumbFilename = `${baseName}_1s_thumb.jpg`;
    const outThumbDiskPath = path.join(thumbsDir, thumbFilename);

    execSync(`python "${pythonScriptPath}" "${videoDiskPath}" "${outThumbDiskPath}"`, {
      stdio: 'pipe',
      timeout: 10000,
    });

    if (fs.existsSync(outThumbDiskPath)) {
      return `/uploads/thumbnails/${thumbFilename}`;
    }
  } catch (err) {
    console.warn('[thumbnailGenerator] Frame extraction failed:', err);
  }
  return null;
};
