// src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const {
  registerTenant,
  login,
  getMe,
  logout,
  updatePassword
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { updateFCMToken, removeFCMToken } = require('../controllers/authController');

// Public routes
router.post('/register-tenant', registerTenant);
router.post('/login', login);
router.post('/fcm-token', protect, updateFCMToken);
router.delete('/fcm-token', protect, removeFCMToken);

// Protected routes
router.get('/me', protect, getMe);
router.get('/logout', protect, logout);
router.put('/updatepassword', protect, updatePassword);

module.exports = router;