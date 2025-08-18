// src/controllers/hifzController.js
const HifzTracker = require('../models/HifzTracker');
const Student = require('../models/Student');
const User = require('../models/User');

// @desc    Create new Hifz tracker entry
// @route   POST /api/teacher/hifz-tracker
// @access  Private/Teacher
const createHifzEntry = async (req, res) => {
  try {
    const {
      studentId,
      date,
      newLesson,
      recentRevision,
      oldRevision,
      tilawah,
      homeAssignment,
      tafseer,
      teacherRemarks,
      overallPerformance,
      attendance
    } = req.body;

    // Validate student belongs to teacher's class
    const student = await Student.findOne({
      _id: studentId,
      tenant: req.user.tenant._id,
      isActive: true
    }).populate('class');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Check if entry already exists for this date
    const existingEntry = await HifzTracker.findOne({
      student: studentId,
      date: {
        $gte: new Date(date).setHours(0, 0, 0, 0),
        $lte: new Date(date).setHours(23, 59, 59, 999)
      },
      tenant: req.user.tenant._id
    });

    if (existingEntry) {
      return res.status(400).json({
        success: false,
        message: 'Hifz entry already exists for this student on this date'
      });
    }

    // Create new entry
    const hifzEntry = await HifzTracker.create({
      tenant: req.user.tenant._id,
      student: studentId,
      teacher: req.user._id,
      class: student.class._id,
      date,
      newLesson,
      recentRevision,
      oldRevision,
      tilawah,
      homeAssignment,
      tafseer,
      teacherRemarks,
      overallPerformance,
      attendance,
      teacherSignature: {
        signed: true,
        signedAt: new Date(),
        signedBy: req.user._id
      }
    });

    const populatedEntry = await HifzTracker.findById(hifzEntry._id)
      .populate('student', 'firstName lastName rollNumber')
      .populate('teacher', 'firstName lastName')
      .populate('class', 'name section');

    res.status(201).json({
      success: true,
      data: populatedEntry
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error creating Hifz entry',
      error: error.message
    });
  }
};

// @desc    Update Hifz tracker entry
// @route   PUT /api/teacher/hifz-tracker/:id
// @access  Private/Teacher
const updateHifzEntry = async (req, res) => {
  try {
    const entry = await HifzTracker.findOne({
      _id: req.params.id,
      tenant: req.user.tenant._id,
      teacher: req.user._id
    });

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: 'Hifz entry not found'
      });
    }

    // Update fields
    const updatedEntry = await HifzTracker.findByIdAndUpdate(
      req.params.id,
      {
        ...req.body,
        teacherSignature: {
          signed: true,
          signedAt: new Date(),
          signedBy: req.user._id
        }
      },
      { new: true, runValidators: true }
    ).populate('student', 'firstName lastName rollNumber')
      .populate('teacher', 'firstName lastName')
      .populate('class', 'name section');

    res.status(200).json({
      success: true,
      data: updatedEntry
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error updating Hifz entry',
      error: error.message
    });
  }
};

// @desc    Get Hifz entries for teacher's students
// @route   GET /api/teacher/hifz-tracker
// @access  Private/Teacher
const getTeacherHifzEntries = async (req, res) => {
  try {
    const { classId, studentId, startDate, endDate } = req.query;
    
    let query = {
      tenant: req.user.tenant._id,
      teacher: req.user._id,
      isActive: true
    };

    if (classId) query.class = classId;
    if (studentId) query.student = studentId;
    
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const entries = await HifzTracker.find(query)
      .populate('student', 'firstName lastName rollNumber')
      .populate('class', 'name section')
      .sort({ date: -1 });

    res.status(200).json({
      success: true,
      count: entries.length,
      data: entries
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error fetching Hifz entries',
      error: error.message
    });
  }
};

// @desc    Get Hifz entries for parent's children
// @route   GET /api/parent/hifz-tracker/:studentId
// @access  Private/Parent
const getParentHifzEntries = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { startDate, endDate } = req.query;

    // Verify parent has access to this student
    const parent = await User.findById(req.user._id).populate('children');
    const hasAccess = parent.children.some(child => child._id.toString() === studentId);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this student\'s records'
      });
    }

    let query = {
      tenant: req.user.tenant._id,
      student: studentId,
      isActive: true
    };

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const entries = await HifzTracker.find(query)
      .populate('teacher', 'firstName lastName')
      .populate('class', 'name section')
      .sort({ date: -1 });

    res.status(200).json({
      success: true,
      count: entries.length,
      data: entries
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error fetching Hifz entries',
      error: error.message
    });
  }
};

