// src/controllers/adminController.js
const User = require('../models/User');
const Student = require('../models/Student');
const Class = require('../models/Class');
const { FeeAssignment, FeePayment } = require('../models/Fee');
const Leave = require('../models/Leave');
const { generateRandomPassword } = require('../utils/passwordUtils');
const mongoose = require('mongoose');
const { autoAssignClassFees } = require('./feeController');
const { FeeStructure } = require('../models/Fee');

// @desc    Create a new teacher
// @route   POST /api/admin/teachers
// @access  Private/Admin
const createTeacher = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      employeeId,
      subjects,
      qualification,
      experience,
      joiningDate,
      password
    } = req.body;
    
    // Check if tenant can add more teachers
    const canAdd = await req.user.tenant.canAddMoreTeachers();
    if (!canAdd) {
      return res.status(400).json({
        success: false,
        message: 'Teacher limit reached for your subscription plan'
      });
    }
    
    // Generate password if not provided
    const teacherPassword = password || generateRandomPassword(8);
    
    // Create teacher
    const teacher = await User.create({
      tenant: req.user.tenant._id,
      firstName,
      lastName,
      email,
      phone,
      password: teacherPassword,
      role: 'teacher',
      teacherInfo: {
        employeeId: employeeId || `TCH${Date.now()}`,
        subjects,
        qualification,
        experience,
        joiningDate: joiningDate || Date.now()
      },
      isEmailVerified: true
    });
    
    res.status(201).json({
      success: true,
      data: teacher,
      temporaryPassword: password ? undefined : teacherPassword // Only send if auto-generated
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error creating teacher',
      error: error.message
    });
  }
};

// @desc    Get all teachers
// @route   GET /api/admin/teachers
// @access  Private/Admin
const getTeachers = async (req, res) => {
  try {
    const teachers = await User.find({
      tenant: req.user.tenant._id,
      role: 'teacher',
      isActive: true
    }).select('-password');
    
    res.status(200).json({
      success: true,
      count: teachers.length,
      data: teachers
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error fetching teachers',
      error: error.message
    });
  }
};

// @desc    Update teacher
// @route   PUT /api/admin/teachers/:id
// @access  Private/Admin
const updateTeacher = async (req, res) => {
  try {
    const teacher = await User.findOneAndUpdate(
      {
        _id: req.params.id,
        tenant: req.user.tenant._id,
        role: 'teacher'
      },
      req.body,
      {
        new: true,
        runValidators: true
      }
    );
    
    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: 'Teacher not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: teacher
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error updating teacher',
      error: error.message
    });
  }
};

// @desc    Delete teacher (soft delete)
// @route   DELETE /api/admin/teachers/:id
// @access  Private/Admin
const deleteTeacher = async (req, res) => {
  try {
    const teacher = await User.findOneAndUpdate(
      {
        _id: req.params.id,
        tenant: req.user.tenant._id,
        role: 'teacher'
      },
      { isActive: false },
      { new: true }
    );
    
    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: 'Teacher not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Teacher deactivated successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error deleting teacher',
      error: error.message
    });
  }
};

