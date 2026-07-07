/**
 * Hardened 2026-07-06: this barrel file was imported by title-bar-right-
 * button, rats-logo, and MeetingResultsList (`from '../../../assets'`) but
 * never actually existed — Metro couldn't resolve the import at all, so any
 * bundle reaching these files would fail.
 */
export const placeholderUserIcon = require("./images/placeholder-icon.jpg");
export const circleLogo = require("./logo/RATSLogoCircle.png");
export const appIcon = require("./logo/AppIcon.png");
export const aaLogo = require("./fellowship/AALogo.png");
export const naLogo = require("./fellowship/NALogo.png");
export const crLogo = require("./fellowship/CRLogo.png");
