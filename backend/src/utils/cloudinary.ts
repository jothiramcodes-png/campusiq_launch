import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';
dotenv.config();

const cloudName = process.env.CLOUDINARY_CLOUD_NAME || 'ztuchlmk';
const apiKey = process.env.CLOUDINARY_API_KEY || '135743747348255';
const apiSecret = process.env.CLOUDINARY_API_SECRET || 'jqAgMPYqFSf2g-ulW5MmCbY3IFA';

export let isCloudinaryConfigured = false;

if (cloudName && apiKey && apiSecret) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
  isCloudinaryConfigured = true;
  console.log(`☁️ [Cloudinary] Initialized with cloud: ${cloudName}`);
}

export { cloudinary };

export const uploadVideoToCloudinary = async (
  filePath: string,
  publicId?: string
): Promise<{ url: string; duration?: number }> => {
  if (!isCloudinaryConfigured) {
    throw new Error('Cloudinary credentials are not configured in environment variables.');
  }

  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_large(
      filePath,
      {
        resource_type: 'video',
        folder: 'campusiq_videos',
        public_id: publicId,
        overwrite: true,
        chunk_size: 6000000, // 6MB chunks
      },
      (error: any, result: any) => {
        if (error) {
          return reject(new Error(error.message || JSON.stringify(error)));
        }
        if (!result) {
          return reject(new Error('Cloudinary upload returned empty result'));
        }
        resolve({
          url: result.secure_url,
          duration: typeof result.duration === 'number' ? Math.round(result.duration) : undefined,
        });
      }
    );
  });
};
