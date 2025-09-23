// src/routes/paymentRoutes.js
const express = require('express');
const router = express.Router();
const {
  createPaymentIntent,
  confirmPayment,
  getPaymentIntent
} = require('../controllers/paymentController');

// Optional: Add authentication middleware
// Uncomment these lines if you want to require authentication for payment endpoints
// const { protect } = require('../middleware/auth');
// const { ensureTenant } = require('../middleware/tenantCheck');

// For public access (recommended for payment processing)
// If you need authentication, uncomment the middleware above and apply to specific routes

// @route   POST /api/payments/create-payment-intent
// @desc    Create a payment intent for processing
// @access  Public (or Private if auth middleware is enabled)
router.post('/create-payment-intent', createPaymentIntent);

// @route   POST /api/payments/confirm-payment
// @desc    Log payment confirmation (optional)
// @access  Public (or Private if auth middleware is enabled)
router.post('/confirm-payment', confirmPayment);

// @route   GET /api/payments/payment-intent/:id
// @desc    Get payment intent details
// @access  Public (or Private if auth middleware is enabled)
router.get('/payment-intent/:id', getPaymentIntent);

// Example of how to add authentication to specific routes:
// router.post('/create-payment-intent', protect, ensureTenant, createPaymentIntent);
// router.post('/confirm-payment', protect, ensureTenant, confirmPayment);
// router.get('/payment-intent/:id', protect, ensureTenant, getPaymentIntent);

module.exports = router;