// src/controllers/adminController.js
const User = require('../models/User');
const Student = require('../models/Student');
const Class = require('../models/Class');
const { FeeAssignment, FeePayment } = require('../models/Fee');
const Leave = require('../models/Leave');
const TeacherAttendance = require('../models/TeacherAttendance');
const Activity = require('../models/Activity');
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

// @desc    Get all teachers with pagination
// @route   GET /api/admin/teachers
// @access  Private/Admin
const getTeachers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      sortBy = 'firstName',
      sortOrder = 'asc',
      subject
    } = req.query;

    // Build query
    const query = {
      tenant: req.user.tenant._id,
      role: 'teacher',
      isActive: true
    };

    // Add search functionality
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { 'teacherInfo.employeeId': { $regex: search, $options: 'i' } }
      ];
    }

    // Filter by subject
    if (subject) {
      query['teacherInfo.subjects'] = { $in: [new RegExp(subject, 'i')] };
    }

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build sort object
    const sortObj = {};
    sortObj[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Get total count for pagination info
    const totalTeachers = await User.countDocuments(query);

    // Get paginated teachers
    const teachers = await User.find(query)
      .select('-password')
      .sort(sortObj)
      .skip(skip)
      .limit(limitNum);

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalTeachers / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    res.status(200).json({
      success: true,
      data: teachers,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalTeachers,
        teachersPerPage: limitNum,
        hasNextPage,
        hasPrevPage,
        nextPage: hasNextPage ? pageNum + 1 : null,
        prevPage: hasPrevPage ? pageNum - 1 : null
      },
      filters: {
        search: search || null,
        subject: subject || null,
        sortBy,
        sortOrder
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error fetching teachers',
      error: error.message
    });
  }
};