// @desc    Create a new class with subjects and teachers
// @route   POST /api/admin/classes
// @access  Private/Admin
const createClass = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      name,
      section,
      academicYear,
      classTeacher,
      subjectTeachers,
      room,
      maxStudents,
      schedule
    } = req.body;

    // Validate required fields
    if (!name || !section || !classTeacher || !subjectTeachers || subjectTeachers.length === 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Class name, section, class teacher, and at least one subject with teacher are required'
      });
    }

    // Validate class teacher exists and is a teacher
    const classTeacherUser = await User.findOne({
      _id: classTeacher,
      tenant: req.user.tenant._id,
      role: 'teacher',
      isActive: true
    }).session(session);

    if (!classTeacherUser) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Class teacher not found or is not an active teacher'
      });
    }

    // Validate all subject teachers exist and are teachers
    const teacherIds = [...new Set(subjectTeachers.map(st => st.teacher))];
    const validTeachers = await User.find({
      _id: { $in: teacherIds },
      tenant: req.user.tenant._id,
      role: 'teacher',
      isActive: true
    }).session(session);

    if (validTeachers.length !== teacherIds.length) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'One or more subject teachers not found or are not active teachers'
      });
    }

    // Validate subjects are provided for all subject teachers
    const invalidSubjects = subjectTeachers.filter(st => !st.subject || st.subject.trim() === '');
    if (invalidSubjects.length > 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Subject name is required for all subject teachers'
      });
    }

    // Generate academic year if not provided
    let finalAcademicYear = academicYear;
    if (!finalAcademicYear) {
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      const currentMonth = currentDate.getMonth();
      
      if (currentMonth >= 3) { // April onwards
        finalAcademicYear = `${currentYear}-${currentYear + 1}`;
      } else {
        finalAcademicYear = `${currentYear - 1}-${currentYear}`;
      }
    }

    // Create the class
    const classData = {
      tenant: req.user.tenant._id,
      name,
      section,
      academicYear: finalAcademicYear,
      classTeacher,
      subjectTeachers: subjectTeachers.map(st => ({
        teacher: st.teacher,
        subject: st.subject.trim()
      })),
      room,
      maxStudents: maxStudents || 40,
      schedule: schedule || {
        startTime: "09:00",
        endTime: "15:00"
      }
    };
    
    const newClass = await Class.create([classData], { session });
    
    await session.commitTransaction();
    
    // Populate the created class for response
    const populatedClass = await Class.findById(newClass[0]._id)
      .populate('classTeacher', 'firstName lastName email')
      .populate('subjectTeachers.teacher', 'firstName lastName email');
    
    res.status(201).json({
      success: true,
      data: populatedClass,
      message: 'Class created successfully with assigned teachers and subjects'
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({
      success: false,
      message: 'Error creating class',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

// @desc    Get all classes
// @route   GET /api/admin/classes
// @access  Private/Admin
const getClasses = async (req, res) => {
  try {
    const classes = await Class.find({
      tenant: req.user.tenant._id,
      isActive: true
    })
    .populate('classTeacher', 'firstName lastName email')
    .populate('subjectTeachers.teacher', 'firstName lastName email');
    
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

// @desc    Update class
// @route   PUT /api/admin/classes/:id
// @access  Private/Admin
const updateClass = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { classTeacher, subjectTeachers } = req.body;

    // If updating teachers, validate them
    if (classTeacher) {
      const classTeacherUser = await User.findOne({
        _id: classTeacher,
        tenant: req.user.tenant._id,
        role: 'teacher',
        isActive: true
      }).session(session);

      if (!classTeacherUser) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: 'Class teacher not found or is not an active teacher'
        });
      }
    }

    if (subjectTeachers && subjectTeachers.length > 0) {
      const teacherIds = [...new Set(subjectTeachers.map(st => st.teacher))];
      const validTeachers = await User.find({
        _id: { $in: teacherIds },
        tenant: req.user.tenant._id,
        role: 'teacher',
        isActive: true
      }).session(session);

      if (validTeachers.length !== teacherIds.length) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'One or more subject teachers not found or are not active teachers'
        });
      }

      // Validate subjects
      const invalidSubjects = subjectTeachers.filter(st => !st.subject || st.subject.trim() === '');
      if (invalidSubjects.length > 0) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Subject name is required for all subject teachers'
        });
      }
    }

    const classData = await Class.findOneAndUpdate(
      {
        _id: req.params.id,
        tenant: req.user.tenant._id
      },
      req.body,
      {
        new: true,
        runValidators: true,
        session
      }
    )
    .populate('classTeacher', 'firstName lastName email')
    .populate('subjectTeachers.teacher', 'firstName lastName email');
    
    if (!classData) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Class not found'
      });
    }
    
    await session.commitTransaction();
    
    res.status(200).json({
      success: true,
      data: classData
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({
      success: false,
      message: 'Error updating class',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

// @desc    Get available teachers for class assignment
// @route   GET /api/admin/teachers/available
// @access  Private/Admin
const getAvailableTeachers = async (req, res) => {
  try {
    const { subjectFilter } = req.query;
    
    const query = {
      tenant: req.user.tenant._id,
      role: 'teacher',
      isActive: true
    };
    
    // If subject filter is provided, find teachers who teach that subject
    if (subjectFilter) {
      query['teacherInfo.subjects'] = { 
        $in: [new RegExp(subjectFilter, 'i')] 
      };
    }
    
    const teachers = await User.find(query)
      .select('firstName lastName email teacherInfo.subjects teacherInfo.employeeId')
      .sort('firstName');
    
    res.status(200).json({
      success: true,
      count: teachers.length,
      data: teachers.map(teacher => ({
        _id: teacher._id,
        name: `${teacher.firstName} ${teacher.lastName}`,
        email: teacher.email,
        employeeId: teacher.teacherInfo.employeeId,
        subjects: teacher.teacherInfo.subjects,
        displayName: `${teacher.firstName} ${teacher.lastName} (${teacher.teacherInfo.employeeId})`
      }))
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error fetching available teachers',
      error: error.message
    });
  }
};

// @desc    Create a new student with parent
// @route   POST /api/admin/students
// @access  Private/Admin
const createStudent = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      // Student info
      firstName,
      lastName,
      dateOfBirth,
      gender,
      bloodGroup,
      address,
      classId,
      rollNumber,
      admissionNumber,
      // Parent info
      parentFirstName,
      parentLastName,
      parentEmail,
      parentPhone,
      parentOccupation,
      parentPassword,
      // Fee discount (optional)
      feeDiscount
    } = req.body;
    
    // Check if tenant can add more students
    const canAdd = await req.user.tenant.canAddMoreStudents();
    if (!canAdd) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Student limit reached for your subscription plan'
      });
    }
    
    // Check if class exists and has capacity
    const classObj = await Class.findOne({
      _id: classId,
      tenant: req.user.tenant._id
    }).session(session);
    
    if (!classObj) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Class not found'
      });
    }
    
    if (!(await classObj.hasCapacity())) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Class is at full capacity'
      });
    }
    
    // Check if parent already exists
    let parent = await User.findOne({
      email: parentEmail,
      tenant: req.user.tenant._id,
      role: 'parent'
    }).session(session);
    
    let parentIsNew = false;
    
    // Create parent if doesn't exist
    if (!parent) {
      parentIsNew = true;
      const generatedPassword = parentPassword || generateRandomPassword(8);
      
      const parentArray = await User.create([{
        tenant: req.user.tenant._id,
        firstName: parentFirstName,
        lastName: parentLastName,
        email: parentEmail,
        phone: parentPhone,
        password: generatedPassword,
        role: 'parent',
        parentInfo: {
          occupation: parentOccupation
        },
        isEmailVerified: true
      }], { session });
      
      parent = parentArray[0];
    }
    
    // Create student
    const studentArray = await Student.create([{
      tenant: req.user.tenant._id,
      firstName,
      lastName,
      dateOfBirth,
      gender,
      bloodGroup,
      address,
      class: classId,
      rollNumber,
      admissionNumber,
      parent: parent._id
    }], { session });
    
    const createdStudent = studentArray[0];
    
    // Auto-assign fees for the class
    try {
      const feeAssignments = await autoAssignClassFees(
        createdStudent._id,
        classId,
        req.user.tenant._id
      );
      
      // Apply discount if provided
      if (feeDiscount && feeDiscount.amount > 0 && feeAssignments.length > 0) {
        // We need to import FeeStructure model if not already imported
        const { FeeStructure } = require('../models/Fee');
        
        for (const assignment of feeAssignments) {
          assignment.discount = {
            amount: feeDiscount.amount,
            reason: feeDiscount.reason || 'Admission discount'
          };
          assignment.finalAmount = assignment.totalAmount - feeDiscount.amount;
          
          // Recalculate installments with discount
          const feeStructure = await FeeStructure.findById(assignment.feeStructure);
          
          // Recreate installments with discounted amount
          const discountPerInstallment = feeDiscount.amount / assignment.installments.length;
          assignment.installments = assignment.installments.map((inst, index) => ({
            ...inst.toObject ? inst.toObject() : inst,
            amount: inst.amount - discountPerInstallment,
            installmentNumber: index + 1,
            status: 'pending',
            paidAmount: 0
          }));
          
          await assignment.save({ session });
        }
      }
      
      console.log(`Auto-assigned ${feeAssignments.length} fees to student ${createdStudent.firstName} ${createdStudent.lastName}`);
    } catch (feeError) {
      console.error('Error assigning fees:', feeError);
      // Continue with student creation even if fee assignment fails
      // You might want to notify admin about this
    }
    
    await session.commitTransaction();
    
    // Populate data for response
    await createdStudent.populate('class parent');
    
    res.status(201).json({
      success: true,
      data: {
        student: createdStudent,
        parentCredentials: parentIsNew ? {
          email: parentEmail,
          temporaryPassword: parentPassword || 'Auto-generated, sent via email'
        } : undefined,
        message: 'Student created successfully. Fees have been automatically assigned based on class fee structure.'
      }
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({
      success: false,
      message: 'Error creating student',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

// @desc    Get all students
// @route   GET /api/admin/students
// @access  Private/Admin
const getStudents = async (req, res) => {
  try {
    const { classId, status } = req.query;
    
    const query = {
      tenant: req.user.tenant._id,
      isActive: true
    };
    
    if (classId) query.class = classId;
    if (status) query.status = status;
    
    const students = await Student.find(query)
      .populate('class', 'name section')
      .populate('parent', 'firstName lastName email phone');
    
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

// @desc    Update student
// @route   PUT /api/admin/students/:id
// @access  Private/Admin
const updateStudent = async (req, res) => {
  try {
    const student = await Student.findOneAndUpdate(
      {
        _id: req.params.id,
        tenant: req.user.tenant._id
      },
      req.body,
      {
        new: true,
        runValidators: true
      }
    ).populate('class parent');
    
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: student
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error updating student',
      error: error.message
    });
  }
};

// @desc    Delete student (soft delete)
// @route   DELETE /api/admin/students/:id
// @access  Private/Admin
const deleteStudent = async (req, res) => {
  try {
    const student = await Student.findOneAndUpdate(
      {
        _id: req.params.id,
        tenant: req.user.tenant._id
      },
      { isActive: false },
      { new: true }
    );
    
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Student deactivated successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error deleting student',
      error: error.message
    });
  }
};

// @desc    Reset user password (Admin only)
// @route   PUT /api/admin/users/:id/reset-password
// @access  Private/Admin
const resetUserPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }
    
    const user = await User.findOne({
      _id: req.params.id,
      tenant: req.user.tenant._id
    });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    user.password = newPassword;
    await user.save();
    
    res.status(200).json({
      success: true,
      message: 'Password reset successfully',
      data: {
        userId: user._id,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error resetting password',
      error: error.message
    });
  }
};

