// src/routes/teacherRoutes.js
const express = require('express');
const router = express.Router();
const {
  // Homework
  createHomework,
  getTeacherHomework,
  updateHomework,
  deleteHomework,
  // Notes
  uploadNotes,
  getTeacherNotes,
  updateNote,
  deleteNote,
  // Attendance
  markAttendance,
  getClassAttendance,
  // Leaves
  getPendingLeaves,
  getApprovedLeaves,
  getRejectedLeaves,
  updateLeaveStatus,
  // Classes
  getTeacherClasses,
  // Students
  getClassStudents
} = require('../controllers/teacherController');
const { protect } = require('../middleware/auth');
const { isTeacher, isTeacherOrAdmin } = require('../middleware/roleCheck');
const { ensureTenant } = require('../middleware/tenantCheck');

// All routes require authentication and teacher role
router.use(protect);
router.use(isTeacherOrAdmin);
router.use(ensureTenant);

// Get teacher's classes
router.get('/classes', getTeacherClasses);

// Get students in a class
router.get('/students/:classId', getClassStudents);

// Homework routes
router.route('/homework')
  .get(getTeacherHomework)
  .post(createHomework);

router.route('/homework/:id')
  .put(updateHomework)
  .delete(deleteHomework);

// Notes routes
router.route('/notes')
  .get(getTeacherNotes)
  .post(uploadNotes);

router.route('/notes/:id')
  .put(updateNote)
  .delete(deleteNote);

// Attendance routes
router.post('/attendance', markAttendance);
router.get('/attendance/:classId', getClassAttendance);

// Leave routes
router.get('/leaves/pending', getPendingLeaves);
router.get('/leaves/approved', getApprovedLeaves);
router.get('/leaves/rejected', getRejectedLeaves);
router.put('/leaves/:id', updateLeaveStatus);

module.exports = router;