// src/controllers/parentController.js
const Student = require('../models/Student');
const Homework = require('../models/Homework');
const Note = require('../models/Note');
const { FeeAssignment, FeePayment } = require('../models/Fee');
const Leave = require('../models/Leave');
const Attendance = require('../models/Attendance');
const { FEE_STATUS } = require('../config/constants');

// @desc    Get parent's children
// @route   GET /api/parent/children
// @access  Private/Parent
const getMyChildren = async (req, res) => {
  try {
    const children = await Student.find({
      tenant: req.user.tenant._id,
      parent: req.user._id,
      isActive: true
    }).populate('class', 'name section displayName');
    
    res.status(200).json({
      success: true,
      count: children.length,
      data: children
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error fetching children',
      error: error.message
    });
  }
};

// @desc    Get today's homework for all children
// @route   GET /api/parent/homework/today
// @access  Private/Parent
const getTodaysHomework = async (req, res) => {
  try {
    // Get all children
    const children = await Student.find({
      tenant: req.user.tenant._id,
      parent: req.user._id,
      isActive: true
    });
    
    // Get class IDs
    const classIds = [...new Set(children.map(child => child.class))];
    
    // Get today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Get homework created today or due in next 7 days
    const homework = await Homework.find({
      tenant: req.user.tenant._id,
      class: { $in: classIds },
      isActive: true,
      $or: [
        { createdAt: { $gte: today, $lt: tomorrow } },
        { dueDate: { $gte: today, $lte: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000) } }
      ]
    })
      .populate('class', 'name section')
      .populate('teacher', 'firstName lastName')
      .sort({ dueDate: 1 });
    
    // Group homework by child
    const homeworkByChild = children.map(child => {
      const childHomework = homework.filter(hw => 
        hw.class._id.toString() === child.class.toString()
      );
      
      return {
        child: {
          id: child._id,
          name: child.fullName,
          class: child.class
        },
        homework: childHomework
      };
    });
    
    res.status(200).json({
      success: true,
      data: homeworkByChild
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error fetching homework',
      error: error.message
    });
  }
};

// @desc    Get homework for a specific child
// @route   GET /api/parent/homework/:studentId
// @access  Private/Parent
const getChildHomework = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { startDate, endDate, subject } = req.query;
    
    // Verify parent has access to this student
    const student = await Student.findOne({
      _id: studentId,
      tenant: req.user.tenant._id,
      parent: req.user._id
    });
    
    if (!student) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    // Build query
    const query = {
      tenant: req.user.tenant._id,
      class: student.class,
      isActive: true
    };
    
    if (subject) query.subject = subject;
    
    if (startDate || endDate) {
      query.dueDate = {};
      if (startDate) query.dueDate.$gte = new Date(startDate);
      if (endDate) query.dueDate.$lte = new Date(endDate);
    }
    
    const homework = await Homework.find(query)
      .populate('teacher', 'firstName lastName')
      .sort('-createdAt');
    
    res.status(200).json({
      success: true,
      count: homework.length,
      data: homework
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error fetching homework',
      error: error.message
    });
  }
};

// @desc    Track child's fees
// @route   GET /api/parent/fees/:studentId
// @access  Private/Parent
const trackChildFees = async (req, res) => {
  try {
    const { studentId } = req.params;
    
    // Verify parent has access to this student
    const student = await Student.findOne({
      _id: studentId,
      tenant: req.user.tenant._id,
      parent: req.user._id
    });
    
    if (!student) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    // Get fee assignments
    const feeAssignments = await FeeAssignment.find({
      tenant: req.user.tenant._id,
      student: studentId
    }).populate('feeStructure');
    
    // Update status for each assignment
    for (const assignment of feeAssignments) {
      assignment.updateStatus();
    }
    
    // Get payment history
    const payments = await FeePayment.find({
      tenant: req.user.tenant._id,
      student: studentId
    }).sort('-paymentDate');
    
    // Calculate summary
    const summary = {
      totalAmount: 0,
      paidAmount: 0,
      pendingAmount: 0,
      overdueAmount: 0,
      upcomingDues: []
    };
    
    feeAssignments.forEach(assignment => {
      // Calculate pending amount for this assignment
      const pending = assignment.calculatePendingAmount ? 
        assignment.calculatePendingAmount() : 
        Math.max(assignment.finalAmount - assignment.paidAmount, 0);
      
      console.log(`Processing fee: ${assignment.feeStructure?.name}`);
      console.log(`  Final Amount: ${assignment.finalAmount}`);
      console.log(`  Paid Amount: ${assignment.paidAmount}`);
      console.log(`  Calculated Pending: ${pending}`);
      console.log(`  Status: ${assignment.status}`);
      
      // Add to totals
      summary.totalAmount += assignment.finalAmount || 0;
      summary.paidAmount += assignment.paidAmount || 0;
      
      // FIX: Add pending amount based on actual pending value
      if (pending > 0) {
        if (assignment.status === FEE_STATUS.OVERDUE) {
          summary.overdueAmount += pending;
        } else {
          summary.pendingAmount += pending;
        }
        
        // Add to upcoming dues
        summary.upcomingDues.push({
          id: assignment._id,
          feeName: assignment.feeStructure?.name || 'Unknown Fee',
          amount: pending,
          dueDate: assignment.dueDate,
          status: assignment.status
        });
      }
    });
    
    // Sort upcoming dues by date
    summary.upcomingDues.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    
    console.log('Final Summary:', summary);
    
    res.status(200).json({
      success: true,
      data: {
        student: {
          id: student._id,
          name: student.fullName,
          class: student.class
        },
        summary,
        feeDetails: feeAssignments,
        recentPayments: payments.slice(0, 10) // Last 10 payments
      }
    });
  } catch (error) {
    console.error("❌ Error in GET /parent/fees/:studentId");
    console.error("📌 Student ID:", req.params.studentId);
    console.error("📌 Request Body:", req.body);
    console.error("📌 Error Name:", error.name);
    console.error("📌 Error Message:", error.message);
    console.error("📌 Full Stack Trace:\n", error.stack);

    res.status(400).json({
      success: false,
      message: 'Error fetching fee details',
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack, // remove this in production if sensitive
        studentId: req.params.studentId
      }
    });
  }
};

