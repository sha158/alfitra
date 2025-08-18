// src/routes/commonRoutes.js
const express = require('express');
const router = express.Router();
const {
  getMyNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getAnnouncements
} = require('../controllers/notificationController');
const { protect } = require('../middleware/auth');
const { ensureTenant } = require('../middleware/tenantCheck');

// All routes require authentication
router.use(protect);
router.use(ensureTenant);

// Notification routes
router.get('/notifications/my', getMyNotifications);
router.put('/notifications/:id/read', markNotificationAsRead);
router.put('/notifications/read-all', markAllNotificationsAsRead);

// Announcement routes
router.get('/announcements', getAnnouncements);

module.exports = router;