declare module '@env' {
  export const GOOGLE_MAPS_API_KEY: string;
  // No Stripe SECRET/RESTRICTED key belongs in a mobile bundle — only the
  // publishable key. STRIPE_TEST_SECRET_KEY was declared but never imported;
  // removed so it can't be wired into the client by accident.
  export const STRIPE_TEST_PUBLISHABLE_KEY: string;
}