// @desc    Apply leave for child
// @route   POST /api/parent/leave/apply
// @access  Private/Parent
const applyLeave = async (req, res) => {
  try {
    const { studentId, fromDate, toDate, reason, type } = req.body;
    
    // Verify parent has access to this student
    const student = await Student.findOne({
      _id: studentId,
      tenant: req.user.tenant._id,
      parent: req.user._id
    });
    
    if (!student) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    // Create leave application
    const leave = await Leave.create({
      tenant: req.user.tenant._id,
      student: studentId,
      appliedBy: req.user._id,
      fromDate,
      toDate,
      reason,
      type: type || 'personal'
    });
    
    await leave.populate('student', 'firstName lastName class');
    
    res.status(201).json({
      success: true,
      data: leave
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error applying for leave',
      error: error.message
    });
  }
};

// @desc    Get leave history for children
// @route   GET /api/parent/leaves
// @access  Private/Parent
const getLeaveHistory = async (req, res) => {
  try {
    const { studentId, status } = req.query;
    
    // Get all children
    const children = await Student.find({
      tenant: req.user.tenant._id,
      parent: req.user._id,
      isActive: true
    });
    
    const childIds = children.map(child => child._id);
    
    // Build query
    const query = {
      tenant: req.user.tenant._id,
      appliedBy: req.user._id
    };
    
    if (studentId) {
      // Verify access to specific student
      if (!childIds.some(id => id.toString() === studentId)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
      query.student = studentId;
    } else {
      query.student = { $in: childIds };
    }
    
    if (status) query.status = status;
    
    const leaves = await Leave.find(query)
      .populate('student', 'firstName lastName class')
      .populate('approvedBy', 'firstName lastName')
      .sort('-createdAt');
    
    res.status(200).json({
      success: true,
      count: leaves.length,
      data: leaves
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error fetching leave history',
      error: error.message
    });
  }
};

// @desc    Download/View notes for child's class
// @route   GET /api/parent/notes/:studentId
// @access  Private/Parent
const getChildNotes = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { subject, type } = req.query;
    
    // Verify parent has access to this student
    const student = await Student.findOne({
      _id: studentId,
      tenant: req.user.tenant._id,
      parent: req.user._id
    }).populate('class');
    
    if (!student) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    // Build query
    const query = {
      tenant: req.user.tenant._id,
      class: student.class._id,
      isPublished: true
    };
    
    if (subject) query.subject = subject;
    if (type) query.type = type;
    
    const notes = await Note.find(query)
      .populate('teacher', 'firstName lastName')
      .sort('-createdAt');
    
    res.status(200).json({
      success: true,
      count: notes.length,
      data: notes
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error fetching notes',
      error: error.message
    });
  }
};

// @desc    Get child's attendance
// @route   GET /api/parent/attendance/:studentId
// @access  Private/Parent
const getChildAttendance = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { startDate, endDate } = req.query;
    
    // Verify parent has access to this student
    const student = await Student.findOne({
      _id: studentId,
      tenant: req.user.tenant._id,
      parent: req.user._id
    });
    
    if (!student) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    // Build query
    const query = {
      tenant: req.user.tenant._id,
      student: studentId
    };
    
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }
    
    const attendance = await Attendance.find(query)
      .sort('-date')
      .limit(30); // Last 30 days by default
    
    // Calculate summary
    const summary = await Attendance.getAttendanceSummary(
      studentId,
      startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate ? new Date(endDate) : new Date()
    );
    
    res.status(200).json({
      success: true,
      data: {
        summary,
        records: attendance
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error fetching attendance',
      error: error.message
    });
  }
};

// @desc    Get fee receipts
// @route   GET /api/parent/fees/receipts/:studentId
// @access  Private/Parent
const getFeeReceipts = async (req, res) => {
  try {
    const { studentId } = req.params;
    
    // Verify parent has access to this student
    const student = await Student.findOne({
      _id: studentId,
      tenant: req.user.tenant._id,
      parent: req.user._id
    });
    
    if (!student) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    const receipts = await FeePayment.find({
      tenant: req.user.tenant._id,
      student: studentId,
      status: 'completed'
    })
      .populate('student', 'firstName lastName studentId')
      .populate('feeAssignment')
      .populate('collectedBy', 'firstName lastName')
      .sort('-paymentDate');
    
    res.status(200).json({
      success: true,
      count: receipts.length,
      data: receipts
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error fetching receipts',
      error: error.message
    });
  }
};

module.exports = {
  getMyChildren,
  getTodaysHomework,
  getChildHomework,
  trackChildFees,
  applyLeave,
  getLeaveHistory,
  getChildNotes,
  getChildAttendance,
  getFeeReceipts
};