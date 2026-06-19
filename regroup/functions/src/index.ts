// Must be first: initializes the default Firebase app before any re-export
// transitively loads api/firestore.ts (which calls admin.firestore() at module
// load time). ES import hoisting guarantees this runs before the exports below.
import "./init";

// Callable functions — auth
export * from "./callable/auth";

// Callable functions — meetings
export * from "./callable/meetings";

// Callable functions — payments
export * from "./callable/payments";

// Callable functions — subscriptions (includes Stripe Connect account management,
// sendInviteEmails, sendConfirmationEmail)
export * from "./callable/subscriptions";

// Callable functions — Oxford House management
export * from "./callable/oxford";

// Callable functions — Invitations (server-issued invitation tokens)
export {
  createInvitation,
  peekInvitation,
  redeemInvitation,
} from "./callable/invitations";

// HTTP handlers
export * from "./http/stripeConnect";
export * from "./http/universal";

// Webhooks
// The deployed function name is `stripeEvents`; the module exports it as `stripeWebhook`.
export {
  stripeWebhook as stripeEvents,
  handleStripeConnectWebhook,
} from "./webhooks/stripeWebhook";

// Firestore triggers
export * from "./triggers/firestore";

// Scheduled functions
export * from "./scheduled";
