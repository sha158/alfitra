const express = require('express');
const { FeeStructure } = require('../models/Fee');
const router = express.Router();
const Class = require('../models/Class');
const mongoose = require('mongoose');
const {
  initializeDefaultCategories,
  getFeeCategories,
  createFeeCategory,
  updateFeeCategory,
  deleteFeeCategory,
  getCategoriesDropdown
} = require('../controllers/feeCategoryController');
const {
  initializeDefaultFrequencies,
  getFeeFrequencies,
  createFeeFrequency,
  updateFeeFrequency,
  deleteFeeFrequency,
  getFrequenciesDropdown
} = require('../controllers/feeFrequencyController');
const {
  createTeacher,
  getTeachers,
  updateTeacher,
  deleteTeacher,
  createClass,
  getClasses,
  updateClass,
  createStudent,
  getStudents,
  updateStudent,
  deleteStudent,
  resetUserPassword,
  getDashboardData,
  getAvailableTeachers
} = require('../controllers/adminController');
const {
  createFeeStructure,
  getFeeStructures,
  assignFeeToStudent,
  getStudentFees,
  recordFeePayment,
  getPayments,
  getFeeSummary,
  getSchoolFeeSummary,   
  getClassFeeSummary,   
  getStudentFeeSummary
} = require('../controllers/feeController');
const {
  sendNotification,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  getNotificationStats
} = require('../controllers/notificationController');
const { protect } = require('../middleware/auth');
const { isAdmin } = require('../middleware/rolecheck');
const { ensureTenant } = require('../middleware/tenantCheck');

// All routes require authentication and admin role
router.use(protect);
router.use(isAdmin);
router.use(ensureTenant);

// Dashboard
router.get('/dashboard', getDashboardData);

// Teacher routes
router.route('/teachers')
  .get(getTeachers)
  .post(createTeacher);

router.route('/teachers/:id')
  .put(updateTeacher)
  .delete(deleteTeacher);

// Get available teachers for class assignment
router.get('/teachers/available', getAvailableTeachers);
// Add this temporary debug endpoint to your adminRoutes.js to check fee assignments:

