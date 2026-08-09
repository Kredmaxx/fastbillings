const ADMIN_ROOT = '/admin';

const ACTION_SEGMENTS = new Set([
  'new',
  'edit',
  'view',
  'email',
  'create',
  'create-invoice',
  'edit-invoice',
  'statement',
]);

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function isDynamicSegment(segment: string): boolean {
  return (
    /^[0-9a-f]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}$/i.test(segment) ||
    /^[0-9a-f-]{20,}$/i.test(segment) ||
    /^\d+$/.test(segment)
  );
}

export function shouldShowPageBack(pathname: string): boolean {
  return normalizePath(pathname) !== ADMIN_ROOT;
}

export function getBackFallbackPath(pathname: string): string {
  const normalized = normalizePath(pathname);
  if (normalized === ADMIN_ROOT) return ADMIN_ROOT;

  const relative = normalized.replace(/^\/admin\/?/, '');
  const segments = relative.split('/').filter(Boolean);
  if (segments.length === 0) return ADMIN_ROOT;

  while (segments.length > 0) {
    const last = segments[segments.length - 1];
    if (isDynamicSegment(last) || ACTION_SEGMENTS.has(last)) {
      segments.pop();
      continue;
    }
    break;
  }

  if (segments.length === 0) return ADMIN_ROOT;

  if (segments[0] === 'menus') return ADMIN_ROOT;
  if (segments[0] === 'dashboard') return ADMIN_ROOT;
  if (segments[0] === 'settings') return '/admin/menus/settings';
  if (segments[0] === 'accounting' && segments[1] === 'reports') {
    return '/admin/menus/accounting';
  }
  if (segments[0] === 'reports') return '/admin/menus/reports';

  const fallback = `/admin/${segments.join('/')}`;
  return fallback === normalized ? ADMIN_ROOT : fallback;
}

export function canNavigateBack(): boolean {
  const idx = (window.history.state as { idx?: number } | null)?.idx;
  return typeof idx === 'number' && idx > 0;
}

export { ADMIN_ROOT };
