/** Backend API base URL. Dynamically uses live Render URL in production or localhost in dev. */
export const API_BASE = (typeof window !== 'undefined' && (window as any).__ENV__?.API_BASE)
  ? (window as any).__ENV__.API_BASE
  : (typeof window !== 'undefined' && !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1'))
    ? 'https://lab-portal-backend.onrender.com/api/v1'
    : 'http://localhost:8123/api/v1';
