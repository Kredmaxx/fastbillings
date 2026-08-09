const PLATFORM_ROOT = '/dashboard';

const ACTION_SEGMENTS = new Set(['new', 'edit']);

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function isDynamicSegment(segment: string): boolean {
  return (
    /^[0-9a-f]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}$/i.test(segment) ||
    /^\d+$/.test(segment)
  );
}

export function shouldShowPageBack(pathname: string): boolean {
  return normalizePath(pathname) !== PLATFORM_ROOT;
}

export function getBackFallbackPath(pathname: string): string {
  const normalized = normalizePath(pathname);
  if (normalized === PLATFORM_ROOT) return PLATFORM_ROOT;

  const segments = normalized.split('/').filter(Boolean);
  if (segments.length === 0) return PLATFORM_ROOT;

  while (segments.length > 0) {
    const last = segments[segments.length - 1];
    if (isDynamicSegment(last) || ACTION_SEGMENTS.has(last)) {
      segments.pop();
      continue;
    }
    break;
  }

  if (segments.length === 0) return PLATFORM_ROOT;
  const fallback = `/${segments.join('/')}`;
  return fallback === normalized ? PLATFORM_ROOT : fallback;
}

export function canNavigateBack(): boolean {
  const idx = (window.history.state as { idx?: number } | null)?.idx;
  return typeof idx === 'number' && idx > 0;
}
