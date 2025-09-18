// src/routes/feeCreditRoutes.js
const express = require('express');
const {
  getStudentCredits,
  getAllCredits,
  applyCredit,
  createManualCredit,
  cancelCredit,
  getCreditApplicationOpportunities
} = require('../controllers/feeCreditController');

const router = express.Router();

// Get all credits (with pagination and filters)
router.get('/', getAllCredits);

// Create manual credit
router.post('/', createManualCredit);

// Get credits for specific student
router.get('/student/:studentId', getStudentCredits);

// Get credit application opportunities for student
router.get('/student/:studentId/opportunities', getCreditApplicationOpportunities);

// Apply credit to fee assignment
router.post('/:creditId/apply', applyCredit);

// Cancel credit
router.put('/:creditId/cancel', cancelCredit);

module.exports = router;