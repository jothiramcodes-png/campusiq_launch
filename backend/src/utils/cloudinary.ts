import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';
dotenv.config();

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

export const isCloudinaryConfigured = Boolean(cloudName && apiKey && apiSecret);

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
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

  const result = await cloudinary.uploader.upload(filePath, {
    resource_type: 'video',
    folder: 'campusiq_videos',
    public_id: publicId,
    overwrite: true,
  });

  return {
    url: result.secure_url,
    duration: typeof result.duration === 'number' ? Math.round(result.duration) : undefined,
  };
};