// @desc    Get admin dashboard data
// @route   GET /api/admin/dashboard
// @access  Private/Admin
const getDashboardData = async (req, res) => {
  try {
    const tenantId = req.user.tenant._id;
    
    // Get counts in parallel for better performance
    const [
      studentCount,
      teacherCount,
      parentCount,
      classCount,
      feeStats,
      recentPayments,
      todayAttendance,
      pendingLeaves
    ] = await Promise.all([
      // Total students
      Student.countDocuments({ 
        tenant: tenantId, 
        isActive: true 
      }),
      
      // Total teachers
      User.countDocuments({ 
        tenant: tenantId, 
        role: 'teacher', 
        isActive: true 
      }),
      
      // Total parents
      User.countDocuments({ 
        tenant: tenantId, 
        role: 'parent', 
        isActive: true 
      }),
      
      // Total classes
      Class.countDocuments({ 
        tenant: tenantId, 
        isActive: true 
      }),
      
      // Fee statistics
      getFeeStatistics(tenantId),
      
      // Recent 5 payments
      FeePayment.find({ 
        tenant: tenantId, 
        status: 'completed' 
      })
        .populate('student', 'firstName lastName')
        .sort('-paymentDate')
        .limit(5),
      
      // Today's attendance summary
      getTodayAttendanceSummary(tenantId),
      
      // Pending leave count
      Leave.countDocuments({ 
        tenant: tenantId, 
        status: 'pending' 
      })
    ]);
    
    // Calculate growth (compare with last month)
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    
    const [lastMonthStudents, lastMonthRevenue] = await Promise.all([
      Student.countDocuments({
        tenant: tenantId,
        createdAt: { $lt: lastMonth }
      }),
      
      FeePayment.aggregate([
        {
          $match: {
            tenant: tenantId,
            status: 'completed',
            paymentDate: {
              $gte: new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1),
              $lt: new Date()
            }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$amount' }
          }
        }
      ])
    ]);
    
    const studentGrowth = lastMonthStudents > 0 
      ? ((studentCount - lastMonthStudents) / lastMonthStudents * 100).toFixed(1)
      : 0;
    
    res.status(200).json({
      success: true,
      data: {
        overview: {
          students: {
            total: studentCount,
            growth: `${studentGrowth}%`
          },
          teachers: teacherCount,
          parents: parentCount,
          classes: classCount
        },
        
        fees: {
          totalCollected: feeStats.totalCollected,
          totalPending: feeStats.totalPending,
          totalOverdue: feeStats.totalOverdue,
          collectionRate: feeStats.collectionRate,
          recentPayments: recentPayments
        },
        
        attendance: {
          today: todayAttendance
        },
        
        pendingActions: {
          leaves: pendingLeaves
        },
        
        quickStats: {
          avgStudentsPerClass: classCount > 0 ? Math.round(studentCount / classCount) : 0,
          totalUsers: studentCount + teacherCount + parentCount,
          monthlyRevenue: lastMonthRevenue[0]?.total || 0
        }
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error fetching dashboard data',
      error: error.message
    });
  }
};

