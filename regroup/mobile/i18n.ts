/**
 * i18next initialization.
 *
 * Hardened 2026-07-06: this file was imported by index.js (`import './i18n'`)
 * but never actually existed — the app's real entry point couldn't be
 * bundled by Metro at all without it, and react-i18next's useTranslation()
 * (used throughout the app) had no initialized i18next instance to read
 * from in a real (non-test) run.
 */
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./src/assets/i18n/en.json";
import sv from "./src/assets/i18n/sv.json";

i18next.use(initReactI18next).init({
  resources: { ...en, ...sv },
  lng: "en",
  fallbackLng: "en",
  compatibilityJSON: "v3",
  interpolation: {
    escapeValue: false,
  },
});

export default i18next;
