// src/controllers/teacherController.js
const Homework = require('../models/Homework');
const Note = require('../models/Note');
const Class = require('../models/Class');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const { LEAVE_STATUS } = require('../config/constants');

// ============ HOMEWORK MANAGEMENT ============

// @desc    Create homework
// @route   POST /api/teacher/homework
// @access  Private/Teacher
const createHomework = async (req, res) => {
  try {
    const homework = await Homework.create({
      ...req.body,
      tenant: req.user.tenant._id,
      teacher: req.user._id
    });
    
    await homework.populate('class', 'name section');
    
    res.status(201).json({
      success: true,
      data: homework
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error creating homework',
      error: error.message
    });
  }
};

// @desc    Get homework for teacher's classes
// @route   GET /api/teacher/homework
// @access  Private/Teacher
const getTeacherHomework = async (req, res) => {
  try {
    const { classId, subject, startDate, endDate } = req.query;
    
    const query = {
      tenant: req.user.tenant._id,
      teacher: req.user._id,
      isActive: true
    };
    
    if (classId) query.class = classId;
    if (subject) query.subject = subject;
    
    if (startDate || endDate) {
      query.dueDate = {};
      if (startDate) query.dueDate.$gte = new Date(startDate);
      if (endDate) query.dueDate.$lte = new Date(endDate);
    }
    
    const homework = await Homework.find(query)
      .populate('class', 'name section')
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

// @desc    Update homework
// @route   PUT /api/teacher/homework/:id
// @access  Private/Teacher
const updateHomework = async (req, res) => {
  try {
    const homework = await Homework.findOneAndUpdate(
      {
        _id: req.params.id,
        tenant: req.user.tenant._id,
        teacher: req.user._id
      },
      req.body,
      {
        new: true,
        runValidators: true
      }
    ).populate('class', 'name section');
    
    if (!homework) {
      return res.status(404).json({
        success: false,
        message: 'Homework not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: homework
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error updating homework',
      error: error.message
    });
  }
};

// @desc    Delete homework
// @route   DELETE /api/teacher/homework/:id
// @access  Private/Teacher
const deleteHomework = async (req, res) => {
  try {
    const homework = await Homework.findOneAndUpdate(
      {
        _id: req.params.id,
        tenant: req.user.tenant._id,
        teacher: req.user._id
      },
      { isActive: false },
      { new: true }
    );
    
    if (!homework) {
      return res.status(404).json({
        success: false,
        message: 'Homework not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Homework deleted successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error deleting homework',
      error: error.message
    });
  }
};

// ============ NOTES MANAGEMENT ============

// @desc    Upload notes/study material
// @route   POST /api/teacher/notes
// @access  Private/Teacher
const uploadNotes = async (req, res) => {
  try {
    const note = await Note.create({
      ...req.body,
      tenant: req.user.tenant._id,
      teacher: req.user._id
    });
    
    await note.populate('class', 'name section');
    
    res.status(201).json({
      success: true,
      data: note
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error uploading notes',
      error: error.message
    });
  }
};

// @desc    Get teacher's notes
// @route   GET /api/teacher/notes
// @access  Private/Teacher
const getTeacherNotes = async (req, res) => {
  try {
    const { classId, subject, type } = req.query;
    
    const query = {
      tenant: req.user.tenant._id,
      teacher: req.user._id
    };
    
    if (classId) query.class = classId;
    if (subject) query.subject = subject;
    if (type) query.type = type;
    
    const notes = await Note.find(query)
      .populate('class', 'name section')
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

// @desc    Update note
// @route   PUT /api/teacher/notes/:id
// @access  Private/Teacher
const updateNote = async (req, res) => {
  try {
    const note = await Note.findOneAndUpdate(
      {
        _id: req.params.id,
        tenant: req.user.tenant._id,
        teacher: req.user._id
      },
      req.body,
      {
        new: true,
        runValidators: true
      }
    ).populate('class', 'name section');
    
    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Note not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: note
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error updating note',
      error: error.message
    });
  }
};

// @desc    Delete note
// @route   DELETE /api/teacher/notes/:id
// @access  Private/Teacher
const deleteNote = async (req, res) => {
  try {
    const note = await Note.findOneAndDelete({
      _id: req.params.id,
      tenant: req.user.tenant._id,
      teacher: req.user._id
    });
    
    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Note not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Note deleted successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error deleting note',
      error: error.message
    });
  }
};

// ============ ATTENDANCE MANAGEMENT ============

// @desc    Mark attendance
// @route   POST /api/teacher/attendance
// @access  Private/Teacher
const markAttendance = async (req, res) => {
  try {
    const { classId, date, attendanceData } = req.body;
    
    // Verify teacher has access to this class
    const classObj = await Class.findOne({
      _id: classId,
      tenant: req.user.tenant._id,
      $or: [
        { classTeacher: req.user._id },
        { 'subjectTeachers.teacher': req.user._id }
      ]
    });
    
    if (!classObj) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this class'
      });
    }
    
    // Process attendance for each student
    const attendanceRecords = [];
    
    for (const record of attendanceData) {
      const attendance = await Attendance.findOneAndUpdate(
        {
          tenant: req.user.tenant._id,
          student: record.studentId,
          date: new Date(date)
        },
        {
          status: record.status,
          class: classId,
          markedBy: req.user._id
        },
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true
        }
      );
      
      attendanceRecords.push(attendance);
    }
    
    res.status(200).json({
      success: true,
      count: attendanceRecords.length,
      data: attendanceRecords
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error marking attendance',
      error: error.message
    });
  }
};

