// src/controllers/feeController.js - Enhanced Version Without Installments
const { FeeStructure, FeeAssignment, FeePayment } = require('../models/Fee');
const Student = require('../models/Student');
const Class = require('../models/Class');
const { FEE_STATUS } = require('../config/constants');

// @desc    Create fee structure
// @route   POST /api/admin/fees/structure
// @access  Private/Admin
const createFeeStructure = async (req, res) => {
  try {
    console.log('Creating fee structure with body:', JSON.stringify(req.body, null, 2));
    
    // Create fee structure with the data as-is
    const feeStructure = await FeeStructure.create({
      ...req.body,
      tenant: req.user.tenant._id,
      isActive: true // Ensure it's active
    });
    
    console.log('Fee structure created successfully');
    console.log('ID:', feeStructure._id);
    console.log('Classes:', feeStructure.classes);
    
    res.status(201).json({
      success: true,
      data: feeStructure
    });
  } catch (error) {
    console.error('Error creating fee structure:', error);
    res.status(400).json({
      success: false,
      message: 'Error creating fee structure',
      error: error.message
    });
  }
};

// @desc    Get all fee structures
// @route   GET /api/admin/fees/structure
// @access  Private/Admin
const getFeeStructures = async (req, res) => {
  try {
    const feeStructures = await FeeStructure.find({
      tenant: req.user.tenant._id,
      isActive: true
    })
    .populate('classes', 'name section')
    .populate('category', 'name code description')  // Direct populate
    .populate('frequency', 'name code description monthsInterval');  // Direct populate
    
    res.status(200).json({
      success: true,
      count: feeStructures.length,
      data: feeStructures
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error fetching fee structures',
      error: error.message
    });
  }
};

// @desc    Update fee structure
// @route   PUT /api/admin/fees/structure/:id
// @access  Private/Admin
const updateFeeStructure = async (req, res) => {
  try {
    let feeStructure = await FeeStructure.findOne({
      _id: req.params.id,
      tenant: req.user.tenant._id
    });

    if (!feeStructure) {
      return res.status(404).json({
        success: false,
        message: 'Fee structure not found'
      });
    }

    feeStructure = await FeeStructure.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    res.status(200).json({
      success: true,
      data: feeStructure
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error updating fee structure',
      error: error.message
    });
  }
};

// @desc    Delete fee structure
// @route   DELETE /api/admin/fees/structure/:id
// @access  Private/Admin
const deleteFeeStructure = async (req, res) => {
  try {
    const feeStructure = await FeeStructure.findOne({
      _id: req.params.id,
      tenant: req.user.tenant._id
    });

    if (!feeStructure) {
      return res.status(404).json({
        success: false,
        message: 'Fee structure not found'
      });
    }

    // Soft delete by setting isActive to false
    await FeeStructure.findByIdAndUpdate(req.params.id, { isActive: false });

    res.status(200).json({
      success: true,
      message: 'Fee structure deleted successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error deleting fee structure',
      error: error.message
    });
  }
};

// @desc    Assign fees to student
// @route   POST /api/admin/fees/assign
// @access  Private/Admin
const assignFeeToStudent = async (req, res) => {
  try {
    const { studentId, feeStructureId, discount } = req.body;
    
    // Get fee structure
    const feeStructure = await FeeStructure.findOne({
      _id: feeStructureId,
      tenant: req.user.tenant._id
    });
    
    if (!feeStructure) {
      return res.status(404).json({
        success: false,
        message: 'Fee structure not found'
      });
    }
    
    // Check if fee already assigned
    const existingAssignment = await FeeAssignment.findOne({
      tenant: req.user.tenant._id,
      student: studentId,
      feeStructure: feeStructureId,
      academicYear: feeStructure.academicYear
    });
    
    if (existingAssignment) {
      return res.status(400).json({
        success: false,
        message: 'Fee already assigned to this student'
      });
    }
    
    // Calculate due date based on frequency
    const dueDate = calculateDueDate(feeStructure.frequency, feeStructure.dueDate);
    
    // Create fee assignment
    const feeAssignment = await FeeAssignment.create({
      tenant: req.user.tenant._id,
      student: studentId,
      feeStructure: feeStructureId,
      academicYear: feeStructure.academicYear,
      totalAmount: feeStructure.amount,
      discount: discount || { amount: 0 },
      finalAmount: feeStructure.amount - (discount?.amount || 0),
      dueDate: dueDate,
      status: FEE_STATUS.PENDING
    });
    
    await feeAssignment.populate('student feeStructure');
    
    res.status(201).json({
      success: true,
      data: feeAssignment
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error assigning fee',
      error: error.message
    });
  }
};