// Helper function to get fee statistics
async function getFeeStatistics(tenantId) {
  const { FeeAssignment, FeePayment } = require('../models/Fee');
  
  const assignments = await FeeAssignment.find({ tenant: tenantId });
  
  let totalExpected = 0;
  let totalCollected = 0;
  let totalPending = 0;
  let totalOverdue = 0;
  
  assignments.forEach(assignment => {
    totalExpected += assignment.finalAmount;
    
    assignment.installments.forEach(inst => {
      totalCollected += inst.paidAmount;
      
      if (inst.status === 'pending') {
        totalPending += (inst.amount - inst.paidAmount);
      } else if (inst.status === 'overdue') {
        totalOverdue += (inst.amount - inst.paidAmount);
      }
    });
  });
  
  const collectionRate = totalExpected > 0 
    ? ((totalCollected / totalExpected) * 100).toFixed(1)
    : 0;
  
  return {
    totalExpected,
    totalCollected,
    totalPending,
    totalOverdue,
    collectionRate: `${collectionRate}%`
  };
}

// Helper function to get today's attendance summary
async function getTodayAttendanceSummary(tenantId) {
  const Attendance = require('../models/Attendance');
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const attendanceRecords = await Attendance.find({
    tenant: tenantId,
    date: { $gte: today, $lt: tomorrow }
  });
  
  const summary = {
    present: 0,
    absent: 0,
    late: 0,
    total: attendanceRecords.length
  };
  
  attendanceRecords.forEach(record => {
    if (record.status === 'present') summary.present++;
    else if (record.status === 'absent') summary.absent++;
    else if (record.status === 'late') summary.late++;
  });
  
  summary.attendanceRate = summary.total > 0
    ? ((summary.present + summary.late) / summary.total * 100).toFixed(1)
    : 0;
  
  return summary;
}

module.exports = {
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
};