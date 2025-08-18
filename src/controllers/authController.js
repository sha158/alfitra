
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const { sendTokenResponse } = require('../utils/tokenGenerator');
const { validatePasswordStrength } = require('../utils/passwordUtils');

// @desc    Register a new tenant with admin user
// @route   POST /api/auth/register-tenant
// @access  Public
const registerTenant = async (req, res, next) => {
  try {
    const {
      // Tenant info
      schoolName,
      schoolCode,
      schoolEmail,
      schoolPhone,
      address,
      // Admin info
      firstName,
      lastName,
      email,
      phone,
      password
    } = req.body;
    
    // Validate password strength
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
    
    // Create tenant
    const tenant = await Tenant.create({
      name: schoolName,
      code: schoolCode,
      email: schoolEmail,
      phone: schoolPhone,
      address
    });
    
    // Create admin user
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
      isEmailVerified: true // Auto-verify admin
    });
    
    // Send token response
    sendTokenResponse(adminUser, 201, res);
  } catch (error) {
    // Clean up if error
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: messages
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error creating tenant',
      error: error.message
    });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res, next) => {
  try {
    const { email, password, tenantCode } = req.body;
    
    // Validate email & password
    if (!email || !password || !tenantCode) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email, password and school code'
      });
    }
    
    // Find tenant
    const tenant = await Tenant.findByCode(tenantCode);
    if (!tenant) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    // Check if tenant is active
    if (!tenant.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Your school account is inactive. Please contact support.'
      });
    }
    
    // Find user
    const user = await User.findOne({ 
      email: email.toLowerCase(), 
      tenant: tenant._id 
    }).select('+password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Your account is deactivated. Please contact admin.'
      });
    }
    
    // Check password
    const isPasswordMatch = await user.matchPassword(password);
    
    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    // Update last login
    user.lastLogin = Date.now();
    await user.save({ validateBeforeSave: false });
    
    // Populate tenant for response
    await user.populate('tenant');
    
    // Send token response
    sendTokenResponse(user, 200, res);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error logging in',
      error: error.message
    });
  }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).populate('tenant');
    
    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching user',
      error: error.message
    });
  }
};

// @desc    Log user out / clear cookie
// @route   GET /api/auth/logout
// @access  Private
const logout = async (req, res, next) => {
  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 10 * 1000), // 10 seconds
    httpOnly: true
  });
  
  res.status(200).json({
    success: true,
    data: {}
  });
};

// @desc    Update password
// @route   PUT /api/auth/updatepassword
// @access  Private
const updatePassword = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('+password');
    
    // Check current password
    if (!(await user.matchPassword(req.body.currentPassword))) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }
    
    // Validate new password
    const passwordValidation = validatePasswordStrength(req.body.newPassword);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Password validation failed',
        errors: passwordValidation.errors
      });
    }
    
    user.password = req.body.newPassword;
    await user.save();
    
    sendTokenResponse(user, 200, res);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating password',
      error: error.message
    });
  }
};

const updateFCMToken = async (req, res) => {
  try {
    const { token, platform = 'android' } = req.body;
    
    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'FCM token is required'
      });
    }
    
    // Update user's FCM token
    await req.user.updateFCMToken(token, platform);
    
    res.status(200).json({
      success: true,
      message: 'FCM token updated successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error updating FCM token',
      error: error.message
    });
  }
};

// @desc    Remove FCM token (for logout)
// @route   DELETE /api/auth/fcm-token
// @access  Private
const removeFCMToken = async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'FCM token is required'
      });
    }
    
    // Remove FCM token
    await req.user.removeFCMToken(token);
    
    res.status(200).json({
      success: true,
      message: 'FCM token removed successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error removing FCM token',
      error: error.message
    });
  }
};

module.exports = {
  registerTenant,
  login,
  updateFCMToken,
  removeFCMToken,
  getMe,
  logout,
  updatePassword
};