/**
 * useBranding — hook that returns current branding or defaults.
 *
 * Re-exports the BrandingContext consumer hook for convenience.
 * Usage:
 *   const { primaryColor, accentColor, orgName, logoUrl } = useBranding();
 */
export { useBranding } from '../context/BrandingContext';
export type { BrandingConfig } from '../context/BrandingContext';
export { DEFAULT_BRANDING } from '../context/BrandingContext';
