// src/controllers/teacherController.js
const Homework = require('../models/Homework');
const Note = require('../models/Note');
const Class = require('../models/Class');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const { LEAVE_STATUS, NOTIFICATION_TARGET } = require('../config/constants');
const { Notification } = require('../models/Notification');
const { sendFCMToTopic, sendFCMNotification } = require('./notificationController');
const activityLogger = require('../utils/activityLogger');

// ============ HOMEWORK MANAGEMENT ============

// Helper function to send homework notifications to parents
const sendHomeworkNotification = async (homework, teacher) => {
  try {
    // Create notification record
    const notification = await Notification.create({
      tenant: homework.tenant,
      title: `New Homework: ${homework.title}`,
      message: `${teacher.firstName} ${teacher.lastName} assigned new homework for ${homework.subject}. Due: ${new Date(homework.dueDate).toLocaleDateString()}`,
      sender: teacher._id,
      type: 'homework',
      priority: 'medium',
      targetType: NOTIFICATION_TARGET.SPECIFIC_CLASS,
      targetClass: homework.class._id
    });
    
    // Send FCM to class topic (parents will be subscribed to this)
    await sendFCMToTopic(`class_${homework.class._id}`, notification);
    
    console.log(`✅ Homework notification sent for class: ${homework.class.name}-${homework.class.section}`);
  } catch (error) {
    console.error('❌ Error sending homework notification:', error);
    // Don't throw error to avoid breaking homework creation
  }
};

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
    
    // 🔥 AUTO-NOTIFICATION: Send notification to parents when homework is created
    await sendHomeworkNotification(homework, req.user);
    
    // 📝 LOG ACTIVITY: Log homework creation activity
    await activityLogger.logHomeworkCreated(req.user, homework);
    
    res.status(201).json({
      success: true,
      data: homework,
      message: 'Homework created and parents notified successfully'
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
    
    // 📝 LOG ACTIVITY: Log homework update activity
    await activityLogger.logHomeworkUpdated(req.user, homework);
    
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
    // Get homework data before deleting for logging
    const homeworkToDelete = await Homework.findOne({
      _id: req.params.id,
      tenant: req.user.tenant._id,
      teacher: req.user._id
    }).populate('class', 'name section');

    if (!homeworkToDelete) {
      return res.status(404).json({
        success: false,
        message: 'Homework not found'
      });
    }

    const homework = await Homework.findOneAndUpdate(
      {
        _id: req.params.id,
        tenant: req.user.tenant._id,
        teacher: req.user._id
      },
      { isActive: false },
      { new: true }
    );
    
    // 📝 LOG ACTIVITY: Log homework deletion activity
    await activityLogger.logHomeworkDeleted(req.user, homeworkToDelete);
    
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

// Helper function to send notes notifications to parents
const sendNotesNotification = async (note, teacher) => {
  try {
    // Create notification record
    const notification = await Notification.create({
      tenant: note.tenant,
      title: `New Study Material: ${note.title}`,
      message: `${teacher.firstName} ${teacher.lastName} uploaded new study material for ${note.subject}`,
      sender: teacher._id,
      type: 'general',
      priority: 'medium',
      targetType: NOTIFICATION_TARGET.SPECIFIC_CLASS,
      targetClass: note.class._id
    });
    
    // Send FCM to class topic (parents will be subscribed to this)
    await sendFCMToTopic(`class_${note.class._id}`, notification);
    
    console.log(`✅ Notes notification sent for class: ${note.class.name}-${note.class.section}`);
  } catch (error) {
    console.error('❌ Error sending notes notification:', error);
    // Don't throw error to avoid breaking notes creation
  }
};

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
    
    // 🔥 AUTO-NOTIFICATION: Send notification to parents when notes are uploaded
    await sendNotesNotification(note, req.user);
    
    // 📝 LOG ACTIVITY: Log notes upload activity
    await activityLogger.logNotesUploaded(req.user, note);
    
    res.status(201).json({
      success: true,
      data: note,
      message: 'Notes uploaded and parents notified successfully'
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
    
    // 📝 LOG ACTIVITY: Log notes update activity
    await activityLogger.logNotesUpdated(req.user, note);
    
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
    // Get note data before deleting for logging
    const noteToDelete = await Note.findOne({
      _id: req.params.id,
      tenant: req.user.tenant._id,
      teacher: req.user._id
    }).populate('class', 'name section');

    if (!noteToDelete) {
      return res.status(404).json({
        success: false,
        message: 'Note not found'
      });
    }

    const note = await Note.findOneAndDelete({
      _id: req.params.id,
      tenant: req.user.tenant._id,
      teacher: req.user._id
    });
    
    // 📝 LOG ACTIVITY: Log notes deletion activity
    await activityLogger.logNotesDeleted(req.user, noteToDelete);
    
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

// Helper function to send attendance notifications to parents
const sendAttendanceNotification = async (classObj, date, attendanceRecords, teacher, isUpdate = false) => {
  try {
    const Student = require('../models/Student');
    
    // Get students who were marked absent
    const absentStudentIds = attendanceRecords
      .filter(record => record.status === 'absent')
      .map(record => record.student);
    
    if (absentStudentIds.length === 0) {
      console.log('No absent students, skipping attendance notification');
      return;
    }
    
    // Get student details with parent information
    const absentStudents = await Student.find({
      _id: { $in: absentStudentIds },
      tenant: teacher.tenant._id
    }).populate('parent', '_id firstName lastName');
    
    const formattedDate = new Date(date).toLocaleDateString('en-IN');
    const actionText = isUpdate ? 'updated' : 'marked';
    
    // Send individual notifications to each parent
    for (const student of absentStudents) {
      if (student.parent) {
        // Create notification record
        const notification = await Notification.create({
          tenant: teacher.tenant._id,
          title: `Attendance Alert: ${student.firstName} ${student.lastName}`,
          message: `${teacher.firstName} ${teacher.lastName} has ${actionText} your child ${student.firstName} as absent on ${formattedDate}. Please contact the school if this is incorrect.`,
          sender: teacher._id,
          type: 'attendance',
          priority: 'high',
          targetType: NOTIFICATION_TARGET.SPECIFIC_USER,
          targetUsers: [student.parent._id],
          // Additional data for frontend navigation
          metadata: {
            attendanceType: 'individual_absence',
            studentId: student._id,
            classId: classObj._id,
            date: date,
            navigateTo: 'attendance_details'
          }
        });
        
        // Send FCM to specific parent
        await sendFCMNotification([student.parent._id], notification);
        
        console.log(`✅ Attendance notification sent to parent of ${student.firstName} ${student.lastName}`);
      }
    }
    
    // Also send a general notification to the class topic for attendance summary
    const totalStudents = attendanceRecords.length;
    const presentCount = attendanceRecords.filter(r => r.status === 'present').length;
    const absentCount = absentStudentIds.length;
    
    const summaryNotification = await Notification.create({
      tenant: teacher.tenant._id,
      title: `Daily Attendance - ${classObj.name}-${classObj.section}`,
      message: `Attendance ${actionText} for ${formattedDate}. Present: ${presentCount}, Absent: ${absentCount}, Total: ${totalStudents}`,
      sender: teacher._id,
      type: 'attendance',
      priority: 'medium',
      targetType: NOTIFICATION_TARGET.SPECIFIC_CLASS,
      targetClass: classObj._id,
      // Additional data for frontend navigation
      metadata: {
        attendanceType: 'class_summary',
        classId: classObj._id,
        date: date,
        presentCount: presentCount,
        absentCount: absentCount,
        totalStudents: totalStudents,
        navigateTo: 'class_attendance'
      }
    });
    
    // Send FCM to class topic (all parents in the class)
    await sendFCMToTopic(`class_${classObj._id}`, summaryNotification);
    
    console.log(`✅ Attendance summary notification sent for class: ${classObj.name}-${classObj.section}`);
    
  } catch (error) {
    console.error('❌ Error sending attendance notification:', error);
    // Don't throw error to avoid breaking attendance marking
  }
};

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
    
    // Track if this is an update (existing records) or new submission
    let isUpdate = false;
    const attendanceRecords = [];
    
    // Process attendance for each student
    for (const record of attendanceData) {
      // Check if attendance already exists for this student and date
      const existingAttendance = await Attendance.findOne({
        tenant: req.user.tenant._id,
        student: record.studentId,
        date: new Date(date)
      });
      
      if (existingAttendance) {
        isUpdate = true;
      }
      
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
    
    // 🔥 AUTO-NOTIFICATION: Send notification to parents when attendance is marked/updated
    await sendAttendanceNotification(classObj, date, attendanceRecords, req.user, isUpdate);
    
    // 📝 LOG ACTIVITY: Log attendance marking activity
    await activityLogger.logAttendanceMarked(req.user, classObj, date, attendanceRecords, isUpdate);
    
    const actionText = isUpdate ? 'updated' : 'marked';
    
    res.status(200).json({
      success: true,
      count: attendanceRecords.length,
      data: attendanceRecords,
      message: `Attendance ${actionText} and parents notified successfully`
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

// Helper function to send leave status notification to parent
const sendLeaveStatusNotificationToParent = async (leave, teacher, status, remarks) => {
  try {
    const fromDate = new Date(leave.fromDate).toLocaleDateString('en-IN');
    const toDate = new Date(leave.toDate).toLocaleDateString('en-IN');
    const dateRange = fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`;
    
    // Calculate number of days
    const daysDiff = Math.ceil((new Date(leave.toDate) - new Date(leave.fromDate)) / (1000 * 60 * 60 * 24)) + 1;
    const daysText = daysDiff === 1 ? '1 day' : `${daysDiff} days`;
    
    const isApproved = status === LEAVE_STATUS.APPROVED;
    const statusText = isApproved ? 'approved' : 'rejected';
    const statusIcon = isApproved ? '✅' : '❌';
    
    let title = `Leave ${statusText.charAt(0).toUpperCase() + statusText.slice(1)}: ${leave.student.firstName} ${leave.student.lastName}`;
    let message = `${teacher.firstName} ${teacher.lastName} has ${statusText} your child's ${daysText} leave request (${dateRange}).`;
    
    if (remarks) {
      message += ` Remarks: ${remarks}`;
    }
    
    // Create notification record
    const notification = await Notification.create({
      tenant: leave.tenant,
      title: title,
      message: message,
      sender: teacher._id,
      type: 'leave',
      priority: isApproved ? 'medium' : 'high', // Higher priority for rejections
      targetType: NOTIFICATION_TARGET.SPECIFIC_USER,
      targetUsers: [leave.appliedBy],
      // Additional data for frontend navigation
      metadata: {
        leaveType: 'leave_status_update',
        leaveId: leave._id,
        studentId: leave.student._id,
        classId: leave.student.class._id,
        fromDate: leave.fromDate,
        toDate: leave.toDate,
        dayCount: daysDiff,
        leaveCategory: leave.type,
        status: status,
        isApproved: isApproved,
        statusIcon: statusIcon,
        remarks: remarks || '',
        navigateTo: isApproved ? 'approved_leaves' : 'rejected_leaves'
      }
    });
    
    // Send FCM to parent
    await sendFCMNotification([leave.appliedBy], notification);
    
    console.log(`✅ Leave ${statusText} notification sent to parent for ${leave.student.firstName} ${leave.student.lastName}`);
    
  } catch (error) {
    console.error('❌ Error sending leave status notification:', error);
    // Don't throw error to avoid breaking leave status update
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
    
    // 🔥 AUTO-NOTIFICATION: Send notification to parent when leave status is updated
    await sendLeaveStatusNotificationToParent(leave, req.user, status, remarks);
    
    // 📝 LOG ACTIVITY: Log leave status update activity
    await activityLogger.logLeaveStatusUpdate(req.user, leave, status, remarks);
    
    const statusText = status === LEAVE_STATUS.APPROVED ? 'approved' : 'rejected';
    
    res.status(200).json({
      success: true,
      data: leave,
      message: `Leave ${statusText} and parent notified successfully`
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
  getClassStudents,
  // Helper functions (for internal use)
  sendAttendanceNotification
};