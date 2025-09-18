// src/controllers/feeCreditController.js
const FeeCredit = require('../models/FeeCredit');
const { FeeAssignment } = require('../models/Fee');
const Student = require('../models/Student');

// @desc    Get all credits for a student
// @route   GET /api/admin/fee-credits/student/:studentId
// @access  Private/Admin
const getStudentCredits = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { status } = req.query;

    const query = {
      tenant: req.user.tenant._id,
      student: studentId
    };

    if (status) {
      query.status = status;
    }

    const credits = await FeeCredit.find(query)
      .populate('student', 'firstName lastName studentId')
      .populate('originalAssignment', 'finalAmount')
      .populate('appliedToAssignments.assignment', 'finalAmount')
      .sort('-createdAt');

    const totalAvailable = await FeeCredit.getTotalAvailableCredit(
      req.user.tenant._id,
      studentId
    );

    res.status(200).json({
      success: true,
      count: credits.length,
      totalAvailableCredit: totalAvailable,
      data: credits
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error fetching student credits',
      error: error.message
    });
  }
};

// @desc    Get all credits across all students
// @route   GET /api/admin/fee-credits
// @access  Private/Admin
const getAllCredits = async (req, res) => {
  try {
    const {
      status = 'active',
      limit = 50,
      page = 1,
      search
    } = req.query;

    const query = {
      tenant: req.user.tenant._id
    };

    if (status !== 'all') {
      query.status = status;
    }

    let credits = FeeCredit.find(query)
      .populate('student', 'firstName lastName studentId')
      .populate('originalAssignment', 'finalAmount')
      .sort('-createdAt');

    // Add search functionality
    if (search) {
      const studentIds = await Student.find({
        tenant: req.user.tenant._id,
        $or: [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { studentId: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');

      query.student = { $in: studentIds.map(s => s._id) };
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    credits = credits.skip(skip).limit(parseInt(limit));

    const [creditsData, totalCount] = await Promise.all([
      credits,
      FeeCredit.countDocuments(query)
    ]);

    // Calculate summary
    const summary = await FeeCredit.aggregate([
      { $match: { tenant: req.user.tenant._id } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$creditAmount' },
          totalRemaining: { $sum: '$remainingAmount' }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      count: creditsData.length,
      totalCount,
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalCount / parseInt(limit)),
      summary,
      data: creditsData
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error fetching credits',
      error: error.message
    });
  }
};

// @desc    Manually apply credit to fee assignment
// @route   POST /api/admin/fee-credits/:creditId/apply
// @access  Private/Admin
const applyCredit = async (req, res) => {
  try {
    const { creditId } = req.params;
    const { assignmentId, amount } = req.body;

    // Get the credit
    const credit = await FeeCredit.findOne({
      _id: creditId,
      tenant: req.user.tenant._id
    });

    if (!credit) {
      return res.status(404).json({
        success: false,
        message: 'Credit not found'
      });
    }

    // Get the fee assignment
    const assignment = await FeeAssignment.findOne({
      _id: assignmentId,
      tenant: req.user.tenant._id,
      student: credit.student
    });

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Fee assignment not found or does not belong to the same student'
      });
    }

    // Validate amount
    const maxApplicable = Math.min(
      credit.remainingAmount,
      assignment.finalAmount - assignment.paidAmount
    );

    if (amount > maxApplicable) {
      return res.status(400).json({
        success: false,
        message: `Cannot apply ₹${amount}. Maximum applicable amount is ₹${maxApplicable}`
      });
    }

    // Apply the credit
    await credit.applyCredit(assignmentId, amount);

    // Update the assignment
    assignment.paidAmount = (assignment.paidAmount || 0) + amount;
    assignment.updateStatus();
    await assignment.save();

    await credit.populate('student', 'firstName lastName');
    await assignment.populate('feeStructure', 'name');

    res.status(200).json({
      success: true,
      message: `₹${amount} credit applied successfully`,
      data: {
        credit,
        assignment,
        appliedAmount: amount,
        remainingCredit: credit.remainingAmount
      }
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error applying credit',
      error: error.message
    });
  }
};

// @desc    Create manual fee credit
// @route   POST /api/admin/fee-credits
// @access  Private/Admin
const createManualCredit = async (req, res) => {
  try {
    const {
      studentId,
      amount,
      reason,
      reasonDetails,
      originalAssignmentId
    } = req.body;

    // Validate student exists
    const student = await Student.findOne({
      _id: studentId,
      tenant: req.user.tenant._id,
      isActive: true
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // If originalAssignmentId provided, validate it
    if (originalAssignmentId) {
      const assignment = await FeeAssignment.findOne({
        _id: originalAssignmentId,
        tenant: req.user.tenant._id,
        student: studentId
      });

      if (!assignment) {
        return res.status(404).json({
          success: false,
          message: 'Original assignment not found'
        });
      }
    }

    // Create the credit
    const credit = await FeeCredit.create({
      tenant: req.user.tenant._id,
      student: studentId,
      originalAssignment: originalAssignmentId,
      creditAmount: amount,
      usedAmount: 0,
      remainingAmount: amount,
      reason: reason || 'admin_adjustment',
      reasonDetails: reasonDetails || 'Manual credit created by admin',
      createdBy: req.user._id
    });

    await credit.populate('student', 'firstName lastName studentId');

    res.status(201).json({
      success: true,
      message: 'Credit created successfully',
      data: credit
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error creating credit',
      error: error.message
    });
  }
};

// @desc    Cancel/expire a credit
// @route   PUT /api/admin/fee-credits/:creditId/cancel
// @access  Private/Admin
const cancelCredit = async (req, res) => {
  try {
    const { creditId } = req.params;
    const { reason } = req.body;

    const credit = await FeeCredit.findOne({
      _id: creditId,
      tenant: req.user.tenant._id
    });

    if (!credit) {
      return res.status(404).json({
        success: false,
        message: 'Credit not found'
      });
    }

    if (credit.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel credit with status: ${credit.status}`
      });
    }

    credit.status = 'cancelled';
    credit.reasonDetails += ` | Cancelled: ${reason || 'Admin cancellation'}`;
    await credit.save();

    res.status(200).json({
      success: true,
      message: 'Credit cancelled successfully',
      data: credit
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error cancelling credit',
      error: error.message
    });
  }
};

// @desc    Get credit application opportunities for a student
// @route   GET /api/admin/fee-credits/student/:studentId/opportunities
// @access  Private/Admin
const getCreditApplicationOpportunities = async (req, res) => {
  try {
    const { studentId } = req.params;

    // Get available credits
    const availableCredits = await FeeCredit.getAvailableCredits(
      req.user.tenant._id,
      studentId
    );

    // Get pending fee assignments
    const pendingAssignments = await FeeAssignment.find({
      student: studentId,
      tenant: req.user.tenant._id,
      status: { $in: ['pending', 'partially_paid'] }
    }).populate('feeStructure', 'name category');

    // Calculate opportunities
    const opportunities = pendingAssignments.map(assignment => {
      const pendingAmount = assignment.finalAmount - (assignment.paidAmount || 0);
      const applicableCredits = availableCredits
        .filter(credit => credit.remainingAmount > 0)
        .map(credit => ({
          creditId: credit._id,
          availableAmount: credit.remainingAmount,
          applicableAmount: Math.min(credit.remainingAmount, pendingAmount),
          reason: credit.reason
        }));

      const totalApplicable = applicableCredits.reduce(
        (sum, c) => sum + c.applicableAmount, 0
      );

      return {
        assignmentId: assignment._id,
        feeName: assignment.feeStructure?.name,
        category: assignment.feeStructure?.category,
        pendingAmount,
        applicableCredits,
        totalApplicableCredit: totalApplicable,
        wouldBePaidInFull: totalApplicable >= pendingAmount
      };
    });

    const totalAvailableCredit = availableCredits.reduce(
      (sum, c) => sum + c.remainingAmount, 0
    );

    const totalPendingFees = pendingAssignments.reduce(
      (sum, a) => sum + (a.finalAmount - (a.paidAmount || 0)), 0
    );

    res.status(200).json({
      success: true,
      data: {
        studentId,
        totalAvailableCredit,
        totalPendingFees,
        canPayOffAllFees: totalAvailableCredit >= totalPendingFees,
        opportunities
      }
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error fetching credit opportunities',
      error: error.message
    });
  }
};

module.exports = {
  getStudentCredits,
  getAllCredits,
  applyCredit,
  createManualCredit,
  cancelCredit,
  getCreditApplicationOpportunities
};