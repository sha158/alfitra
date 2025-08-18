// src/controllers/superAdminController.js
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Student = require('../models/Student');
const { FeePayment } = require('../models/Fee');
const { sendTokenResponse } = require('../utils/tokenGenerator');
const { validatePasswordStrength } = require('../utils/passwordUtils');

// @desc    Get all tenants
// @route   GET /api/superadmin/tenants
// @access  Private/SuperAdmin
const getAllTenants = async (req, res) => {
  try {
    const tenants = await Tenant.find({ isDeleted: false })
      .select('-settings')
      .sort('-createdAt');
    
    // Get additional stats for each tenant
    const tenantsWithStats = await Promise.all(
      tenants.map(async (tenant) => {
        const tenantObj = tenant.toObject();
        
        // Get counts
        const [studentCount, teacherCount, totalRevenue] = await Promise.all([
          Student.countDocuments({ tenant: tenant._id, isActive: true }),
          User.countDocuments({ tenant: tenant._id, role: 'teacher', isActive: true }),
          FeePayment.aggregate([
            { $match: { tenant: tenant._id, status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
          ])
        ]);
        
        tenantObj.stats = {
          students: studentCount,
          teachers: teacherCount,
          revenue: totalRevenue[0]?.total || 0
        };
        
        return tenantObj;
      })
    );
    
    res.status(200).json({
      success: true,
      count: tenants.length,
      data: tenantsWithStats
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error fetching tenants',
      error: error.message
    });
  }
};

// @desc    Create new tenant/school
// @route   POST /api/superadmin/tenants
// @access  Private/SuperAdmin
const createTenant = async (req, res) => {
  try {
    const {
      // Tenant info
      schoolName,
      schoolCode,
      schoolEmail,
      schoolPhone,
      address,
      subscription,
      // Admin info
      firstName,
      lastName,
      email,
      phone,
      password
    } = req.body;
    
    // Validate password
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Password validation failed',
        errors: passwordValidation.errors
      });
    }
    
    // Check if tenant already exists
    const existingTenant = await Tenant.findOne({ code: schoolCode });
    if (existingTenant) {
      return res.status(400).json({
        success: false,
        message: 'School code already exists'
      });
    }
    
    // Create tenant with custom subscription if provided
    const tenantData = {
      name: schoolName,
      code: schoolCode,
      email: schoolEmail,
      phone: schoolPhone,
      address
    };
    
    if (subscription) {
      tenantData.subscription = subscription;
    }
    
    const tenant = await Tenant.create(tenantData);
    
    // Create admin user for the tenant
    const adminUser = await User.create({
      tenant: tenant._id,
      firstName,
      lastName,
      email,
      phone,
      password,
      role: 'admin',
      adminInfo: {
        employeeId: `ADM${Date.now()}`,
        department: 'Administration'
      },
      isEmailVerified: true
    });
    
    res.status(201).json({
      success: true,
      data: {
        tenant,
        admin: {
          id: adminUser._id,
          email: adminUser.email,
          name: adminUser.fullName
        }
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error creating tenant',
      error: error.message
    });
  }
};

// @desc    Update tenant
// @route   PUT /api/superadmin/tenants/:id
// @access  Private/SuperAdmin
const updateTenant = async (req, res) => {
  try {
    const { subscription, isActive, settings } = req.body;
    
    const updateData = {};
    if (subscription) updateData.subscription = subscription;
    if (typeof isActive === 'boolean') updateData.isActive = isActive;
    if (settings) updateData.settings = settings;
    
    const tenant = await Tenant.findByIdAndUpdate(
      req.params.id,
      updateData,
      {
        new: true,
        runValidators: true
      }
    );
    
    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: tenant
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error updating tenant',
      error: error.message
    });
  }
};

// @desc    Delete tenant (soft delete)
// @route   DELETE /api/superadmin/tenants/:id
// @access  Private/SuperAdmin
const deleteTenant = async (req, res) => {
  try {
    const tenant = await Tenant.findByIdAndUpdate(
      req.params.id,
      { 
        isActive: false,
        isDeleted: true 
      },
      { new: true }
    );
    
    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }
    
    // Deactivate all users of this tenant
    await User.updateMany(
      { tenant: req.params.id },
      { isActive: false }
    );
    
    res.status(200).json({
      success: true,
      message: 'Tenant and all associated users deactivated successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error deleting tenant',
      error: error.message
    });
  }
};

// @desc    Get system-wide statistics
// @route   GET /api/superadmin/stats
// @access  Private/SuperAdmin
const getSystemStats = async (req, res) => {
  try {
    const [
      totalTenants,
      activeTenants,
      totalStudents,
      totalTeachers,
      totalParents,
      revenueStats
    ] = await Promise.all([
      Tenant.countDocuments({ isDeleted: false }),
      Tenant.countDocuments({ isActive: true, isDeleted: false }),
      Student.countDocuments({ isActive: true }),
      User.countDocuments({ role: 'teacher', isActive: true }),
      User.countDocuments({ role: 'parent', isActive: true }),
      FeePayment.aggregate([
        { $match: { status: 'completed' } },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$amount' },
            totalTransactions: { $sum: 1 }
          }
        }
      ])
    ]);
    
    // Get monthly revenue for last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const monthlyRevenue = await FeePayment.aggregate([
      {
        $match: {
          status: 'completed',
          paymentDate: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$paymentDate' },
            month: { $month: '$paymentDate' }
          },
          revenue: { $sum: '$amount' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);
    
    res.status(200).json({
      success: true,
      data: {
        tenants: {
          total: totalTenants,
          active: activeTenants
        },
        users: {
          students: totalStudents,
          teachers: totalTeachers,
          parents: totalParents,
          total: totalStudents + totalTeachers + totalParents
        },
        revenue: {
          total: revenueStats[0]?.totalRevenue || 0,
          transactions: revenueStats[0]?.totalTransactions || 0,
          monthlyTrend: monthlyRevenue
        }
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error fetching system stats',
      error: error.message
    });
  }
};

// @desc    Make an admin user super admin
// @route   PUT /api/superadmin/make-super-admin/:userId
// @access  Private/SuperAdmin
const makeSuperAdmin = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).populate('tenant');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    if (user.role !== 'admin') {
      return res.status(400).json({
        success: false,
        message: 'Only admin users can be made super admin'
      });
    }
    
    // Update user
    user.isSuperAdmin = true;
    await user.save();
    
    // Update tenant
    await Tenant.findByIdAndUpdate(user.tenant._id, {
      isSuperAdmin: true
    });
    
    res.status(200).json({
      success: true,
      message: 'User is now a super admin',
      data: user
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error making user super admin',
      error: error.message
    });
  }
};

// @desc    Remove super admin privileges
// @route   PUT /api/superadmin/remove-super-admin/:userId
// @access  Private/SuperAdmin
const removeSuperAdmin = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Prevent removing own super admin status
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot remove your own super admin status'
      });
    }
    
    // Update user
    user.isSuperAdmin = false;
    await user.save();
    
    res.status(200).json({
      success: true,
      message: 'Super admin privileges removed',
      data: user
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error removing super admin privileges',
      error: error.message
    });
  }
};

module.exports = {
  getAllTenants,
  createTenant,
  updateTenant,
  deleteTenant,
  getSystemStats,
  makeSuperAdmin,
  removeSuperAdmin
};