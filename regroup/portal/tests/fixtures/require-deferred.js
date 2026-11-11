// A CommonJS require of a deferred module, the way ResidentPayment loads Stripe.
const stripe = require('@stripe/stripe-react-native');
export const feature = stripe.initStripe;