// @desc    Add parent remarks/acknowledgment
// @route   PUT /api/parent/hifz-tracker/:id/acknowledge
// @access  Private/Parent
const acknowledgeHifzEntry = async (req, res) => {
  try {
    const { parentRemarks } = req.body;
    
    const entry = await HifzTracker.findById(req.params.id)
      .populate('student');

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: 'Hifz entry not found'
      });
    }

    // Verify parent has access
    const parent = await User.findById(req.user._id);
    const hasAccess = parent.children && parent.children.some(
      childId => childId.toString() === entry.student._id.toString()
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Update parent acknowledgment
    entry.parentRemarks = parentRemarks;
    entry.parentAcknowledgment = {
      acknowledged: true,
      acknowledgedAt: new Date(),
      acknowledgedBy: req.user._id
    };

    await entry.save();

    const updatedEntry = await HifzTracker.findById(entry._id)
      .populate('student', 'firstName lastName rollNumber')
      .populate('teacher', 'firstName lastName')
      .populate('class', 'name section');

    res.status(200).json({
      success: true,
      data: updatedEntry
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error acknowledging Hifz entry',
      error: error.message
    });
  }
};

// @desc    Get single Hifz entry
// @route   GET /api/teacher/hifz-tracker/:id
// @route   GET /api/parent/hifz-tracker/entry/:id
// @access  Private/Teacher or Parent
const getHifzEntry = async (req, res) => {
  try {
    const entry = await HifzTracker.findById(req.params.id)
      .populate('student', 'firstName lastName rollNumber')
      .populate('teacher', 'firstName lastName')
      .populate('class', 'name section');

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: 'Hifz entry not found'
      });
    }

    // Check access rights
    if (req.user.role === 'teacher' && entry.teacher._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    if (req.user.role === 'parent') {
      const parent = await User.findById(req.user._id);
      const hasAccess = parent.children && parent.children.some(
        childId => childId.toString() === entry.student._id.toString()
      );
      
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
    }

    res.status(200).json({
      success: true,
      data: entry
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error fetching Hifz entry',
      error: error.message
    });
  }
};

// @desc    Delete Hifz entry (soft delete)
// @route   DELETE /api/teacher/hifz-tracker/:id
// @access  Private/Teacher
const deleteHifzEntry = async (req, res) => {
  try {
    const entry = await HifzTracker.findOne({
      _id: req.params.id,
      tenant: req.user.tenant._id,
      teacher: req.user._id
    });

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: 'Hifz entry not found'
      });
    }

    entry.isActive = false;
    await entry.save();

    res.status(200).json({
      success: true,
      message: 'Hifz entry deleted successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error deleting Hifz entry',
      error: error.message
    });
  }
};

// @desc    Get Hifz progress report for a student
// @route   GET /api/teacher/hifz-tracker/progress/:studentId
// @route   GET /api/parent/hifz-tracker/progress/:studentId
// @access  Private/Teacher or Parent
const getHifzProgress = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { months = 3 } = req.query;

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - parseInt(months));

    const entries = await HifzTracker.find({
      student: studentId,
      tenant: req.user.tenant._id,
      date: { $gte: startDate, $lte: endDate },
      isActive: true
    }).sort({ date: 1 });

    // Calculate progress statistics
    const stats = {
      totalEntries: entries.length,
      lessonsCompleted: entries.filter(e => e.newLesson?.completed).length,
      averagePerformance: {},
      attendanceRate: 0,
      parentEngagement: 0
    };

    // Calculate average performance
    const performanceMap = {
      'Excellent': 4,
      'Good': 3,
      'Satisfactory': 2,
      'Needs Improvement': 1
    };

    let performanceSum = 0;
    let performanceCount = 0;

    entries.forEach(entry => {
      if (entry.overallPerformance) {
        performanceSum += performanceMap[entry.overallPerformance];
        performanceCount++;
      }
    });

    if (performanceCount > 0) {
      const avgScore = performanceSum / performanceCount;
      if (avgScore >= 3.5) stats.averagePerformance = 'Excellent';
      else if (avgScore >= 2.5) stats.averagePerformance = 'Good';
      else if (avgScore >= 1.5) stats.averagePerformance = 'Satisfactory';
      else stats.averagePerformance = 'Needs Improvement';
    } else {
      stats.averagePerformance = null; // Return null instead of empty object
    }

    // Calculate attendance rate
    const presentDays = entries.filter(e => e.attendance?.present !== false).length;
    stats.attendanceRate = entries.length > 0 ? 
      Math.round((presentDays / entries.length) * 100) : 0;

    // Calculate parent engagement
    const acknowledgedEntries = entries.filter(e => e.parentAcknowledgment?.acknowledged).length;
    stats.parentEngagement = entries.length > 0 ? 
      Math.round((acknowledgedEntries / entries.length) * 100) : 0;

    res.status(200).json({
      success: true,
      data: {
        student: studentId,
        period: { startDate, endDate },
        statistics: stats,
        recentEntries: entries.slice(-10) // Last 10 entries
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error fetching Hifz progress',
      error: error.message
    });
  }
};

module.exports = {
  createHifzEntry,
  updateHifzEntry,
  getTeacherHifzEntries,
  getParentHifzEntries,
  acknowledgeHifzEntry,
  getHifzEntry,
  deleteHifzEntry,
  getHifzProgress
};