// @desc    Get attendance for a class
// @route   GET /api/teacher/attendance/:classId
// @access  Private/Teacher
const getClassAttendance = async (req, res) => {
  try {
    const { date } = req.query;
    const { classId } = req.params;
    
    // Verify teacher has access to this class
    const classObj = await Class.findOne({
      _id: classId,
      tenant: req.user.tenant._id,
      $or: [
        { classTeacher: req.user._id },
        { 'subjectTeachers.teacher': req.user._id }
      ]
    });
    
    if (!classObj) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this class'
      });
    }
    
    const query = {
      tenant: req.user.tenant._id,
      class: classId
    };
    
    if (date) {
      query.date = new Date(date);
    }
    
    const attendance = await Attendance.find(query)
      .populate('student', 'firstName lastName rollNumber')
      .sort('student.rollNumber');
    
    res.status(200).json({
      success: true,
      count: attendance.length,
      data: attendance
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error fetching attendance',
      error: error.message
    });
  }
};

// ============ LEAVE MANAGEMENT ============

// @desc    Get pending leave applications
// @route   GET /api/teacher/leaves/pending
// @access  Private/Teacher
const getPendingLeaves = async (req, res) => {
  try {
    // Get classes where user is class teacher
    const classes = await Class.find({
      tenant: req.user.tenant._id,
      classTeacher: req.user._id
    });
    
    const classIds = classes.map(c => c._id);
    
    // Get students in these classes
    const Student = require('../models/Student');
    const students = await Student.find({
      tenant: req.user.tenant._id,
      class: { $in: classIds }
    });
    
    const studentIds = students.map(s => s._id);
    
    // Get pending leaves for these students
    const leaves = await Leave.find({
      tenant: req.user.tenant._id,
      student: { $in: studentIds },
      status: LEAVE_STATUS.PENDING
    })
      .populate('student', 'firstName lastName class')
      .populate('appliedBy', 'firstName lastName')
      .sort('-createdAt');
    
    res.status(200).json({
      success: true,
      count: leaves.length,
      data: leaves
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error fetching pending leaves',
      error: error.message
    });
  }
};

// @desc    Get approved leave applications
// @route   GET /api/teacher/leaves/approved
// @access  Private/Teacher
const getApprovedLeaves = async (req, res) => {
  try {
    // Get classes where user is class teacher
    const classes = await Class.find({
      tenant: req.user.tenant._id,
      classTeacher: req.user._id
    });
    
    const classIds = classes.map(c => c._id);
    
    // Get students in these classes
    const Student = require('../models/Student');
    const students = await Student.find({
      tenant: req.user.tenant._id,
      class: { $in: classIds }
    });
    
    const studentIds = students.map(s => s._id);
    
    // Get approved leaves for these students
    const leaves = await Leave.find({
      tenant: req.user.tenant._id,
      student: { $in: studentIds },
      status: LEAVE_STATUS.APPROVED
    })
      .populate('student', 'firstName lastName class')
      .populate('appliedBy', 'firstName lastName')
      .populate('approvedBy', 'firstName lastName')
      .sort('-approvalDate');
    
    res.status(200).json({
      success: true,
      count: leaves.length,
      data: leaves
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error fetching approved leaves',
      error: error.message
    });
  }
};

