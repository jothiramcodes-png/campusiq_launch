// Centralized API configuration for CampusIQ
// Supports local dev proxy as well as Vercel-deployed frontend pointing to Render/Railway backend
const rawApiUrl = (import.meta.env.VITE_API_URL as string | undefined) || '';
export const API_BASE_URL = rawApiUrl.replace(/\/+$/, '');

export const getApiUrl = (endpoint: string): string => {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${API_BASE_URL}${cleanEndpoint}`;
};

export const resolveMediaUrl = (url?: string): string => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  const clean = url.startsWith('/') ? url : `/${url}`;
  return `${API_BASE_URL}${clean}`;
};
