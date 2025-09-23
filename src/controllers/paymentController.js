// src/controllers/paymentController.js
const { stripe, STRIPE_CONFIG } = require('../config/stripe');
const activityLogger = require('../utils/activityLogger');

// Validation helper functions
const validateAmount = (amount) => {
  if (!amount || !Number.isInteger(amount) || amount < STRIPE_CONFIG.minAmount) {
    throw new Error(`Amount must be an integer >= ${STRIPE_CONFIG.minAmount} cents`);
  }
  if (amount > STRIPE_CONFIG.maxAmount) {
    throw new Error(`Amount cannot exceed ${STRIPE_CONFIG.maxAmount} cents`);
  }
  return true;
};

const validateCurrency = (currency) => {
  const supportedCurrencies = ['usd', 'eur', 'gbp', 'cad', 'aud', 'jpy'];
  if (currency && !supportedCurrencies.includes(currency.toLowerCase())) {
    throw new Error(`Currency must be one of: ${supportedCurrencies.join(', ')}`);
  }
  return true;
};

const validateEmail = (email) => {
  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('Invalid email format');
    }
  }
  return true;
};

// @desc    Create payment intent
// @route   POST /api/payments/create-payment-intent
// @access  Public (adjust based on your auth requirements)
const createPaymentIntent = async (req, res) => {
  try {
    console.log('=== CREATE PAYMENT INTENT DEBUG ===');
    console.log('Request body:', req.body);
    console.log('Stripe config:', {
      hasKey: !!process.env.STRIPE_SECRET_KEY,
      keyPrefix: process.env.STRIPE_SECRET_KEY?.substring(0, 7),
      defaultCurrency: STRIPE_CONFIG.currency
    });

    const { amount, currency = STRIPE_CONFIG.currency, customerEmail, metadata = {} } = req.body;

    console.log('Parsed values:', { amount, currency, customerEmail, metadata });

    // Validation
    console.log('Starting validation...');
    validateAmount(amount);
    console.log('Amount validation passed');
    validateCurrency(currency);
    console.log('Currency validation passed');
    validateEmail(customerEmail);
    console.log('Email validation passed');

    // Prepare payment intent data
    const paymentIntentData = {
      amount: amount,
      currency: currency.toLowerCase(),
      automatic_payment_methods: STRIPE_CONFIG.automaticPaymentMethods,
      metadata: {
        ...metadata,
        created_at: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
      }
    };

    // Add customer email if provided
    if (customerEmail) {
      paymentIntentData.receipt_email = customerEmail;
    }

    // Add tenant information if user is authenticated
    if (req.user && req.user.tenant) {
      paymentIntentData.metadata.tenant_id = req.user.tenant._id.toString();
      paymentIntentData.metadata.user_id = req.user._id.toString();
    }

    // Create payment intent with Stripe
    console.log('Creating Stripe payment intent with data:', paymentIntentData);
    const paymentIntent = await stripe.paymentIntents.create(paymentIntentData);
    console.log('Stripe payment intent created successfully:', paymentIntent.id);

    // Log payment intent creation
    const logData = {
      action: 'payment_intent_created',
      paymentIntentId: paymentIntent.id,
      amount: amount,
      currency: currency,
      customerEmail: customerEmail || null,
      tenantId: req.user?.tenant?._id || null,
      userId: req.user?._id || null
    };

    if (req.user && req.user.tenant) {
      await activityLogger.log(
        req.user.tenant._id,
        req.user._id,
        'payment',
        'Payment intent created',
        logData
      );
    }

    console.log('Payment intent created:', {
      id: paymentIntent.id,
      amount: amount,
      currency: currency,
      status: paymentIntent.status
    });

    res.status(200).json({
      success: true,
      data: {
        client_secret: paymentIntent.client_secret,
        payment_intent_id: paymentIntent.id,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        status: paymentIntent.status
      }
    });

  } catch (error) {
    console.error('=== PAYMENT INTENT ERROR ===');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Stripe error type:', error.type);
    console.error('Stripe error code:', error.code);
    console.error('Full error object:', error);

    // Handle Stripe-specific errors
    if (error.type === 'StripeCardError') {
      return res.status(400).json({
        success: false,
        error: 'card_error',
        message: error.message
      });
    }

    if (error.type === 'StripeInvalidRequestError') {
      return res.status(400).json({
        success: false,
        error: 'invalid_request',
        message: error.message
      });
    }

    if (error.type === 'StripeAPIError') {
      return res.status(500).json({
        success: false,
        error: 'stripe_api_error',
        message: 'Something went wrong with payment processing'
      });
    }

    // Handle validation errors
    if (error.message.includes('Amount') || error.message.includes('Currency') || error.message.includes('email')) {
      return res.status(400).json({
        success: false,
        error: 'validation_error',
        message: error.message
      });
    }

    // Generic error
    res.status(500).json({
      success: false,
      error: 'internal_error',
      message: 'An unexpected error occurred'
    });
  }
};

