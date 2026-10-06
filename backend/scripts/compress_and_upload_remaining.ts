import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import { DatabaseSync } from 'node:sqlite';

dotenv.config({ path: path.join(__dirname, '../.env') });
import { uploadVideoToCloudinary } from '../src/utils/cloudinary';

// @ts-ignore
import ffmpegStatic from 'ffmpeg-static';

async function main() {
  console.log('🎬 [Compress & Upload] Starting compression & Cloudinary sync for >100MB videos...');
  console.log('FFmpeg binary:', ffmpegStatic);

  const seedBackend = path.join(__dirname, '../src/data/seedVideos.json');
  const seedFrontend = path.join(__dirname, '../../src/data/seedVideos.json');
  const sqlitePath = path.join(__dirname, '../data/campusiq.sqlite');

  const videos: any[] = JSON.parse(fs.readFileSync(seedBackend, 'utf8'));

  let sqliteDb: DatabaseSync | null = null;
  if (fs.existsSync(sqlitePath)) {
    try {
      sqliteDb = new DatabaseSync(sqlitePath);
    } catch (_) {}
  }

  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];
    if (v.local_video_path && v.local_video_path.startsWith('https://res.cloudinary.com')) {
      continue;
    }

    console.log(`\n▶️ Processing: "${v.title}" (${v.id})`);
    const originalPath = path.join(__dirname, '..', v.local_video_path);
    if (!fs.existsSync(originalPath)) {
      console.warn(`File not found: ${originalPath}`);
      continue;
    }

    const originalSizeMB = (fs.statSync(originalPath).size / (1024 * 1024)).toFixed(1);
    console.log(`Original size: ${originalSizeMB} MB`);

    const tempDir = path.join(__dirname, '../../temp_enc');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const compressedPath = path.join(tempDir, `${v.id}_compressed.mp4`);

    console.log('⚡ Compressing with FFmpeg (H.264 CRF 28)...');
    const cmd = `"${ffmpegStatic}" -y -i "${originalPath}" -c:v libx264 -crf 28 -preset fast -c:a aac -b:a 128k -movflags +faststart "${compressedPath}"`;
    execSync(cmd, { stdio: 'inherit' });

    const newSizeMB = (fs.statSync(compressedPath).size / (1024 * 1024)).toFixed(1);
    console.log(`✅ Compressed size: ${newSizeMB} MB (Saved ${((1 - Number(newSizeMB) / Number(originalSizeMB)) * 100).toFixed(0)}%)`);

    console.log(`☁️ Uploading to Cloudinary...`);
    const res = await uploadVideoToCloudinary(compressedPath, v.id);
    console.log(`🎉 Cloudinary URL: ${res.url}`);

    v.local_video_path = res.url;
    if (res.duration && res.duration > 0) {
      v.duration_seconds = res.duration;
    }

    // Clean up temp compressed file
    try {
      fs.unlinkSync(compressedPath);
    } catch (_) {}

    // Update SQLite
    if (sqliteDb) {
      try {
        sqliteDb.prepare('UPDATE videos SET local_video_path = ? WHERE id = ?').run(res.url, v.id);
      } catch (_) {}
    }

    // Save JSON incrementally
    fs.writeFileSync(seedBackend, JSON.stringify(videos, null, 2));
    if (fs.existsSync(path.dirname(seedFrontend))) {
      fs.writeFileSync(seedFrontend, JSON.stringify(videos, null, 2));
    }
    console.log(`💾 Saved "${v.title}" to seed files!`);
  }

  console.log('\n=======================================================');
  console.log('🎉 ALL REMAINING VIDEOS COMPRESSED AND UPLOADED SUCCESSFULLY!');
  console.log('=======================================================');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
