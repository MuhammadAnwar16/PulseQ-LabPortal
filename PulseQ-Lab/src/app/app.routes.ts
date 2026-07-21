import { Routes, UrlMatcher, UrlSegment, UrlSegmentGroup, Route } from '@angular/router';
import { authGuard } from './shared/guards/auth.guard';
import { detectPortal, laboratoryPath } from './shared/utils/portal-path.util';
import { laboratoryChildren } from './features/laboratory/laboratory.routes';

/**
 * Matches the root for the laboratory portal ONLY when served on its own
 * subdomain (detectPortal() === 'laboratory'). On the main domain the nested
 * /staff/laboratory route below is used instead.
 */
export function labStandaloneMatcher(
  segments: UrlSegment[],
  _group: UrlSegmentGroup,
  _route: Route,
): { consumed: UrlSegment[] } | null {
  if (detectPortal() === 'laboratory') {
    return { consumed: segments };
  }
  return null;
}

const dashboardRedirect = laboratoryPath('dashboard').replace(/^\//, '');

export const routes: Routes = [
  // Root redirect to the lab home (mode-aware).
  { path: '', redirectTo: dashboardRedirect, pathMatch: 'full' },

  // Nested fallback: portal reachable under /staff/laboratory on the main app.
  {
    path: 'staff/laboratory',
    loadComponent: () =>
      import('./features/laboratory/laboratory-layout/laboratory-layout.component').then(
        (m) => m.LaboratoryLayout,
      ),
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      ...laboratoryChildren,
    ],
  },

  // Standalone subdomain mode: same screens at the site root.
  {
    matcher: labStandaloneMatcher,
    loadComponent: () =>
      import('./features/laboratory/laboratory-layout/laboratory-layout.component').then(
        (m) => m.LaboratoryLayout,
      ),
    children: laboratoryChildren,
  },

  // Login (no sidebar) — both modes.
  {
    path: 'staff/laboratory/auth/login',
    loadComponent: () =>
      import('./features/laboratory/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'auth/login',
    loadComponent: () =>
      import('./features/laboratory/auth/login.component').then((m) => m.LoginComponent),
  },
];