// @desc    Confirm payment (optional endpoint for logging/tracking)
// @route   POST /api/payments/confirm-payment
// @access  Public (adjust based on your auth requirements)
const confirmPayment = async (req, res) => {
  try {
    const { payment_intent_id, status, metadata = {} } = req.body;

    if (!payment_intent_id) {
      return res.status(400).json({
        success: false,
        error: 'validation_error',
        message: 'Payment intent ID is required'
      });
    }

    // Retrieve the payment intent from Stripe to verify
    const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);

    // Log payment confirmation
    const logData = {
      action: 'payment_confirmed',
      paymentIntentId: payment_intent_id,
      stripeStatus: paymentIntent.status,
      reportedStatus: status,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      metadata: metadata
    };

    if (req.user && req.user.tenant) {
      await activityLogger.log(
        req.user.tenant._id,
        req.user._id,
        'payment',
        `Payment ${paymentIntent.status}`,
        logData
      );
    }

    console.log('Payment confirmation logged:', {
      id: payment_intent_id,
      status: paymentIntent.status,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency
    });

    res.status(200).json({
      success: true,
      data: {
        payment_intent_id: paymentIntent.id,
        status: paymentIntent.status,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        created: paymentIntent.created
      },
      message: 'Payment confirmation logged successfully'
    });

  } catch (error) {
    console.error('Error confirming payment:', error);

    if (error.type === 'StripeInvalidRequestError') {
      return res.status(404).json({
        success: false,
        error: 'payment_not_found',
        message: 'Payment intent not found'
      });
    }

    res.status(500).json({
      success: false,
      error: 'internal_error',
      message: 'Failed to confirm payment'
    });
  }
};

// @desc    Get payment intent details
// @route   GET /api/payments/payment-intent/:id
// @access  Public (adjust based on your auth requirements)
const getPaymentIntent = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'validation_error',
        message: 'Payment intent ID is required'
      });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(id);

    res.status(200).json({
      success: true,
      data: {
        id: paymentIntent.id,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        status: paymentIntent.status,
        created: paymentIntent.created,
        metadata: paymentIntent.metadata
      }
    });

  } catch (error) {
    console.error('Error retrieving payment intent:', error);

    if (error.type === 'StripeInvalidRequestError') {
      return res.status(404).json({
        success: false,
        error: 'payment_not_found',
        message: 'Payment intent not found'
      });
    }

    res.status(500).json({
      success: false,
      error: 'internal_error',
      message: 'Failed to retrieve payment intent'
    });
  }
};

// @desc    Debug Stripe configuration
// @route   GET /api/payments/debug
// @access  Public (remove in production)
const debugStripeConfig = async (req, res) => {
  try {
    const hasStripeKey = !!process.env.STRIPE_SECRET_KEY;
    const keyPrefix = process.env.STRIPE_SECRET_KEY ? process.env.STRIPE_SECRET_KEY.substring(0, 7) : 'NOT_SET';

    res.status(200).json({
      success: true,
      debug: {
        hasStripeKey: hasStripeKey,
        keyPrefix: keyPrefix,
        environment: process.env.NODE_ENV || 'development',
        currency: process.env.STRIPE_DEFAULT_CURRENCY || 'usd',
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
};

module.exports = {
  createPaymentIntent,
  confirmPayment,
  getPaymentIntent,
  debugStripeConfig
};