// @desc    Get rejected leave applications
// @route   GET /api/teacher/leaves/rejected
// @access  Private/Teacher
const getRejectedLeaves = async (req, res) => {
  try {
    // Get classes where user is class teacher
    const classes = await Class.find({
      tenant: req.user.tenant._id,
      classTeacher: req.user._id
    });
    
    const classIds = classes.map(c => c._id);
    
    // Get students in these classes
    const Student = require('../models/Student');
    const students = await Student.find({
      tenant: req.user.tenant._id,
      class: { $in: classIds }
    });
    
    const studentIds = students.map(s => s._id);
    
    // Get rejected leaves for these students
    const leaves = await Leave.find({
      tenant: req.user.tenant._id,
      student: { $in: studentIds },
      status: LEAVE_STATUS.REJECTED
    })
      .populate('student', 'firstName lastName class')
      .populate('appliedBy', 'firstName lastName')
      .populate('approvedBy', 'firstName lastName')
      .sort('-approvalDate');
    
    res.status(200).json({
      success: true,
      count: leaves.length,
      data: leaves
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error fetching rejected leaves',
      error: error.message
    });
  }
};

// @desc    Approve/Reject leave
// @route   PUT /api/teacher/leaves/:id
// @access  Private/Teacher
const updateLeaveStatus = async (req, res) => {
  try {
    const { status, remarks } = req.body;
    
    if (![LEAVE_STATUS.APPROVED, LEAVE_STATUS.REJECTED].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }
    
    // Verify teacher has authority over this student
    const leave = await Leave.findById(req.params.id)
      .populate({
        path: 'student',
        populate: {
          path: 'class',
          model: 'Class'
        }
      });
    
    if (!leave) {
      return res.status(404).json({
        success: false,
        message: 'Leave application not found'
      });
    }
    
    // Check if teacher is the class teacher
    if (leave.student.class.classTeacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to approve/reject this leave'
      });
    }
    
    // Update leave status
    leave.status = status;
    leave.remarks = remarks;
    leave.approvedBy = req.user._id;
    leave.approvalDate = Date.now();
    
    await leave.save();
    
    await leave.populate('appliedBy', 'firstName lastName');
    
    res.status(200).json({
      success: true,
      data: leave
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error updating leave status',
      error: error.message
    });
  }
};

// @desc    Get teacher's classes
// @route   GET /api/teacher/classes
// @access  Private/Teacher
const getTeacherClasses = async (req, res) => {
  try {
    const classes = await Class.find({
      tenant: req.user.tenant._id,
      $or: [
        { classTeacher: req.user._id },
        { 'subjectTeachers.teacher': req.user._id }
      ],
      isActive: true
    });
    
    res.status(200).json({
      success: true,
      count: classes.length,
      data: classes
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error fetching classes',
      error: error.message
    });
  }
};

// @desc    Get students in teacher's class
// @route   GET /api/teacher/students/:classId
// @access  Private/Teacher
const getClassStudents = async (req, res) => {
  try {
    const { classId } = req.params;
    
    // Verify teacher has access to this class
    const classObj = await Class.findOne({
      _id: classId,
      tenant: req.user.tenant._id,
      $or: [
        { classTeacher: req.user._id },
        { 'subjectTeachers.teacher': req.user._id }
      ]
    });
    
    if (!classObj) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this class'
      });
    }
    
    // Get students in this class
    const Student = require('../models/Student');
    const students = await Student.find({
      tenant: req.user.tenant._id,
      class: classId,
      isActive: true
    })
      .select('firstName lastName studentId rollNumber gender parent')
      .populate('parent', 'firstName lastName phone email')
      .sort('rollNumber');
    
    res.status(200).json({
      success: true,
      count: students.length,
      data: students
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error fetching students',
      error: error.message
    });
  }
};

module.exports = {
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
};