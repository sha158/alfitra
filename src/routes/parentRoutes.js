// src/routes/parentRoutes.js
const express = require('express');
const router = express.Router();
const {
  getMyChildren,
  getTodaysHomework,
  getChildHomework,
  trackChildFees,
  applyLeave,
  getLeaveHistory,
  getChildNotes,
  getChildAttendance,
  getFeeReceipts
} = require('../controllers/parentController');
const { protect } = require('../middleware/auth');
const { isParent } = require('../middleware/rolecheck');
const { ensureTenant } = require('../middleware/tenantCheck');

// All routes require authentication and parent role
router.use(protect);
router.use(isParent);
router.use(ensureTenant);

// Children
router.get('/children', getMyChildren);

// Homework
router.get('/homework/today', getTodaysHomework);
router.get('/homework/:studentId', getChildHomework);

// Fees
router.get('/fees/:studentId', trackChildFees);
router.get('/fees/receipts/:studentId', getFeeReceipts);

// Leave
router.post('/leave/apply', applyLeave);
router.get('/leaves', getLeaveHistory);

// Notes
router.get('/notes/:studentId', getChildNotes);

// Attendance
router.get('/attendance/:studentId', getChildAttendance);

module.exports = router;