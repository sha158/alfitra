// src/config/stripe.js
const Stripe = require('stripe');

// Initialize Stripe with secret key from environment variables
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Stripe configuration constants
const STRIPE_CONFIG = {
  currency: process.env.STRIPE_DEFAULT_CURRENCY || 'usd',
  automaticPaymentMethods: {
    enabled: true,
  },
  // Maximum amount in cents (adjust as needed)
  maxAmount: 100000000, // $1,000,000 in cents
  minAmount: 50, // $0.50 in cents
};

// Validate Stripe configuration
const validateStripeConfig = () => {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY environment variable is required');
  }

  if (!process.env.STRIPE_SECRET_KEY.startsWith('sk_test_') && !process.env.STRIPE_SECRET_KEY.startsWith('sk_live_')) {
    throw new Error('Invalid Stripe secret key format');
  }

  console.log('Stripe configured successfully with key:',
    process.env.STRIPE_SECRET_KEY.startsWith('sk_test_') ? 'TEST MODE' : 'LIVE MODE'
  );
};

module.exports = {
  stripe,
  STRIPE_CONFIG,
  validateStripeConfig
};