// @desc    Get student fee details
// @route   GET /api/admin/fees/student/:studentId
// @access  Private/Admin

// @desc    Record fee payment
// @route   POST /api/admin/fees/payment
// @access  Private/Admin
const recordFeePayment = async (req, res) => {
  try {
    const {
      studentId,
      feeAssignmentId,
      amount,
      paymentMethod,
      transactionId,
      remarks
    } = req.body;
    
    // Get fee assignment
    const feeAssignment = await FeeAssignment.findOne({
      _id: feeAssignmentId,
      tenant: req.user.tenant._id,
      student: studentId
    });
    
    if (!feeAssignment) {
      return res.status(404).json({
        success: false,
        message: 'Fee assignment not found'
      });
    }
    
    // Check if payment amount is valid
    const remainingAmount = feeAssignment.finalAmount - feeAssignment.paidAmount;
    if (amount > remainingAmount) {
      return res.status(400).json({
        success: false,
        message: `Payment amount cannot exceed remaining amount of ₹${remainingAmount}`
      });
    }
    
    // Create payment record
    const payment = await FeePayment.create({
      tenant: req.user.tenant._id,
      student: studentId,
      feeAssignment: feeAssignmentId,
      amount,
      paymentMethod,
      transactionId,
      remarks,
      collectedBy: req.user._id
    });
    
    // Update fee assignment
    feeAssignment.paidAmount += amount;
    feeAssignment.paidDate = new Date();
    feeAssignment.paymentId = payment._id;
    
    // Update status
    feeAssignment.updateStatus();
    
    await feeAssignment.save();
    
    await payment.populate('student');
    
    res.status(201).json({
      success: true,
      data: payment
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error recording payment',
      error: error.message
    });
  }
};

// @desc    Get all payments
// @route   GET /api/admin/fees/payments
// @access  Private/Admin
const getPayments = async (req, res) => {
  try {
    const { startDate, endDate, studentId } = req.query;
    
    const query = {
      tenant: req.user.tenant._id
    };
    
    if (studentId) query.student = studentId;
    
    if (startDate || endDate) {
      query.paymentDate = {};
      if (startDate) query.paymentDate.$gte = new Date(startDate);
      if (endDate) query.paymentDate.$lte = new Date(endDate);
    }
    
    const payments = await FeePayment.find(query)
      .populate('student', 'firstName lastName studentId')
      .populate('collectedBy', 'firstName lastName')
      .sort('-paymentDate');
    
    const totalAmount = payments.reduce((sum, payment) => sum + payment.amount, 0);
    
    res.status(200).json({
      success: true,
      count: payments.length,
      totalAmount,
      data: payments
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error fetching payments',
      error: error.message
    });
  }
};

// @desc    Get comprehensive fee summary with school, class, and student levels
// @route   GET /api/admin/fees/summary/:level/:id?
// @access  Private/Admin
// Replace the getSchoolFeeSummary function with this corrected version:

const getSchoolFeeSummary = async (req, res) => {
  try {
    const { academicYear } = req.query;
    const tenantId = req.user.tenant._id;
    
    // Build base query
    const query = { tenant: tenantId };
    if (academicYear) query.academicYear = academicYear;
    
    // Get all fee assignments for the school
    const assignments = await FeeAssignment.find(query)
      .populate('feeStructure', 'name category frequency')
      .populate('student', 'firstName lastName studentId class rollNumber');
    
    // Filter out assignments with null students
    const validAssignments = assignments.filter(a => a.student !== null);
    
    // Get all classes for grouping
    const classes = await Class.find({ tenant: tenantId }).select('name section displayName');
    const classMap = {};
    classes.forEach(cls => {
      classMap[cls._id.toString()] = cls.displayName || `${cls.name} ${cls.section}`;
    });
    
    const summary = {
      level: 'school',
      totalStudents: new Set(validAssignments.map(a => a.student._id.toString())).size,
      totalAssignments: validAssignments.length,
      totalExpected: 0,
      totalCollected: 0,
      totalPending: 0,
      totalOverdue: 0,
      classWiseSummary: {},
      categoryWiseSummary: {},
      recentPayments: []
    };
    
    // Process each assignment
    for (const assignment of validAssignments) {
      assignment.updateStatus();
      
      const pending = assignment.calculatePendingAmount();
      const classId = assignment.student.class?.toString();
      const className = classMap[classId] || 'Unknown Class';
      const category = assignment.feeStructure?.category || 'other';
      
      // Initialize class summary if not exists
      if (!summary.classWiseSummary[className]) {
        summary.classWiseSummary[className] = {
          expected: 0,
          collected: 0,
          pending: 0,
          overdue: 0,
          studentCount: new Set()
        };
      }
      
      // Initialize category summary if not exists
      if (!summary.categoryWiseSummary[category]) {
        summary.categoryWiseSummary[category] = {
          expected: 0,
          collected: 0,
          pending: 0,
          overdue: 0
        };
      }
      
      // Update totals
      summary.totalExpected += assignment.finalAmount || 0;
      summary.totalCollected += assignment.paidAmount || 0;
      
      // Update class-wise totals
      summary.classWiseSummary[className].expected += assignment.finalAmount || 0;
      summary.classWiseSummary[className].collected += assignment.paidAmount || 0;
      summary.classWiseSummary[className].studentCount.add(assignment.student._id.toString());
      
      // Update category-wise totals
      summary.categoryWiseSummary[category].expected += assignment.finalAmount || 0;
      summary.categoryWiseSummary[category].collected += assignment.paidAmount || 0;
      
      // Handle pending amounts
      if (pending > 0) {
        if (assignment.status === FEE_STATUS.OVERDUE) {
          summary.totalOverdue += pending;
          summary.classWiseSummary[className].overdue += pending;
          summary.categoryWiseSummary[category].overdue += pending;
        } else {
          summary.totalPending += pending;
          summary.classWiseSummary[className].pending += pending;
          summary.categoryWiseSummary[category].pending += pending;
        }
      }
    }
    
    // Convert student count sets to numbers
    Object.keys(summary.classWiseSummary).forEach(className => {
      summary.classWiseSummary[className].studentCount = 
        summary.classWiseSummary[className].studentCount.size;
    });
    
    // Get recent payments (last 10)
    const recentPayments = await FeePayment.find({ tenant: tenantId })
      .populate('student', 'firstName lastName')
      .populate('collectedBy', 'firstName lastName')
      .sort('-paymentDate')
      .limit(10);
    
    summary.recentPayments = recentPayments.map(p => ({
      paymentId: p._id,
      amount: p.amount,
      date: p.paymentDate,
      studentName: p.student ? `${p.student.firstName} ${p.student.lastName}` : 'Unknown',
      collectedBy: p.collectedBy ? `${p.collectedBy.firstName} ${p.collectedBy.lastName}` : 'Unknown',
      method: p.paymentMethod
    }));
    
    // Calculate collection rate
    summary.collectionRate = summary.totalExpected > 0 
      ? ((summary.totalCollected / summary.totalExpected) * 100).toFixed(2) 
      : 0;
    
    res.status(200).json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Error in getSchoolFeeSummary:', error);
    res.status(400).json({
      success: false,
      message: 'Error fetching school fee summary',
      error: error.message
    });
  }
};

const getClassFeeSummary = async (req, res) => {
  try {
    const { classId } = req.params;
    const { academicYear } = req.query;
    const tenantId = req.user.tenant._id;
    
    const query = { tenant: tenantId };
    if (academicYear) query.academicYear = academicYear;
    
    const summary = await getClassLevelSummary(query, classId);
    
    res.status(200).json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Error in getClassFeeSummary:', error);
    res.status(400).json({
      success: false,
      message: 'Error fetching class fee summary',
      error: error.message
    });
  }
};
const getStudentFeeSummary = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { academicYear } = req.query;
    const tenantId = req.user.tenant._id;
    
    const query = { tenant: tenantId };
    if (academicYear) query.academicYear = academicYear;
    
    const summary = await getStudentLevelSummary(query, studentId);
    
    res.status(200).json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Error in getStudentFeeSummary:', error);
    res.status(400).json({
      success: false,
      message: 'Error fetching student fee summary',
      error: error.message
    });
  }
};


