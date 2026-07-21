/**
 * Portal routing helpers.
 *
 * PulseQ is a multi-portal app. A portal can be served two ways:
 *   1. On its own subdomain (e.g. lab.pulseq.com) -> routes live at the root.
 *   2. Nested under the main app (e.g. /staff/laboratory) -> routes are prefixed.
 *
 * Every internal link inside a portal MUST go through the matching <portal>Path()
 * helper so it resolves correctly in both modes (and under SSR). Do not hardcode
 * '/staff/laboratory/...' paths in components.
 */

export type PortalName =
  | 'laboratory'
  | 'pharmacy'
  | 'doctor'
  | 'reception'
  | 'admin'
  | 'main';

/** Nested fallback base path for each portal under the main app. */
const PORTAL_BASE: Record<Exclude<PortalName, 'main'>, string> = {
  laboratory: 'staff/laboratory',
  pharmacy: 'staff/pharmacy',
  doctor: 'staff/doctor',
  reception: 'staff/reception',
  admin: 'staff/admin',
};

/** Detect which portal is being served from the current host (SSR-safe). */
export function detectPortal(): PortalName {
  if (typeof window === 'undefined') {
    return 'main';
  }
  const host = window.location.hostname;
  if (host.startsWith('lab.') || host.includes('laboratory')) return 'laboratory';
  if (host.startsWith('pharm.') || host.includes('pharmacy')) return 'pharmacy';
  if (host.startsWith('doc.') || host.includes('doctor')) return 'doctor';
  if (host.startsWith('rec.') || host.includes('reception')) return 'reception';
  if (host.startsWith('admin.') || host.includes('admin')) return 'admin';
  return 'main';
}

/** True when the current portal is served on its own subdomain. */
export function isStandalonePortal(portal: PortalName): boolean {
  return detectPortal() === portal;
}

/** Generic path builder shared by every <portal>Path() helper. */
export function portalPath(portal: Exclude<PortalName, 'main'>, sub = ''): string {
  const base = isStandalonePortal(portal) ? '' : `/${PORTAL_BASE[portal]}`;
  if (!sub) return base || '/';
  return `${base}/${sub}`;
}

/** Laboratory portal path helper — use for every internal lab link. */
export function laboratoryPath(sub = ''): string {
  return portalPath('laboratory', sub);
}
