// Centralized API configuration for CampusIQ
// Supports local dev proxy as well as Vercel-deployed frontend pointing to Render/Railway backend
const rawApiUrl = (import.meta.env.VITE_API_URL as string | undefined) || '';
export const API_BASE_URL = rawApiUrl.replace(/\/+$/, '');

export const getApiUrl = (endpoint: string): string => {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${API_BASE_URL}${cleanEndpoint}`;
};