// In your feeController.js, find the getStudentFees function and replace it with this:

const getStudentFees = async (req, res) => {
  try {
    const { studentId } = req.params;
    
    const feeAssignments = await FeeAssignment.find({
      tenant: req.user.tenant._id,
      student: studentId
    }).populate('feeStructure');
    
    // Update status for each assignment
    for (const assignment of feeAssignments) {
      assignment.updateStatus();
      await assignment.save(); // Save the updated status
    }
    
    // Calculate summary
    const summary = {
      totalAmount: 0,
      paidAmount: 0,
      pendingAmount: 0,
      overdueAmount: 0
    };
    
    feeAssignments.forEach(assignment => {
      const pending = assignment.calculatePendingAmount();
      
      console.log(`Assignment ${assignment._id}:`);
      console.log(`  Final Amount: ${assignment.finalAmount}`);
      console.log(`  Paid Amount: ${assignment.paidAmount}`);
      console.log(`  Pending: ${pending}`);
      console.log(`  Status: ${assignment.status}`);

      summary.totalAmount += assignment.finalAmount || 0;
      summary.paidAmount += assignment.paidAmount || 0;

      // THIS IS THE KEY FIX - Check pending > 0, not status first
      if (pending > 0) {
        if (assignment.status === FEE_STATUS.OVERDUE) {
          summary.overdueAmount += pending;
        } else {
          summary.pendingAmount += pending;
        }
      }
    });
    
    console.log('Final Summary:', summary);
    
    res.status(200).json({
      success: true,
      data: {
        assignments: feeAssignments,
        summary
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error fetching student fees',
      error: error.message
    });
  }
};

// Also, make sure the updateStatus method in your Fee model is correct:
// In Fee.js model file, the updateStatus method should be:





// Helper function: School-level summary
async function getSchoolLevelSummary(baseQuery, studentId) {
  const assignments = await FeeAssignment.find({
    ...baseQuery,
    student: studentId
  })
  .populate('feeStructure', 'name category frequency')
  .populate('student', 'firstName lastName studentId class rollNumber');
  
  if (assignments.length === 0) {
    return {
      level: 'student',
      studentId,
      message: 'No fee assignments found for this student'
    };
  }
  
  // Check if student exists
  const student = assignments[0].student;
  if (!student) {
    return {
      level: 'student',
      studentId,
      message: 'Student not found'
    };
  }
  
  const classInfo = await Class.findById(student.class).select('name section displayName');
  
  const summary = {
    level: 'student',
    studentId,
    studentName: student.firstName + ' ' + student.lastName,
    studentRollNumber: student.rollNumber,
    className: classInfo?.displayName || 'Unknown Class',
    totalExpected: 0,
    totalCollected: 0,
    totalPending: 0,
    totalOverdue: 0,
    feeDetails: [],
    paymentHistory: []
  };
  
  // Process each assignment
  for (const assignment of assignments) {
    assignment.updateStatus();

    const pending = assignment.calculatePendingAmount();

    console.log(`=== Student Level Summary Assignment ===`);
    console.log(`ID: ${assignment._id}`);
    console.log(`Final Amount: ${assignment.finalAmount}`);
    console.log(`Paid Amount: ${assignment.paidAmount}`);
    console.log(`Pending: ${pending}`);
    console.log(`Status: ${assignment.status}`);
    console.log('========================');

    const feeDetail = {
      assignmentId: assignment._id,
      feeName: assignment.feeStructure?.name || 'Unknown Fee',
      category: assignment.feeStructure?.category || 'other',
      frequency: assignment.feeStructure?.frequency || 'one-time',
      totalAmount: assignment.finalAmount || 0,
      discount: assignment.discount?.amount || 0,
      paidAmount: assignment.paidAmount || 0,
      pendingAmount: pending,
      dueDate: assignment.dueDate,
      status: assignment.status
    };

    summary.totalExpected += assignment.finalAmount || 0;
    summary.totalCollected += assignment.paidAmount || 0;

    // FIX: Add pending amount based on actual value
    if (pending > 0) {
      if (assignment.status === FEE_STATUS.OVERDUE) {
        summary.totalOverdue += pending;
        feeDetail.overdueAmount = pending;
      } else {
        summary.totalPending += pending;
      }
    }

    summary.feeDetails.push(feeDetail);
  }
  
  // Get payment history
  const payments = await FeePayment.find({
    tenant: baseQuery.tenant,
    student: studentId
  })
  .populate('collectedBy', 'firstName lastName')
  .sort('-paymentDate');
  
  summary.paymentHistory = payments.map(p => ({
    paymentId: p._id,
    amount: p.amount,
    date: p.paymentDate,
    method: p.paymentMethod,
    receiptNumber: p.receiptNumber,
    collectedBy: p.collectedBy ? `${p.collectedBy.firstName} ${p.collectedBy.lastName}` : 'Unknown'
  }));
  
  // Calculate percentages
  summary.paidPercentage = summary.totalExpected > 0 
    ? ((summary.totalCollected / summary.totalExpected) * 100).toFixed(2) 
    : 0;
  
  return summary;
}

  
  // Get recent payments



// Helper function: Class-level summary
async function getClassLevelSummary(baseQuery, classId) {
  // Get students in this class
  const students = await Student.find({ 
    class: classId, 
    tenant: baseQuery.tenant,
    isActive: true 
  });
  
  const studentIds = students.map(s => s._id);
  
  // Get fee assignments for these students
  const assignments = await FeeAssignment.find({
    ...baseQuery,
    student: { $in: studentIds }
  })
  .populate('student', 'firstName lastName studentId rollNumber')
  .populate('feeStructure', 'name category frequency');
  
  // Filter out assignments with null students
  const validAssignments = assignments.filter(a => a.student !== null);
  
  const classInfo = await Class.findById(classId).select('name section displayName');
  
  const summary = {
    level: 'class',
    classId,
    className: classInfo?.displayName || 'Unknown Class',
    totalStudents: students.length,
    totalAssignments: validAssignments.length,
    totalExpected: 0,
    totalCollected: 0,
    totalPending: 0,
    totalOverdue: 0,
    students: [],
    categoryWiseSummary: {}
  };
  
  // Process each assignment grouped by student
  const studentSummaries = {};
  
  for (const assignment of validAssignments) {
    assignment.updateStatus();
    
    const studentId = assignment.student._id.toString();
    const studentName = assignment.student.firstName + ' ' + assignment.student.lastName;
    
    // Initialize student summary if not exists
    if (!studentSummaries[studentId]) {
      studentSummaries[studentId] = {
        name: studentName,
        rollNumber: assignment.student.rollNumber,
        expected: 0,
        collected: 0,
        pending: 0,
        overdue: 0
      };
    }
    
    // Update totals
    summary.totalExpected += assignment.finalAmount;
    summary.totalCollected += assignment.paidAmount;
    
    studentSummaries[studentId].expected += assignment.finalAmount;
    studentSummaries[studentId].collected += assignment.paidAmount;
    
    const pending = assignment.finalAmount - assignment.paidAmount;
    
    if (assignment.status === FEE_STATUS.PENDING || assignment.status === FEE_STATUS.PARTIALLY_PAID) {
      summary.totalPending += pending;
      studentSummaries[studentId].pending += pending;
    } else if (assignment.status === FEE_STATUS.OVERDUE) {
      summary.totalOverdue += pending;
      studentSummaries[studentId].overdue += pending;
    }
    
    // Category-wise summary
    if (assignment.feeStructure) {
      const category = assignment.feeStructure.category;
      if (!summary.categoryWiseSummary[category]) {
        summary.categoryWiseSummary[category] = {
          expected: 0,
          collected: 0,
          pending: 0,
          overdue: 0
        };
      }
      
      summary.categoryWiseSummary[category].expected += assignment.finalAmount;
      summary.categoryWiseSummary[category].collected += assignment.paidAmount;
      
      if (assignment.status === FEE_STATUS.PENDING || assignment.status === FEE_STATUS.PARTIALLY_PAID) {
        summary.categoryWiseSummary[category].pending += pending;
      } else if (assignment.status === FEE_STATUS.OVERDUE) {
        summary.categoryWiseSummary[category].overdue += pending;
      }
    }
  }
  
  // Convert student summaries to array
  summary.students = Object.values(studentSummaries);
  
  // Calculate collection rate
  summary.collectionRate = summary.totalExpected > 0 
    ? ((summary.totalCollected / summary.totalExpected) * 100).toFixed(2) 
    : 0;
  
  return summary;
}

// Helper function: Student-level summary
async function getStudentLevelSummary(baseQuery, studentId) {
  const assignments = await FeeAssignment.find({
    ...baseQuery,
    student: studentId
  })
  .populate('feeStructure', 'name category frequency')
  .populate('student', 'firstName lastName studentId class rollNumber');
  
  if (assignments.length === 0) {
    return {
      level: 'student',
      studentId,
      message: 'No fee assignments found for this student'
    };
  }
  
  // Check if student exists
  const student = assignments[0].student;
  if (!student) {
    return {
      level: 'student',
      studentId,
      message: 'Student not found'
    };
  }
  
  const classInfo = await Class.findById(student.class).select('name section displayName');
  
  const summary = {
    level: 'student',
    studentId,
    studentName: student.firstName + ' ' + student.lastName,
    studentRollNumber: student.rollNumber,
    className: classInfo?.displayName || 'Unknown Class',
    totalExpected: 0,
    totalCollected: 0,
    totalPending: 0,
    totalOverdue: 0,
    feeDetails: [],
    paymentHistory: []
  };
  
  // Process each assignment
  for (const [index, assignment] of assignments.entries()) {
  assignment.updateStatus();

  const paid = typeof assignment.paidAmount === 'number' ? assignment.paidAmount : 0;
  const pending = Math.max(assignment.finalAmount - paid, 0);

  console.log(`=== Assignment Loop #${index + 1} ===`);
  console.log(`ID: ${assignment._id}`);
  console.log(`Final Amount: ${assignment.finalAmount}`);
  console.log(`Paid Amount: ${paid} (raw: ${assignment.paidAmount})`);
  console.log(`Pending: ${pending}`);
  console.log(`Status after update: ${assignment.status}`);
  console.log('========================');

  const feeDetail = {
    assignmentId: assignment._id,
    feeName: assignment.feeStructure?.name || 'Unknown Fee',
    category: assignment.feeStructure?.category || 'other',
    frequency: assignment.feeStructure?.frequency || 'one-time',
    totalAmount: assignment.finalAmount,
    discount: assignment.discount?.amount || 0,
    paidAmount: paid,
    pendingAmount: pending,
    dueDate: assignment.dueDate,
    status: assignment.status
  };

  summary.totalExpected += assignment.finalAmount;
  summary.totalCollected += paid;

  if ([FEE_STATUS.PENDING, FEE_STATUS.PARTIALLY_PAID].includes(assignment.status)) {
    summary.totalPending += pending;
  } else if (assignment.status === FEE_STATUS.OVERDUE) {
    summary.totalOverdue += pending;
    feeDetail.overdueAmount = pending;
  }

  summary.feeDetails.push(feeDetail);
}

  
  // Get payment history
  const payments = await FeePayment.find({
    tenant: baseQuery.tenant,
    student: studentId
  })
  .populate('collectedBy', 'firstName lastName')
  .sort('-paymentDate');
  
  summary.paymentHistory = payments.map(p => ({
    paymentId: p._id,
    amount: p.amount,
    date: p.paymentDate,
    method: p.paymentMethod,
    receiptNumber: p.receiptNumber,
    collectedBy: p.collectedBy ? `${p.collectedBy.firstName} ${p.collectedBy.lastName}` : 'Unknown'
  }));
  
  // Calculate percentages
  summary.paidPercentage = summary.totalExpected > 0 
    ? ((summary.totalCollected / summary.totalExpected) * 100).toFixed(2) 
    : 0;
  
  return summary;
}

// @desc    Auto-assign fees when student is added to class
// @access  System Internal
const autoAssignClassFees = async (studentId, classId, tenantId) => {
  try {
    console.log('=== AUTO ASSIGN FEES ===');
    console.log('Student ID:', studentId);
    console.log('Class ID:', classId);
    console.log('Tenant ID:', tenantId);
    
    const feeStructures = await FeeStructure.find({
      tenant: tenantId,
      classes: classId.toString(),
      isActive: true
    });
    
    console.log(`Found ${feeStructures.length} active fee structures for class ${classId}`);
    
    const assignments = [];

    for (const feeStructure of feeStructures) {
      console.log(`\nProcessing: ${feeStructure.name}`);
      
      // Check if already assigned
      const exists = await FeeAssignment.findOne({
        tenant: tenantId,
        student: studentId,
        feeStructure: feeStructure._id,
        academicYear: feeStructure.academicYear
      });

      if (!exists) {
        // Calculate due date based on frequency
        const dueDate = calculateDueDate(feeStructure.frequency, feeStructure.dueDate || 10);

        const assignment = await FeeAssignment.create({
          tenant: tenantId,
          student: studentId,
          feeStructure: feeStructure._id,
          academicYear: feeStructure.academicYear,
          totalAmount: feeStructure.amount,
          discount: { amount: 0 },
          finalAmount: feeStructure.amount,
          dueDate: dueDate,
          status: FEE_STATUS.PENDING
        });

        assignments.push(assignment);
        console.log(`✓ Successfully assigned: ${feeStructure.name}`);
      } else {
        console.log(`- Fee already assigned: ${feeStructure.name}`);
      }
    }

    console.log(`\n=== TOTAL FEES ASSIGNED: ${assignments.length} ===`);
    return assignments;
  } catch (error) {
    console.error('Error in auto-assigning fees:', error);
    console.error('Stack:', error.stack);
    throw error;
  }
};

// Helper function to calculate due date based on frequency
function calculateDueDate(frequency, dueDateDay = 10) {
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();
  
  let dueDate;
  
  switch (frequency) {
    case 'one-time':
      // For one-time payment, set due date to next occurrence of the due date
      dueDate = new Date(currentYear, currentMonth, dueDateDay);
      if (dueDate < currentDate) {
        // If the due date has passed this month, set it to next month
        dueDate = new Date(currentYear, currentMonth + 1, dueDateDay);
      }
      break;
      
    case 'monthly':
      // For monthly payments, due date is the specified day of current/next month
      dueDate = new Date(currentYear, currentMonth, dueDateDay);
      if (dueDate < currentDate) {
        dueDate = new Date(currentYear, currentMonth + 1, dueDateDay);
      }
      break;
      
    case 'quarterly':
      // For quarterly payments, find the next quarter's due date
      const quarterStartMonth = Math.floor(currentMonth / 3) * 3;
      dueDate = new Date(currentYear, quarterStartMonth, dueDateDay);
      if (dueDate < currentDate) {
        dueDate = new Date(currentYear, quarterStartMonth + 3, dueDateDay);
      }
      break;
      
    case 'half-yearly':
      // For half-yearly payments
      const halfYearMonth = currentMonth < 6 ? 0 : 6;
      dueDate = new Date(currentYear, halfYearMonth, dueDateDay);
      if (dueDate < currentDate) {
        dueDate = new Date(currentYear, halfYearMonth + 6, dueDateDay);
      }
      break;
      
    case 'yearly':
      // For yearly payment, set due date in April
      dueDate = new Date(currentYear, 3, dueDateDay); // April
      if (dueDate < currentDate) {
        dueDate = new Date(currentYear + 1, 3, dueDateDay);
      }
      break;
      
    default:
      dueDate = new Date(currentYear, currentMonth + 1, dueDateDay);
  }
  
  return dueDate;
}

// Legacy support - redirect to new endpoint
const getFeeSummary = async (req, res) => {
  // For backward compatibility, default to school summary
  return getSchoolFeeSummary(req, res);
};

module.exports = {
  createFeeStructure,
  getFeeStructures,
  updateFeeStructure,
  deleteFeeStructure,
  assignFeeToStudent,
  getStudentFees,
  recordFeePayment,
  getPayments,
  getFeeSummary,
  getSchoolFeeSummary,
  getClassFeeSummary,
  getStudentFeeSummary,
  autoAssignClassFees
};