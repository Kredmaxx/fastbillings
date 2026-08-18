import { BRAND } from "@constants/brand";

/**
 * Tenant company logo for documents only (invoices, quotations, challans, etc.).
 * Returns null when unset — never fall back to Byzkon brand on customer docs.
 *
 * Do NOT use this for app chrome (sidebar, header, favicon, auth, marketing).
 * App chrome always uses BRAND.logos.* via BrandLogo / brandMark().
 */
export function resolveCompanyLogo(siteLogo?: string | null): string | null {
  return siteLogo?.trim() ? siteLogo : null;
}

/** Byzkon mark for product UI (sidebar collapsed, etc.). */
export function brandMark(): string {
  return `${BRAND.logos.mark}?v=12`;
}

/** Byzkon favicon for browser / product chrome. */
export function brandFavicon(): string {
  return `${BRAND.logos.favicon}?v=12`;
}
