// src/routes/superAdminRoutes.js
const express = require('express');
const router = express.Router();
const {
  getAllTenants,
  createTenant,
  updateTenant,
  deleteTenant,
  getSystemStats,
  makeSuperAdmin,
  removeSuperAdmin
} = require('../controllers/superAdminController');
const { protect } = require('../middleware/auth');
const { isSuperAdmin } = require('../middleware/roleCheck');

// All routes require authentication and super admin role
router.use(protect);
router.use(isSuperAdmin);

// Tenant management
router.route('/tenants')
  .get(getAllTenants)
  .post(createTenant);

router.route('/tenants/:id')
  .put(updateTenant)
  .delete(deleteTenant);

// System statistics
router.get('/stats', getSystemStats);

// Super admin management
router.put('/make-super-admin/:userId', makeSuperAdmin);
router.put('/remove-super-admin/:userId', removeSuperAdmin);

module.exports = router;