// @desc    Get all parents with pagination
// @route   GET /api/admin/parents
// @access  Private/Admin
const getParents = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      sortBy = 'firstName',
      sortOrder = 'asc'
    } = req.query;

    // Build query
    const query = {
      tenant: req.user.tenant._id,
      role: 'parent',
      isActive: true
    };

    // Add search functionality
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build sort object
    const sortObj = {};
    sortObj[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Get total count for pagination info
    const totalParents = await User.countDocuments(query);

    // Get paginated parents with their children
    const parents = await User.find(query)
      .select('-password')
      .sort(sortObj)
      .skip(skip)
      .limit(limitNum);

    // Get children for each parent
    const parentsWithChildren = await Promise.all(
      parents.map(async (parent) => {
        const children = await Student.find({
          parent: parent._id,
          tenant: req.user.tenant._id,
          isActive: true
        })
        .populate('class', 'name section displayName')
        .select('firstName lastName class rollNumber studentId');

        return {
          ...parent.toObject(),
          children: children
        };
      })
    );

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalParents / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    res.status(200).json({
      success: true,
      data: parentsWithChildren,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalParents,
        parentsPerPage: limitNum,
        hasNextPage,
        hasPrevPage,
        nextPage: hasNextPage ? pageNum + 1 : null,
        prevPage: hasPrevPage ? pageNum - 1 : null
      },
      filters: {
        search: search || null,
        sortBy,
        sortOrder
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error fetching parents',
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
// @desc    Create a new class with subjects and teachers
// @route   POST /api/admin/classes
// @access  Private/Admin
// @desc    Create a new class with subjects and teachers
// @route   POST /api/admin/classes
// @access  Private/Admin
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
      schedule,
      description,
      startDate,
      endDate,
      feeStructure  // This should be an array of fee structure IDs
    } = req.body;

    // Validate required fields
    if (!name || !classTeacher || !subjectTeachers || subjectTeachers.length === 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Class name, class teacher, and subject teachers are required.'
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

    // Validate fee structures if provided
    let validFeeStructureIds = [];
    if (feeStructure && feeStructure.length > 0) {
      console.log('Received feeStructure:', feeStructure);
  console.log('Type of feeStructure:', typeof feeStructure);
  console.log('Is array?:', Array.isArray(feeStructure));
      // Ensure feeStructure is an array
      const feeStructureIds = Array.isArray(feeStructure) ? feeStructure : [feeStructure];
      console.log('feeStructureIds after processing:', feeStructureIds);
      
      const validFeeStructures = await FeeStructure.find({
        _id: { $in: feeStructureIds },
        tenant: req.user.tenant._id,
        isActive: true
      }).session(session);
      console.log('Found validFeeStructures:', validFeeStructures.length);
  console.log('Valid fee structures details:', validFeeStructures.map(fs => ({ id: fs._id, name: fs.name })));


      if (validFeeStructures.length !== feeStructureIds.length) {
         console.log('Validation failed - expected:', feeStructureIds.length, 'found:', validFeeStructures.length);
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'One or more fee structures not found or are not active'
        });
      }
      
      validFeeStructureIds = validFeeStructures.map(fs => fs._id);
      console.log('validFeeStructureIds:', validFeeStructureIds);
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
      section: section || '',
      academicYear: finalAcademicYear,
      classTeacher,
      subjectTeachers: subjectTeachers.map(st => ({
        teacher: st.teacher,
        subject: st.subject.trim()
      })),
      room: room || '',
      maxStudents: maxStudents || 40,
      schedule: schedule || {
        startTime: "09:00",
        endTime: "15:00"
      },
      description,
      startDate,
      endDate,
      feeStructure: validFeeStructureIds // Use the validated fee structure IDs
    };
    
    const newClass = await Class.create([classData], { session });
    
    // Update fee structures to include this class - THIS IS THE CRITICAL PART
    if (validFeeStructureIds.length > 0) {
      await FeeStructure.updateMany(
        { _id: { $in: validFeeStructureIds } },
        { $addToSet: { classes: newClass[0]._id } },
        { session }
      );
      
      console.log(`Updated ${validFeeStructureIds.length} fee structures to include class ${newClass[0]._id}`);
    }
    
    await session.commitTransaction();
    
    // Populate the created class for response
    const populatedClass = await Class.findById(newClass[0]._id)
      .populate('classTeacher', 'firstName lastName email')
      .populate('subjectTeachers.teacher', 'firstName lastName email')
      .populate('feeStructure', 'name category amount frequency academicYear description');
    
    res.status(201).json({
      success: true,
      data: populatedClass,
      message: 'Class created successfully with assigned teachers, subjects, and fee structures'
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
// @desc    Get all classes with pagination
// @route   GET /api/admin/classes
// @access  Private/Admin
const getClasses = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      sortBy = 'name',
      sortOrder = 'asc',
      academicYear,
      teacherId
    } = req.query;

    // Build query
    const query = {
      tenant: req.user.tenant._id,
      isActive: true
    };

    // Add search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { section: { $regex: search, $options: 'i' } },
        { room: { $regex: search, $options: 'i' } }
      ];
    }

    // Filter by academic year
    if (academicYear) {
      query.academicYear = academicYear;
    }

    // Filter by teacher (class teacher or subject teacher)
    if (teacherId) {
      query.$or = [
        { classTeacher: teacherId },
        { 'subjectTeachers.teacher': teacherId }
      ];
    }

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build sort object
    const sortObj = {};
    sortObj[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Get total count for pagination info
    const totalClasses = await Class.countDocuments(query);

    // Get paginated classes
    const classes = await Class.find(query)
      .populate('classTeacher', 'firstName lastName email')
      .populate('subjectTeachers.teacher', 'firstName lastName email')
      .populate('feeStructure', 'name category amount frequency academicYear description isActive')
      .sort(sortObj)
      .skip(skip)
      .limit(limitNum);

    // Get student count for each class
    const classesWithStudentCount = await Promise.all(
      classes.map(async (classDoc) => {
        const studentCount = await Student.countDocuments({
          class: classDoc._id,
          tenant: req.user.tenant._id,
          isActive: true
        });

        return {
          ...classDoc.toObject(),
          studentCount
        };
      })
    );

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalClasses / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    res.status(200).json({
      success: true,
      data: classesWithStudentCount,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalClasses,
        classesPerPage: limitNum,
        hasNextPage,
        hasPrevPage,
        nextPage: hasNextPage ? pageNum + 1 : null,
        prevPage: hasPrevPage ? pageNum - 1 : null
      },
      filters: {
        search: search || null,
        academicYear: academicYear || null,
        teacherId: teacherId || null,
        sortBy,
        sortOrder
      }
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
// @desc    Update class
// @route   PUT /api/admin/classes/:id
// @access  Private/Admin
const updateClass = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { classTeacher, subjectTeachers, feeStructure } = req.body;

    // Find the existing class first
    const existingClass = await Class.findOne({
      _id: req.params.id,
      tenant: req.user.tenant._id
    }).session(session);

    if (!existingClass) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Class not found'
      });
    }

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

    // Handle fee structure updates
    let validFeeStructureIds = undefined;
    if ('feeStructure' in req.body) {
      // If feeStructure is explicitly provided (even as empty array)
      validFeeStructureIds = [];
      
      if (feeStructure && feeStructure.length > 0) {
        console.log('Received feeStructure:', feeStructure);
  console.log('Type of feeStructure:', typeof feeStructure);
  console.log('Is array?:', Array.isArray(feeStructure));
        const feeStructureIds = Array.isArray(feeStructure) ? feeStructure : [feeStructure];
        console.log('feeStructureIds after processing:', feeStructureIds);
        
        const validFeeStructures = await FeeStructure.find({
          _id: { $in: feeStructureIds },
          tenant: req.user.tenant._id,
          isActive: true
        }).session(session);

        console.log('Found validFeeStructures:', validFeeStructures.length);
  console.log('Valid fee structures details:', validFeeStructures.map(fs => ({ id: fs._id, name: fs.name })));

        if (validFeeStructures.length !== feeStructureIds.length) {
          console.log('Validation failed - expected:', feeStructureIds.length, 'found:', validFeeStructures.length);
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: 'One or more fee structures not found or are not active'
          });
        }
        
        validFeeStructureIds = validFeeStructures.map(fs => fs._id);
        console.log('validFeeStructureIds:', validFeeStructureIds);
      }

      // Remove this class from all fee structures first
      await FeeStructure.updateMany(
        { classes: existingClass._id },
        { $pull: { classes: existingClass._id } },
        { session }
      );

      // Add this class to the new fee structures
      if (validFeeStructureIds.length > 0) {
        await FeeStructure.updateMany(
          { _id: { $in: validFeeStructureIds } },
          { $addToSet: { classes: existingClass._id } },
          { session }
        );
      }
    }

    // Prepare update data
    const updateData = { ...req.body };
    if (validFeeStructureIds !== undefined) {
      updateData.feeStructure = validFeeStructureIds;
    }

    // Update the class
    const classData = await Class.findOneAndUpdate(
      {
        _id: req.params.id,
        tenant: req.user.tenant._id
      },
      updateData,
      {
        new: true,
        runValidators: true,
        session
      }
    )
    .populate('classTeacher', 'firstName lastName email')
    .populate('subjectTeachers.teacher', 'firstName lastName email')
    .populate('feeStructure', 'name category amount frequency academicYear description');
    
    await session.commitTransaction();
    
    res.status(200).json({
      success: true,
      data: classData,
      message: 'Class updated successfully'
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
// @desc    Delete class (soft delete)
// @route   DELETE /api/admin/classes/:id
// @access  Private/Admin
const deleteClass = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const classId = req.params.id;
    const tenantId = req.user.tenant._id;

    // Find the class
    const classToDelete = await Class.findOne({
      _id: classId,
      tenant: tenantId
    }).session(session);

    if (!classToDelete) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Class not found'
      });
    }

    // Check if there are active students in this class
    const activeStudentsCount = await Student.countDocuments({
      class: classId,
      tenant: tenantId,
      isActive: true
    }).session(session);

    if (activeStudentsCount > 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Cannot delete class. There are ${activeStudentsCount} active student(s) enrolled in this class. Please transfer or remove students first.`
      });
    }

    // Get all students in this class to check for fee assignments
    const studentsInClass = await Student.find({
      class: classId,
      tenant: tenantId
    }).select('_id').session(session);
    
    const studentIds = studentsInClass.map(student => student._id);
    
    // Check for any pending fee assignments for students in this class
    const pendingFees = await FeeAssignment.countDocuments({
      tenant: tenantId,
      student: { $in: studentIds },
      status: { $in: ['pending', 'partially_paid'] }
    }).session(session);

    if (pendingFees > 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Cannot delete class. There are ${pendingFees} pending fee assignment(s) associated with students in this class. Please clear all pending fees first.`
      });
    }

    // Remove class from all fee structures
    await FeeStructure.updateMany(
      { classes: classId },
      { $pull: { classes: classId } },
      { session }
    );

    // If there are any students in this class (inactive or transferred), 
    // we should mark their unpaid fee assignments as cancelled to prevent them 
    // from showing up in fee summaries
    if (studentIds.length > 0) {
      await FeeAssignment.updateMany(
        {
          tenant: tenantId,
          student: { $in: studentIds },
          status: { $in: ['pending', 'partially_paid', 'overdue'] },
          paidAmount: { $lt: 1 } // Only cancel completely unpaid fees
        },
        {
          $set: {
            status: 'cancelled',
            cancelledAt: new Date(),
            cancelledBy: req.user._id,
            cancellationReason: `Class ${classToDelete.displayName} was deleted`
          }
        },
        { session }
      );
    }

    // Soft delete the class
    classToDelete.isActive = false;
    classToDelete.deletedAt = new Date();
    classToDelete.deletedBy = req.user._id;
    
    await classToDelete.save({ session });

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: `Class ${classToDelete.displayName} has been successfully deleted`,
      data: {
        id: classToDelete._id,
        name: classToDelete.displayName
      }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Error deleting class:', error);
    res.status(400).json({
      success: false,
      message: 'Error deleting class',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

// Alternative: Hard delete (permanently remove) - use with caution
const hardDeleteClass = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const classId = req.params.id;
    const tenantId = req.user.tenant._id;

    // Find the class
    const classToDelete = await Class.findOne({
      _id: classId,
      tenant: tenantId
    }).session(session);

    if (!classToDelete) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Class not found'
      });
    }

    // Check if there are any students (active or inactive) in this class
    const totalStudentsCount = await Student.countDocuments({
      class: classId,
      tenant: tenantId
    }).session(session);

    if (totalStudentsCount > 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Cannot permanently delete class. There are ${totalStudentsCount} student record(s) associated with this class.`
      });
    }

    // Get all students (including inactive) in this class to check for fee assignments
    const allStudentsInClass = await Student.find({
      class: classId,
      tenant: tenantId
    }).select('_id').session(session);
    
    const allStudentIds = allStudentsInClass.map(student => student._id);
    
    // Check for any fee assignments (including historical) for students in this class
    const totalFeeAssignments = await FeeAssignment.countDocuments({
      tenant: tenantId,
      student: { $in: allStudentIds }
    }).session(session);

    if (totalFeeAssignments > 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Cannot permanently delete class. There are ${totalFeeAssignments} fee assignment record(s) associated with this class.`
      });
    }

    // Remove class from all fee structures
    await FeeStructure.updateMany(
      { classes: classId },
      { $pull: { classes: classId } },
      { session }
    );

    // Permanently delete the class
    await Class.deleteOne({ _id: classId }, { session });

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: `Class ${classToDelete.displayName} has been permanently deleted`,
      data: {
        id: classToDelete._id,
        name: classToDelete.displayName
      }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Error permanently deleting class:', error);
    res.status(400).json({
      success: false,
      message: 'Error permanently deleting class',
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
    
    // Validate classId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(classId)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Invalid class ID format'
      });
    }

    // Check if class exists and has capacity
    const classObj = await Class.findOne({
      _id: classId,
      tenant: req.user.tenant._id,
      isActive: true
    }).session(session);

    if (!classObj) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Class not found or inactive'
      });
    }

    if (!(await classObj.hasCapacity())) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Class is at full capacity'
      });
    }

    // Check for duplicate roll number within the same class
    const existingStudent = await Student.findOne({
      tenant: req.user.tenant._id,
      class: classId,
      rollNumber: rollNumber,
      isActive: true
    }).session(session);

    if (existingStudent) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Roll number ${rollNumber} is already assigned to another student in this class. Please choose a different roll number.`,
        duplicateField: 'rollNumber',
        conflictDetails: {
          existingStudent: {
            id: existingStudent._id,
            name: `${existingStudent.firstName} ${existingStudent.lastName}`,
            rollNumber: existingStudent.rollNumber
          },
          className: classObj.name,
          section: classObj.section
        }
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

          // Update the status to reflect the discount has been applied
          assignment.updateStatus();

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

    // Handle MongoDB duplicate key error specifically for roll number
    if (error.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern)[0];

      if (duplicateField === 'rollNumber' || error.message.includes('rollNumber')) {
        return res.status(400).json({
          success: false,
          message: `Roll number ${req.body.rollNumber} is already taken in this class. Please choose a different roll number.`,
          duplicateField: 'rollNumber'
        });
      }

      if (duplicateField === 'admissionNumber' || error.message.includes('admissionNumber')) {
        return res.status(400).json({
          success: false,
          message: `Admission number ${req.body.admissionNumber} is already taken. Please choose a different admission number.`,
          duplicateField: 'admissionNumber'
        });
      }

      // Generic duplicate key error
      return res.status(400).json({
        success: false,
        message: 'A student with these details already exists. Please check roll number and admission number.',
        error: 'Duplicate entry'
      });
    }

    res.status(400).json({
      success: false,
      message: 'Error creating student',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

// @desc    Get all students with pagination
// @route   GET /api/admin/students
// @access  Private/Admin
const getStudents = async (req, res) => {
  try {
    const {
      classId,
      status,
      page = 1,
      limit = 10,
      search,
      sortBy = 'firstName',
      sortOrder = 'asc'
    } = req.query;

    // Build query
    const query = {
      tenant: req.user.tenant._id,
      isActive: true
    };

    if (classId) query.class = classId;
    if (status) query.status = status;

    // Add search functionality
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { admissionNumber: { $regex: search, $options: 'i' } },
        { studentId: { $regex: search, $options: 'i' } }
      ];
    }

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build sort object
    const sortObj = {};
    sortObj[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Get total count for pagination info
    const totalStudents = await Student.countDocuments(query);

    // Get paginated students
    const students = await Student.find(query)
      .populate('class', 'name section displayName')
      .populate('parent', 'firstName lastName email phone')
      .sort(sortObj)
      .skip(skip)
      .limit(limitNum);

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalStudents / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    res.status(200).json({
      success: true,
      data: students,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalStudents,
        studentsPerPage: limitNum,
        hasNextPage,
        hasPrevPage,
        nextPage: hasNextPage ? pageNum + 1 : null,
        prevPage: hasPrevPage ? pageNum - 1 : null
      },
      filters: {
        classId: classId || null,
        status: status || null,
        search: search || null,
        sortBy,
        sortOrder
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error fetching students',
      error: error.message
    });
  }
};

// @desc    Update student and their parent's details
// @route   PUT /api/admin/students/:id
// @access  Private/Admin
const updateStudent = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    console.log('\n=== UPDATE STUDENT REQUEST RECEIVED ===');
    console.log('Student ID:', req.params.id);
    console.log('Request Body:', JSON.stringify(req.body, null, 2));
    console.log('User:', req.user?.email || 'Unknown');
    console.log('Tenant:', req.user?.tenant?._id || 'Unknown');
    console.log('==========================================');

    const {
      parentFirstName,
      parentLastName,
      parentEmail,
      parentPhone,
      parentOccupation,
      ...studentData
    } = req.body;

    console.log('Student Data after destructuring:', JSON.stringify(studentData, null, 2));

    // Step 1: Find the student to get the parent's ID and current class
    const student = await Student.findOne({
      _id: req.params.id,
      tenant: req.user.tenant._id
    }).session(session);

    if (!student) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const originalClassId = student.class;
    const newClassId = studentData.class;
    const isClassChanging = newClassId && newClassId.toString() !== originalClassId.toString();

    console.log('\n=== CLASS CHANGE DETECTION ===');
    console.log('Original Class ID:', originalClassId);
    console.log('New Class ID from request:', newClassId);
    console.log('Original Class ID (string):', originalClassId?.toString());
    console.log('New Class ID (string):', newClassId?.toString());
    console.log('Is Class Changing?', isClassChanging);
    console.log('================================');

    // Step 2: If class is changing, validate new class and check for roll number conflicts
    if (isClassChanging) {
      // Validate new class exists
      const newClassObj = await Class.findOne({
        _id: newClassId,
        tenant: req.user.tenant._id,
        isActive: true
      }).session(session);

      if (!newClassObj) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: 'New class not found or inactive'
        });
      }

      // Check for roll number conflicts in the new class (if roll number is being set)
      if (studentData.rollNumber) {
        const existingStudent = await Student.findOne({
          tenant: req.user.tenant._id,
          class: newClassId,
          rollNumber: studentData.rollNumber,
          isActive: true,
          _id: { $ne: student._id } // Exclude current student
        }).session(session);

        if (existingStudent) {
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: `Roll number ${studentData.rollNumber} is already assigned to another student in the target class. Please choose a different roll number.`,
            duplicateField: 'rollNumber',
            conflictDetails: {
              existingStudent: {
                id: existingStudent._id,
                name: `${existingStudent.firstName} ${existingStudent.lastName}`,
                rollNumber: existingStudent.rollNumber
              },
              className: newClassObj.name,
              section: newClassObj.section
            }
          });
        }
      }
    }

    // Step 3: If parent details are provided, update the parent's User record
    const parentUpdatePayload = {};
    if (parentFirstName) parentUpdatePayload.firstName = parentFirstName;
    if (parentLastName) parentUpdatePayload.lastName = parentLastName;
    if (parentEmail) parentUpdatePayload.email = parentEmail;
    if (parentPhone) parentUpdatePayload.phone = parentPhone;
    if (parentOccupation) parentUpdatePayload['parentInfo.occupation'] = parentOccupation;

    if (Object.keys(parentUpdatePayload).length > 0 && student.parent) {
      await User.updateOne(
        { _id: student.parent, tenant: req.user.tenant._id, role: 'parent' },
        { $set: parentUpdatePayload },
        { runValidators: true, session }
      );
    }

    // Step 4: Handle fee migration if class is changing
    let feeMessage = '';
    let migrationResult = null;
    if (isClassChanging) {
      console.log('\n=== STARTING FEE MIGRATION DEBUG ===');
      console.log('Student ID:', student._id);
      console.log('Original Class ID:', originalClassId);
      console.log('New Class ID:', newClassId);
      console.log('Tenant ID:', req.user.tenant._id);
      console.log('User ID:', req.user._id);
      console.log('Request Body:', JSON.stringify(req.body, null, 2));

      try {
        // Import the enhanced fee migration service
        const FeeMigrationService = require('../utils/feeMigration');

        console.log('About to call handleClassChangeFeeMigration...');

        // Use smart fee migration with credit system
        migrationResult = await FeeMigrationService.handleClassChangeFeeMigration(
          student._id,
          originalClassId,
          newClassId,
          req.user.tenant._id,
          req.user._id
        );

        console.log('Fee migration completed successfully');
        console.log('Migration result:', JSON.stringify(migrationResult, null, 2));

        // Build detailed fee migration message
        const summary = migrationResult.summary;
        feeMessage = ` Fee migration completed:`;

        if (summary.preservedFees > 0) {
          feeMessage += ` ${summary.preservedFees} fee(s) preserved (transport/shared fees).`;
        }

        if (summary.totalCreditsCreated > 0) {
          feeMessage += ` ₹${summary.totalCreditsCreated} in credits created from cancelled fees.`;
        }

        if (summary.newFeesAssigned > 0) {
          feeMessage += ` ${summary.newFeesAssigned} new fee(s) assigned for the new class.`;
        }

        if (summary.totalCreditsApplied > 0) {
          feeMessage += ` ₹${summary.totalCreditsApplied} in credits automatically applied to new fees.`;
        }

        // If there are remaining credits, inform about them
        const remainingCredits = summary.totalCreditsCreated - summary.totalCreditsApplied;
        if (remainingCredits > 0) {
          feeMessage += ` ₹${remainingCredits} in credits available for future use.`;
        }

      } catch (feeError) {
        console.error('\n=== FEE MIGRATION ERROR ===');
        console.error('Error handling fee migration during class change:', feeError);
        console.error('Error stack:', feeError.stack);
        console.error('Student ID:', student._id);
        console.error('Original Class ID:', originalClassId);
        console.error('New Class ID:', newClassId);
        console.error('Tenant ID:', req.user.tenant._id);
        feeMessage += ' Note: There was an issue with fee migration. Please check the fee assignments manually.';
      }
    } else {
      console.log('Class is NOT changing - no fee migration needed');
    }

    // Step 5: Update the student record with student-specific data
    Object.assign(student, studentData);
    await student.save({ session });

    // Step 6: Commit the transaction
    await session.commitTransaction();

    // Step 7: Populate the updated student with fresh parent data for the response
    const populatedStudent = await student.populate('class parent');

    const responseMessage = isClassChanging
      ? `Student transferred successfully from old class to new class.${feeMessage}`
      : 'Student and parent details updated successfully.';

    res.status(200).json({
      success: true,
      data: populatedStudent,
      message: responseMessage,
      classChanged: isClassChanging,
      feeUpdates: isClassChanging ? feeMessage.trim() : null
    });

  } catch (error) {
    await session.abortTransaction();

    // Handle MongoDB duplicate key error specifically for roll number in new class
    if (error.code === 11000) {
      if (error.message.includes('rollNumber')) {
        return res.status(400).json({
          success: false,
          message: `Roll number ${req.body.rollNumber} is already taken in the target class. Please choose a different roll number.`,
          duplicateField: 'rollNumber'
        });
      }
    }

    res.status(400).json({
      success: false,
      message: 'Error updating details',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

// @desc    Delete student (soft delete)
// @route   DELETE /api/admin/students/:id
// @access  Private/Admin
const deleteStudent = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const student = await Student.findOne({
      _id: req.params.id,
      tenant: req.user.tenant._id
    }).session(session);

    if (!student) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Handle fee assignments when removing a student
    const { FeeAssignment } = require('../models/Fee');

    // Get current pending/unpaid fee assignments
    const currentFeeAssignments = await FeeAssignment.find({
      tenant: req.user.tenant._id,
      student: student._id,
      status: { $in: ['pending', 'partially_paid', 'overdue'] }
    }).session(session);

    let feeMessage = '';

    if (currentFeeAssignments.length > 0) {
      // Cancel unpaid fee assignments
      const unpaidAssignments = currentFeeAssignments.filter(assignment =>
        assignment.paidAmount === 0 || assignment.paidAmount === null
      );

      if (unpaidAssignments.length > 0) {
        await FeeAssignment.updateMany(
          { _id: { $in: unpaidAssignments.map(a => a._id) } },
          {
            $set: {
              status: 'cancelled',
              cancelledAt: new Date(),
              cancelledBy: req.user._id,
              cancellationReason: `Student deactivated/removed from school`
            }
          },
          { session }
        );

        feeMessage += ` ${unpaidAssignments.length} unpaid fee assignment(s) have been cancelled.`;
      }

      // Keep partially paid assignments but mark them with notes
      const partiallyPaidAssignments = currentFeeAssignments.filter(assignment =>
        assignment.paidAmount > 0 && assignment.paidAmount < assignment.finalAmount
      );

      if (partiallyPaidAssignments.length > 0) {
        await FeeAssignment.updateMany(
          { _id: { $in: partiallyPaidAssignments.map(a => a._id) } },
          {
            $set: {
              remarks: `Student deactivated on ${new Date().toISOString().split('T')[0]}. Partial payment retained.`
            }
          },
          { session }
        );

        feeMessage += ` ${partiallyPaidAssignments.length} partially paid fee(s) have been retained with notes.`;
      }
    }

    // Deactivate the student
    student.isActive = false;
    student.deactivatedAt = new Date();
    student.deactivatedBy = req.user._id;
    await student.save({ session });

    await session.commitTransaction();

    const responseMessage = `Student deactivated successfully.${feeMessage}`;

    res.status(200).json({
      success: true,
      message: responseMessage,
      feeUpdates: feeMessage.trim() || null
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({
      success: false,
      message: 'Error deleting student',
      error: error.message
    });
  } finally {
    session.endSession();
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
  
  const assignments = await FeeAssignment.find({ 
    tenant: tenantId,
    status: { $ne: 'cancelled' }
  });
  
  let totalExpected = 0;
  let totalCollected = 0;
  let totalPending = 0;
  let totalOverdue = 0;
  
  assignments.forEach(assignment => {
    totalExpected += assignment.finalAmount;
    totalCollected += (assignment.paidAmount || 0);

    const pendingAmount = assignment.finalAmount - (assignment.paidAmount || 0);

    if (assignment.status === 'pending' || assignment.status === 'partially_paid') {
      totalPending += pendingAmount;
    } else if (assignment.status === 'overdue') {
      totalOverdue += pendingAmount;
    }
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

// @desc    Mark teacher attendance for current or past date
// @route   POST /api/admin/teacher-attendance
// @access  Private/Admin
const markTeacherAttendance = async (req, res) => {
  try {
    const { teacherId, date, status, remarks, checkInTime, checkOutTime, lateBy } = req.body;
    
    // Validate required fields
    if (!teacherId || !date || !status) {
      return res.status(400).json({
        success: false,
        message: 'Teacher ID, date, and status are required'
      });
    }
    
    // Verify teacher exists and belongs to the same tenant
    const teacher = await User.findOne({
      _id: teacherId,
      tenant: req.user.tenant._id,
      role: 'teacher',
      isActive: true
    });
    
    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: 'Teacher not found'
      });
    }
    
    // Convert date to start of day for consistent comparison
    const attendanceDate = new Date(date);
    attendanceDate.setHours(0, 0, 0, 0);
    
    // Check if attendance already exists for this teacher and date
    const existingAttendance = await TeacherAttendance.findOne({
      tenant: req.user.tenant._id,
      teacher: teacherId,
      date: attendanceDate
    });
    
    if (existingAttendance) {
      // Update existing attendance
      existingAttendance.status = status;
      existingAttendance.remarks = remarks || existingAttendance.remarks;
      existingAttendance.checkInTime = checkInTime ? new Date(checkInTime) : existingAttendance.checkInTime;
      existingAttendance.checkOutTime = checkOutTime ? new Date(checkOutTime) : existingAttendance.checkOutTime;
      existingAttendance.lateBy = lateBy || existingAttendance.lateBy;
      existingAttendance.markedBy = req.user._id;
      
      await existingAttendance.save();
      
      return res.status(200).json({
        success: true,
        message: 'Teacher attendance updated successfully',
        data: existingAttendance
      });
    }
    
    // Create new attendance record
    const attendance = await TeacherAttendance.create({
      tenant: req.user.tenant._id,
      teacher: teacherId,
      date: attendanceDate,
      status,
      markedBy: req.user._id,
      remarks,
      checkInTime: checkInTime ? new Date(checkInTime) : null,
      checkOutTime: checkOutTime ? new Date(checkOutTime) : null,
      lateBy: lateBy || null
    });
    
    res.status(201).json({
      success: true,
      message: 'Teacher attendance marked successfully',
      data: attendance
    });
    
  } catch (error) {
    console.error('Error marking teacher attendance:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking teacher attendance',
      error: error.message
    });
  }
};

// @desc    Get teacher attendance for a specific date or date range
// @route   GET /api/admin/teacher-attendance
// @access  Private/Admin
const getTeacherAttendance = async (req, res) => {
  try {
    const { date, startDate, endDate, teacherId, month, year, calendarView } = req.query;
    
    let filter = { tenant: req.user.tenant._id };
    let queryDate = null;
    let dateRange = null;
    
    // Add teacher filter if specified
    if (teacherId) {
      filter.teacher = teacherId;
    }
    
    // Handle different date query scenarios
    if (date) {
      // Single date
      queryDate = new Date(date);
      queryDate.setHours(0, 0, 0, 0);
      const nextDay = new Date(queryDate);
      nextDay.setDate(nextDay.getDate() + 1);
      
      filter.date = { $gte: queryDate, $lt: nextDay };
    } else if (startDate && endDate) {
      // Date range with 31-day limit validation
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      
      // Validate date range (max 31 days)
      const daysDifference = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
      if (daysDifference > 31) {
        return res.status(400).json({
          success: false,
          message: 'Date range cannot exceed 31 days',
          maxDays: 31,
          requestedDays: daysDifference
        });
      }
      
      dateRange = { start, end };
      filter.date = { $gte: start, $lte: end };
    } else if (month && year) {
      // Specific month and year
      const startOfMonth = new Date(year, month - 1, 1);
      const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);
      
      dateRange = { start: startOfMonth, end: endOfMonth };
      filter.date = { $gte: startOfMonth, $lte: endOfMonth };
    } else {
      // Default to current month if no date parameters provided
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      
      dateRange = { start: startOfMonth, end: endOfMonth };
      filter.date = { $gte: startOfMonth, $lte: endOfMonth };
    }
    
    const attendance = await TeacherAttendance.find(filter)
      .populate('teacher', 'firstName lastName email teacherInfo.employeeId')
      .populate('markedBy', 'firstName lastName')
      .sort({ date: -1, 'teacher.firstName': 1 });
    
    // Calendar view - detailed day-by-day breakdown
    if (calendarView === 'true' && dateRange) {
      return await getCalendarViewAttendance(req, res, dateRange, attendance);
    }
    
    // Enhanced response with submission metadata for single date queries
    let responseData = {
      success: true,
      count: attendance.length,
      data: attendance
    };
    
    // If querying for a specific single date, add submission metadata
    if (date && queryDate) {
      // Get total number of active teachers for this tenant
      const totalTeachers = await User.countDocuments({
        tenant: req.user.tenant._id,
        role: 'teacher',
        isActive: true
      });
      
      // Check if attendance has been bulk submitted (all teachers have records for this date)
      const attendanceForDate = attendance.filter(att => {
        const attDate = new Date(att.date);
        attDate.setHours(0, 0, 0, 0);
        return attDate.getTime() === queryDate.getTime();
      });
      
      const isSubmitted = attendanceForDate.length > 0 && attendanceForDate.length === totalTeachers;
      
      // Find the admin who submitted (assuming bulk submission by same admin)
      let submittedBy = null;
      if (isSubmitted && attendanceForDate.length > 0) {
        // Get the first admin who marked attendance (assuming bulk submission)
        const firstRecord = attendanceForDate.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0];
        submittedBy = {
          id: firstRecord.markedBy._id,
          name: `${firstRecord.markedBy.firstName} ${firstRecord.markedBy.lastName}`,
          submittedAt: firstRecord.createdAt
        };
      }
      
      responseData = {
        success: true,
        date: queryDate.toISOString().split('T')[0],
        isSubmitted: isSubmitted,
        submittedBy: submittedBy,
        count: attendance.length,
        totalTeachers: totalTeachers,
        data: attendance
      };
    }
    
    res.status(200).json(responseData);
    
  } catch (error) {
    console.error('Error fetching teacher attendance:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching teacher attendance',
      error: error.message
    });
  }
};

// Helper function for calendar view attendance
const getCalendarViewAttendance = async (req, res, dateRange, attendanceRecords) => {
  try {
    // Get all active teachers for this tenant
    const teachers = await User.find({
      tenant: req.user.tenant._id,
      role: 'teacher',
      isActive: true
    }).select('firstName lastName email teacherInfo.employeeId').sort('firstName');
    
    // Generate all dates in the range
    const dates = [];
    const currentDate = new Date(dateRange.start);
    const endDate = new Date(dateRange.end);
    
    while (currentDate <= endDate) {
      dates.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Create attendance map for quick lookup
    const attendanceMap = new Map();
    attendanceRecords.forEach(record => {
      const dateKey = record.date.toISOString().split('T')[0];
      const teacherKey = record.teacher._id.toString();
      const key = `${dateKey}-${teacherKey}`;
      attendanceMap.set(key, record);
    });
    
    // Build calendar data
    const calendarData = dates.map(date => {
      const dateStr = date.toISOString().split('T')[0];
      const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
      
      const teacherAttendance = teachers.map(teacher => {
        const key = `${dateStr}-${teacher._id.toString()}`;
        const attendanceRecord = attendanceMap.get(key);
        
        return {
          teacherId: teacher._id,
          teacherName: `${teacher.firstName} ${teacher.lastName}`,
          employeeId: teacher.teacherInfo?.employeeId,
          email: teacher.email,
          status: attendanceRecord?.status || 'not_marked',
          remarks: attendanceRecord?.remarks || null,
          checkInTime: attendanceRecord?.checkInTime || null,
          checkOutTime: attendanceRecord?.checkOutTime || null,
          lateBy: attendanceRecord?.lateBy || null,
          workingHours: attendanceRecord?.workingHours || null,
          markedBy: attendanceRecord?.markedBy ? {
            id: attendanceRecord.markedBy._id,
            name: `${attendanceRecord.markedBy.firstName} ${attendanceRecord.markedBy.lastName}`
          } : null,
          markedAt: attendanceRecord?.createdAt || null
        };
      });
      
      // Calculate daily statistics
      const totalTeachers = teachers.length;
      const presentCount = teacherAttendance.filter(t => t.status === 'present').length;
      const absentCount = teacherAttendance.filter(t => t.status === 'absent').length;
      const lateCount = teacherAttendance.filter(t => t.status === 'late').length;
      const notMarkedCount = teacherAttendance.filter(t => t.status === 'not_marked').length;
      const isFullyMarked = notMarkedCount === 0;
      const isPartiallyMarked = notMarkedCount > 0 && notMarkedCount < totalTeachers;
      
      return {
        date: dateStr,
        dayName: dayName,
        isWeekend: date.getDay() === 0 || date.getDay() === 6, // Sunday = 0, Saturday = 6
        statistics: {
          totalTeachers,
          present: presentCount,
          absent: absentCount,
          late: lateCount,
          notMarked: notMarkedCount,
          attendanceRate: totalTeachers > 0 ? Math.round(((presentCount + lateCount) / totalTeachers) * 100) : 0,
          isFullyMarked,
          isPartiallyMarked,
          completionRate: totalTeachers > 0 ? Math.round(((totalTeachers - notMarkedCount) / totalTeachers) * 100) : 0
        },
        teachers: teacherAttendance
      };
    });
    
    // Calculate overall summary for the period
    const overallStats = {
      totalDays: dates.length,
      totalTeachers: teachers.length,
      totalPossibleRecords: dates.length * teachers.length,
      totalMarkedRecords: attendanceRecords.length,
      totalNotMarked: (dates.length * teachers.length) - attendanceRecords.length,
      fullyMarkedDays: calendarData.filter(day => day.statistics.isFullyMarked).length,
      partiallyMarkedDays: calendarData.filter(day => day.statistics.isPartiallyMarked).length,
      notMarkedDays: calendarData.filter(day => day.statistics.notMarked === day.statistics.totalTeachers).length,
      overallCompletionRate: ((attendanceRecords.length / (dates.length * teachers.length)) * 100).toFixed(1)
    };
    
    // Teacher-wise summary
    const teacherSummary = teachers.map(teacher => {
      const teacherRecords = attendanceRecords.filter(record => 
        record.teacher._id.toString() === teacher._id.toString()
      );
      
      const presentDays = teacherRecords.filter(r => r.status === 'present').length;
      const absentDays = teacherRecords.filter(r => r.status === 'absent').length;
      const lateDays = teacherRecords.filter(r => r.status === 'late').length;
      const notMarkedDays = dates.length - teacherRecords.length;
      const totalWorkingHours = teacherRecords.reduce((sum, r) => sum + (r.workingHours || 0), 0);
      
      return {
        teacherId: teacher._id,
        teacherName: `${teacher.firstName} ${teacher.lastName}`,
        employeeId: teacher.teacherInfo?.employeeId,
        email: teacher.email,
        summary: {
          totalDays: dates.length,
          presentDays,
          absentDays,
          lateDays,
          notMarkedDays,
          attendanceRate: dates.length > 0 ? Math.round(((presentDays + lateDays) / dates.length) * 100) : 0,
          completionRate: dates.length > 0 ? Math.round(((dates.length - notMarkedDays) / dates.length) * 100) : 0,
          totalWorkingHours: Math.round(totalWorkingHours * 100) / 100,
          averageWorkingHours: teacherRecords.length > 0 ? Math.round((totalWorkingHours / teacherRecords.length) * 100) / 100 : 0
        }
      };
    });
    
    return res.status(200).json({
      success: true,
      calendarView: true,
      period: {
        startDate: dateRange.start.toISOString().split('T')[0],
        endDate: dateRange.end.toISOString().split('T')[0],
        totalDays: dates.length
      },
      overallSummary: overallStats,
      teacherSummary: teacherSummary,
      dailyBreakdown: calendarData
    });
    
  } catch (error) {
    console.error('Error generating calendar view:', error);
    return res.status(500).json({
      success: false,
      message: 'Error generating calendar view',
      error: error.message
    });
  }
};

// @desc    Get teacher attendance summary
// @route   GET /api/admin/teacher-attendance/summary/:teacherId
// @access  Private/Admin
const getTeacherAttendanceSummary = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { startDate, endDate, month, year } = req.query;
    
    // Verify teacher exists and belongs to the same tenant
    const teacher = await User.findOne({
      _id: teacherId,
      tenant: req.user.tenant._id,
      role: 'teacher',
      isActive: true
    }).select('firstName lastName email teacherInfo.employeeId');
    
    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: 'Teacher not found'
      });
    }
    
    let start, end;
    
    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
    } else if (month && year) {
      start = new Date(year, month - 1, 1);
      end = new Date(year, month, 0);
    } else {
      // Default to current month
      const now = new Date();
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }
    
    const summary = await TeacherAttendance.getAttendanceSummary(teacherId, start, end);
    
    res.status(200).json({
      success: true,
      data: {
        teacher: {
          _id: teacher._id,
          name: `${teacher.firstName} ${teacher.lastName}`,
          email: teacher.email,
          employeeId: teacher.teacherInfo?.employeeId
        },
        period: {
          startDate: start,
          endDate: end
        },
        summary
      }
    });
    
  } catch (error) {
    console.error('Error fetching teacher attendance summary:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching teacher attendance summary',
      error: error.message
    });
  }
};

// @desc    Get monthly attendance report for all teachers
// @route   GET /api/admin/teacher-attendance/monthly-report
// @access  Private/Admin
const getMonthlyAttendanceReport = async (req, res) => {
  try {
    const { month, year } = req.query;
    
    // Default to current month if not specified
    const now = new Date();
    const reportMonth = month ? parseInt(month) : now.getMonth() + 1;
    const reportYear = year ? parseInt(year) : now.getFullYear();
    
    const report = await TeacherAttendance.getMonthlyReport(req.user.tenant._id, reportYear, reportMonth);
    
    res.status(200).json({
      success: true,
      data: {
        period: {
          month: reportMonth,
          year: reportYear,
          monthName: new Date(reportYear, reportMonth - 1).toLocaleString('default', { month: 'long' })
        },
        teachers: report
      }
    });
    
  } catch (error) {
    console.error('Error generating monthly attendance report:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating monthly attendance report',
      error: error.message
    });
  }
};

// @desc    Mark attendance for multiple teachers (bulk operation)
// @route   POST /api/admin/teacher-attendance/bulk
// @access  Private/Admin
const bulkMarkTeacherAttendance = async (req, res) => {
  try {
    const { date, attendanceData } = req.body;
    
    // Validate required fields
    if (!date || !attendanceData || !Array.isArray(attendanceData)) {
      return res.status(400).json({
        success: false,
        message: 'Date and attendance data array are required'
      });
    }
    
    // Convert date to start of day for consistent comparison
    const attendanceDate = new Date(date);
    attendanceDate.setHours(0, 0, 0, 0);
    
    const results = [];
    const errors = [];
    
    // Process each teacher's attendance
    for (const data of attendanceData) {
      try {
        const { teacherId, status, remarks, checkInTime, checkOutTime, lateBy } = data;
        
        if (!teacherId || !status) {
          errors.push({ teacherId, error: 'Teacher ID and status are required' });
          continue;
        }
        
        // Verify teacher exists and belongs to the same tenant
        const teacher = await User.findOne({
          _id: teacherId,
          tenant: req.user.tenant._id,
          role: 'teacher',
          isActive: true
        });
        
        if (!teacher) {
          errors.push({ teacherId, error: 'Teacher not found' });
          continue;
        }
        
        // Check if attendance already exists
        const existingAttendance = await TeacherAttendance.findOne({
          tenant: req.user.tenant._id,
          teacher: teacherId,
          date: attendanceDate
        });
        
        if (existingAttendance) {
          // Update existing attendance
          existingAttendance.status = status;
          existingAttendance.remarks = remarks || existingAttendance.remarks;
          existingAttendance.checkInTime = checkInTime ? new Date(checkInTime) : existingAttendance.checkInTime;
          existingAttendance.checkOutTime = checkOutTime ? new Date(checkOutTime) : existingAttendance.checkOutTime;
          existingAttendance.lateBy = lateBy || existingAttendance.lateBy;
          existingAttendance.markedBy = req.user._id;
          
          await existingAttendance.save();
          results.push({ teacherId, action: 'updated', attendance: existingAttendance });
        } else {
          // Create new attendance record
          const attendance = await TeacherAttendance.create({
            tenant: req.user.tenant._id,
            teacher: teacherId,
            date: attendanceDate,
            status,
            markedBy: req.user._id,
            remarks,
            checkInTime: checkInTime ? new Date(checkInTime) : null,
            checkOutTime: checkOutTime ? new Date(checkOutTime) : null,
            lateBy: lateBy || null
          });
          
          results.push({ teacherId, action: 'created', attendance });
        }
      } catch (error) {
        errors.push({ teacherId: data.teacherId, error: error.message });
      }
    }
    
    res.status(200).json({
      success: true,
      message: `Processed ${results.length} teacher attendance records`,
      data: {
        successful: results,
        failed: errors,
        summary: {
          total: attendanceData.length,
          successful: results.length,
          failed: errors.length
        }
      }
    });
    
  } catch (error) {
    console.error('Error in bulk teacher attendance marking:', error);
    res.status(500).json({
      success: false,
      message: 'Error in bulk teacher attendance marking',
      error: error.message
    });
  }
};

// @desc    Get recent activities for admin dashboard
// @route   GET /api/admin/recent-activities
// @access  Private/Admin
const getRecentActivities = async (req, res) => {
  try {
    const {
      limit = 50,
      page = 1,
      type,
      teacherId,
      classId,
      startDate,
      endDate
    } = req.query;

    const skip = (page - 1) * limit;
    
    const options = {
      limit: parseInt(limit),
      skip: skip,
      type: type || null,
      teacherId: teacherId || null,
      classId: classId || null,
      startDate: startDate || null,
      endDate: endDate || null
    };

    const activities = await Activity.getRecentActivities(req.user.tenant._id, options);
    
    // Get total count for pagination
    const query = { tenant: req.user.tenant._id };
    if (type) query.type = type;
    if (teacherId) query.teacher = teacherId;
    if (classId) query.class = classId;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    const totalActivities = await Activity.countDocuments(query);
    
    // Group activities by type for summary
    const activitySummary = await Activity.aggregate([
      { $match: { tenant: new mongoose.Types.ObjectId(req.user.tenant._id) } },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          lastActivity: { $max: '$createdAt' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        activities,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalActivities / limit),
          totalActivities,
          hasNextPage: skip + activities.length < totalActivities,
          hasPrevPage: page > 1
        },
        summary: {
          totalActivities,
          activityBreakdown: activitySummary
        }
      }
    });
  } catch (error) {
    console.error('Error fetching recent activities:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching recent activities',
      error: error.message
    });
  }
};

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
  getParents,
  updateStudent,
  deleteStudent,
  deleteClass,
  resetUserPassword,
  getDashboardData,
  getAvailableTeachers,
  markTeacherAttendance,
  getTeacherAttendance,
  getTeacherAttendanceSummary,
  getMonthlyAttendanceReport,
  bulkMarkTeacherAttendance,
  getRecentActivities
};