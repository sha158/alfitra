// src/routes/hifzRoutes.js
const express = require('express');
const router = express.Router();
const {
  createHifzEntry,
  updateHifzEntry,
  getTeacherHifzEntries,
  getParentHifzEntries,
  acknowledgeHifzEntry,
  getHifzEntry,
  deleteHifzEntry,
  getHifzProgress
} = require('../controllers/hifzController');
const { protect } = require('../middleware/auth');
const { isTeacher, isParent, isTeacherOrAdmin } = require('../middleware/rolecheck');
const { ensureTenant } = require('../middleware/tenantCheck');

// All routes require authentication and tenant check
router.use(protect);
router.use(ensureTenant);

// Teacher routes
router.use('/teacher', isTeacherOrAdmin);
router.route('/teacher/hifz-tracker')
  .get(getTeacherHifzEntries)
  .post(createHifzEntry);

router.route('/teacher/hifz-tracker/:id')
  .get(getHifzEntry)
  .put(updateHifzEntry)
  .delete(deleteHifzEntry);

router.get('/teacher/hifz-tracker/progress/:studentId', getHifzProgress);

// Parent routes
router.use('/parent', isParent);
router.get('/parent/hifz-tracker/:studentId', getParentHifzEntries);
router.get('/parent/hifz-tracker/entry/:id', getHifzEntry);
router.put('/parent/hifz-tracker/:id/acknowledge', acknowledgeHifzEntry);
router.get('/parent/hifz-tracker/progress/:studentId', getHifzProgress);

module.exports = router;