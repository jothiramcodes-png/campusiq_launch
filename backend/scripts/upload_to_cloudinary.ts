import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { DatabaseSync } from 'node:sqlite';

// Load environment from backend/.env
dotenv.config({ path: path.join(__dirname, '../.env') });

import { uploadVideoToCloudinary, isCloudinaryConfigured } from '../src/utils/cloudinary';

async function run() {
  console.log('=======================================================');
  console.log(' CAMPUSIQ: Cloudinary Video Batch Sync Tool');
  console.log('=======================================================');

  if (!isCloudinaryConfigured) {
    console.error('❌ Error: Cloudinary is not configured!');
    console.error('Please add your Cloudinary credentials to backend/.env:');
    console.error('  CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@ztuchlmk');
    console.error('or:');
    console.error('  CLOUDINARY_CLOUD_NAME=ztuchlmk');
    console.error('  CLOUDINARY_API_KEY=<your_api_key>');
    console.error('  CLOUDINARY_API_SECRET=<your_api_secret>');
    console.error('\nCopy the API key & Secret from: https://cloudinary.com/console');
    process.exit(1);
  }

  const seedPathBackend = path.join(__dirname, '../src/data/seedVideos.json');
  const seedPathFrontend = path.join(__dirname, '../../src/data/seedVideos.json');
  const sqlitePath = path.join(__dirname, '../data/campusiq.sqlite');

  if (!fs.existsSync(seedPathBackend)) {
    console.error('❌ seedVideos.json not found at:', seedPathBackend);
    process.exit(1);
  }

  const rawVideos = fs.readFileSync(seedPathBackend, 'utf8');
  const videos: any[] = JSON.parse(rawVideos);

  let sqliteDb: DatabaseSync | null = null;
  if (fs.existsSync(sqlitePath)) {
    try {
      sqliteDb = new DatabaseSync(sqlitePath);
      console.log('📁 Local SQLite database connected for updates.');
    } catch (err: any) {
      console.warn('⚠️ Could not open SQLite database:', err.message);
    }
  }

  console.log(`\nFound ${videos.length} video lectures in seed database.\n`);

  let updatedCount = 0;
  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];
    const prefix = `[${i + 1}/${videos.length}] "${v.title}" (${v.id}):`;

    if (v.local_video_path && v.local_video_path.startsWith('https://res.cloudinary.com')) {
      console.log(`${prefix} Already on Cloudinary! ⏩`);
      continue;
    }

    if (!v.local_video_path) {
      console.log(`${prefix} No local video file path, skipping. ⏩`);
      continue;
    }

    const localFilePath = path.join(__dirname, '..', v.local_video_path);
    if (!fs.existsSync(localFilePath)) {
      console.warn(`${prefix} Local file not found: ${localFilePath} ⚠️`);
      continue;
    }

    const fileSizeMB = (fs.statSync(localFilePath).size / (1024 * 1024)).toFixed(1);
    console.log(`${prefix} Uploading ${fileSizeMB} MB to Cloudinary... ☁️`);

    try {
      const res = await uploadVideoToCloudinary(localFilePath, v.id);
      v.local_video_path = res.url;
      if (res.duration && res.duration > 0) {
        v.duration_seconds = res.duration;
      }
      console.log(`   ✅ Success! Cloudinary URL: ${res.url}`);

      // Update SQLite if open
      if (sqliteDb) {
        try {
          sqliteDb.prepare('UPDATE videos SET local_video_path = ? WHERE id = ?').run(res.url, v.id);
        } catch (_) {}
      }

      // Save files incrementally so progress is never lost
      fs.writeFileSync(seedPathBackend, JSON.stringify(videos, null, 2));
      if (fs.existsSync(path.dirname(seedPathFrontend))) {
        fs.writeFileSync(seedPathFrontend, JSON.stringify(videos, null, 2));
      }

      updatedCount++;
    } catch (err: any) {
      console.error(`   ❌ Failed to upload: ${err.message}`);
    }
  }

  console.log('\n=======================================================');
  console.log(`Summary: Uploaded ${updatedCount} videos to Cloudinary!`);

  if (updatedCount > 0) {
    fs.writeFileSync(seedPathBackend, JSON.stringify(videos, null, 2));
    if (fs.existsSync(path.dirname(seedPathFrontend))) {
      fs.writeFileSync(seedPathFrontend, JSON.stringify(videos, null, 2));
    }
    console.log('✅ Updated seedVideos.json in backend and frontend.');
    console.log('Next step: Commit and push changes to GitHub so Render deploys them!');
  }
  console.log('=======================================================');
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
