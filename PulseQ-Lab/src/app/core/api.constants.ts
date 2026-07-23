/** Backend API base URL. Replace with your deployed Render URL in production (e.g. 'https://your-backend.onrender.com/api/v1') or pass via window.__ENV__.API_BASE */
export const API_BASE = (typeof window !== 'undefined' && (window as any).__ENV__?.API_BASE)
  ? (window as any).__ENV__.API_BASE
  : 'http://localhost:8123/api/v1';
