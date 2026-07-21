import { RenderMode, ServerRoute } from '@angular/ssr';

// The lab portal is auth-gated, so we render on the server per-request rather
// than prerendering at build time (which would execute authenticated data
// fetches with no logged-in session).
export const serverRoutes: ServerRoute[] = [
  {
    path: '**',
    renderMode: RenderMode.Server,
  },
];
