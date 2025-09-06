const Subject = require('../models/Subject');

// @desc    Create a new subject
// @route   POST /api/admin/subjects
// @access  Private/Admin
const createSubject = async (req, res) => {
  try {
    const { name, code, description } = req.body;
    
    const subject = await Subject.create({
      tenant: req.user.tenant._id,
      name,
      code,
      description
    });

    res.status(201).json({
      success: true,
      message: 'Subject created successfully',
      data: subject
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Subject name already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get all subjects
// @route   GET /api/admin/subjects
// @access  Private/Admin
const getSubjects = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', isActive } = req.query;
    
    const query = { tenant: req.user.tenant._id };
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    const subjects = await Subject.find(query)
      .sort({ name: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Subject.countDocuments(query);

    res.json({
      success: true,
      data: {
        subjects,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / limit),
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Update a subject
// @route   PUT /api/admin/subjects/:id
// @access  Private/Admin
const updateSubject = async (req, res) => {
  try {
    const { name, code, description, isActive } = req.body;
    
    const subject = await Subject.findOneAndUpdate(
      { _id: req.params.id, tenant: req.user.tenant._id },
      { name, code, description, isActive },
      { new: true, runValidators: true }
    );

    if (!subject) {
      return res.status(404).json({
        success: false,
        message: 'Subject not found'
      });
    }

    res.json({
      success: true,
      message: 'Subject updated successfully',
      data: subject
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Subject name already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Delete a subject
// @route   DELETE /api/admin/subjects/:id
// @access  Private/Admin
const deleteSubject = async (req, res) => {
  try {
    const subject = await Subject.findOneAndDelete({
      _id: req.params.id,
      tenant: req.user.tenant._id
    });

    if (!subject) {
      return res.status(404).json({
        success: false,
        message: 'Subject not found'
      });
    }

    res.json({
      success: true,
      message: 'Subject deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get subjects dropdown (simplified list)
// @route   GET /api/admin/subjects/dropdown
// @access  Private/Admin
const getSubjectsDropdown = async (req, res) => {
  try {
    const subjects = await Subject.find({
      tenant: req.user.tenant._id,
      isActive: true
    })
    .select('name code')
    .sort({ name: 1 });

    res.json({
      success: true,
      data: subjects
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

module.exports = {
  createSubject,
  getSubjects,
  updateSubject,
  deleteSubject,
  getSubjectsDropdown
};