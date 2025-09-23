// src/routes/index.js
const express = require('express');
const router = express.Router();

// Import route files
const authRoutes = require('./authRoutes');
const adminRoutes = require('./adminRoutes');
const teacherRoutes = require('./teacherRoutes');
const parentRoutes = require('./parentRoutes');
const commonRoutes = require('./commonRoutes');
const superAdminRoutes = require('./superAdminRoutes');
const hifzRoutes = require('./hifzRoutes');
const paymentRoutes = require('./paymentRoutes');


// Mount routes
router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/teacher', teacherRoutes);
router.use('/parent', parentRoutes);
router.use('/superadmin', superAdminRoutes);
router.use('/', commonRoutes);
router.use('/hifz', hifzRoutes); // Common routes for all authenticated users
router.use('/payments', paymentRoutes); // Payment processing routes

module.exports = router;