router.get('/fees/debug-assignment/:assignmentId', async (req, res) => {
  try {
    const { assignmentId } = req.params;
    
    const assignment = await FeeAssignment.findById(assignmentId)
      .populate('student', 'firstName lastName')
      .populate('feeStructure', 'name amount');
    
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }
    
    // Call updateStatus to see what happens
    assignment.updateStatus();
    
    const pending = assignment.calculatePendingAmount();
    
    res.json({
      assignment: {
        id: assignment._id,
        student: assignment.student?.firstName + ' ' + assignment.student?.lastName,
        fee: assignment.feeStructure?.name,
        totalAmount: assignment.totalAmount,
        discount: assignment.discount?.amount || 0,
        finalAmount: assignment.finalAmount,
        paidAmount: assignment.paidAmount,
        pendingCalculated: pending,
        status: assignment.status,
        dueDate: assignment.dueDate,
        isOverdue: assignment.dueDate < new Date()
      },
      debug: {
        paidAmountType: typeof assignment.paidAmount,
        finalAmountType: typeof assignment.finalAmount,
        calculation: `${assignment.finalAmount} - ${assignment.paidAmount} = ${pending}`
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Class routes
router.route('/classes')
  .get(getClasses)
  .post(createClass);

router.route('/classes/:id')
  .put(updateClass);

// Student routes
router.route('/students')
  .get(getStudents)
  .post(createStudent);

router.route('/students/:id')
  .put(updateStudent)
  .delete(deleteStudent);

// Reset user password
router.put('/users/:id/reset-password', resetUserPassword);

// Fee management routes
router.route('/fees/structure')
  .get(getFeeStructures)
  .post(createFeeStructure);

router.post('/fees/assign', assignFeeToStudent);
router.get('/fees/student/:studentId', getStudentFees);
router.post('/fees/payment', recordFeePayment);
router.get('/fees/payments', getPayments);

// Enhanced fee summary endpoints
router.get('/fees/summary', getFeeSummary);

// Convenience endpoints for specific summary levels
router.get('/fees/summary/school', (req, res, next) => {
  req.query.level = 'school';
  next();
}, getFeeSummary);

router.get('/fees/summary/class/:classId', (req, res, next) => {
  req.query.level = 'class';
  req.query.classId = req.params.classId;
  next();
}, getClassFeeSummary);

router.get('/fees/summary/student/:studentId', (req, res, next) => {
  req.query.level = 'student';
  req.query.studentId = req.params.studentId;
  next();
},getStudentFeeSummary);

// Get comprehensive summary (all levels)
router.get('/fees/summary/comprehensive', (req, res, next) => {
  req.query.level = 'all';
  next();
}, getFeeSummary);

router.post('/fees/categories/init', initializeDefaultCategories); // Initialize default categories
router.get('/fees/categories/dropdown', getCategoriesDropdown); // Simplified list for dropdowns

router.route('/fees/categories')
  .get(getFeeCategories)      // Get all categories
  .post(createFeeCategory);   // Create custom category

router.route('/fees/categories/:id')
  .put(updateFeeCategory)     // Update category
  .delete(deleteFeeCategory);

  router.post('/fees/frequencies/init', initializeDefaultFrequencies); // Initialize default frequencies
router.get('/fees/frequencies/dropdown', getFrequenciesDropdown); // Simplified list for dropdowns

router.route('/fees/frequencies')
  .get(getFeeFrequencies)      // Get all frequencies
  .post(createFeeFrequency);   // Create custom frequency

router.route('/fees/frequencies/:id')
  .put(updateFeeFrequency)     // Update frequency
  .delete(deleteFeeFrequency); // Delete frequency

// Notification routes
router.post('/notifications', sendNotification);
router.get('/notifications/stats', getNotificationStats);

// Announcement routes
router.route('/announcements')
  .post(createAnnouncement);

router.route('/announcements/:id')
  .put(updateAnnouncement)
  .delete(deleteAnnouncement);

// Debug routes (remove in production)
router.get('/fees/debug/:classId', async (req, res) => {
  try {
    const { classId } = req.params;
    const tenantId = req.user.tenant._id;
    
    console.log('=== FEE DEBUG ENDPOINT ===');
    console.log('Class ID:', classId);
    console.log('Tenant ID:', tenantId);
    
    // Get the class details
    const classData = await Class.findById(classId);
    console.log('Class found:', classData ? `Yes - ${classData.name} ${classData.section}` : 'No');
    
    // Get all fee structures for this tenant
    const allFeeStructures = await FeeStructure.find({ tenant: tenantId });
    console.log('Total fee structures in tenant:', allFeeStructures.length);
    
    // Log details of each fee structure
    console.log('\nFee Structure Details:');
    allFeeStructures.forEach((fee, index) => {
      console.log(`\n${index + 1}. ${fee.name}`);
      console.log(`   Classes: ${JSON.stringify(fee.classes)}`);
      console.log(`   Amount: ${fee.amount}`);
      console.log(`   Active: ${fee.isActive}`);
      console.log(`   Academic Year: ${fee.academicYear}`);
    });
    
    // Try different queries to find fee structures for this class
    console.log('\n=== QUERY TESTS ===');
    
    // Query 1: Direct match with string
    const query1 = await FeeStructure.find({
      tenant: tenantId,
      classes: classId
    });
    console.log(`Query 1 (string match): ${query1.length} results`);
    
    // Query 2: Using ObjectId (with new keyword)
    let query2 = [];
    try {
      const objectId = new mongoose.Types.ObjectId(classId);
      query2 = await FeeStructure.find({
        tenant: tenantId,
        classes: objectId
      });
      console.log(`Query 2 (ObjectId match): ${query2.length} results`);
    } catch (err) {
      console.log('Query 2 failed:', err.message);
    }
    
    // Query 3: Manual filter to check if class is included
    const manualMatch = allFeeStructures.filter(fee => {
      return fee.classes.some(c => {
        const cStr = c.toString();
        return cStr === classId;
      });
    });
    console.log(`Manual filter: ${manualMatch.length} results`);
    
    res.json({
      success: true,
      data: {
        classInfo: {
          id: classData?._id.toString(),
          name: classData?.name,
          section: classData?.section,
          displayName: `${classData?.name} - ${classData?.section}`
        },
        queryResults: {
          totalFeeStructures: allFeeStructures.length,
          stringMatch: query1.length,
          objectIdMatch: query2.length,
          manualFilterMatch: manualMatch.length
        },
        feeStructures: allFeeStructures.map(f => ({
          id: f._id.toString(),
          name: f.name,
          amount: f.amount,
          academicYear: f.academicYear,
          isActive: f.isActive,
          category: f.category,
          frequency: f.frequency,
          classes: {
            count: f.classes.length,
            asStrings: f.classes.map(c => c.toString()),
            includesThisClass: f.classes.some(c => c.toString() === classId)
          }
        })),
        matchingFeeStructures: manualMatch.map(f => ({
          name: f.name,
          amount: f.amount,
          frequency: f.frequency
        }))
      }
    });
  } catch (error) {
    console.error('Debug endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});


router.get('/fees/debug-student/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { FeeAssignment } = require('../models/Fee');
    
    const assignments = await FeeAssignment.find({
      student: studentId,
      tenant: req.user.tenant._id
    })
    .populate('feeStructure', 'name amount category')
    .populate('student', 'firstName lastName');
    
    const debugInfo = assignments.map(assignment => {
      assignment.updateStatus();
      const pending = assignment.calculatePendingAmount();
      
      return {
        assignmentId: assignment._id,
        studentName: assignment.student?.firstName + ' ' + assignment.student?.lastName,
        feeName: assignment.feeStructure?.name,
        amounts: {
          total: assignment.totalAmount,
          final: assignment.finalAmount,
          paid: assignment.paidAmount,
          discount: assignment.discount?.amount || 0,
          pendingCalculated: pending
        },
        status: assignment.status,
        dueDate: assignment.dueDate,
        debugInfo: {
          paidAmountIsZero: assignment.paidAmount === 0,
          paidAmountType: typeof assignment.paidAmount,
          paidAmountValue: assignment.paidAmount,
          formula: `${assignment.finalAmount} - ${assignment.paidAmount} = ${pending}`
        }
      };
    });
    
    res.json({
      studentId,
      totalAssignments: assignments.length,
      assignments: debugInfo
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/fees/debug-year', async (req, res) => {
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();
  
  let academicYear;
  if (currentMonth >= 3) { // April (month 3) onwards
    academicYear = `${currentYear}-${currentYear + 1}`;
  } else {
    academicYear = `${currentYear - 1}-${currentYear}`;
  }
  
  res.json({
    currentDate: currentDate.toISOString(),
    currentYear,
    currentMonth: currentMonth + 1, // +1 for human readable
    calculatedAcademicYear: academicYear,
    explanation: currentMonth >= 3 ? 
      'Month is April or later, so academic year is current-next' : 
      'Month is before April, so academic year is previous-current'
  });
});

module.exports = router;