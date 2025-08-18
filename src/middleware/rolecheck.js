// src/middleware/roleCheck.js
const { USER_ROLES } = require('../config/constants');

// Grant access to specific roles
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role '${req.user.role}' is not authorized to access this route`
      });
    }
    
    next();
  };
};

// Check if user is admin
const isAdmin = (req, res, next) => {
  if (req.user.role !== USER_ROLES.ADMIN) {
    return res.status(403).json({
      success: false,
      message: 'Only administrators can access this route'
    });
  }
  next();
};

// Check if user is teacher
const isTeacher = (req, res, next) => {
  if (req.user.role !== USER_ROLES.TEACHER) {
    return res.status(403).json({
      success: false,
      message: 'Only teachers can access this route'
    });
  }
  next();
};

// Check if user is parent
const isParent = (req, res, next) => {
  if (req.user.role !== USER_ROLES.PARENT) {
    return res.status(403).json({
      success: false,
      message: 'Only parents can access this route'
    });
  }
  next();
};

// Check if user is teacher or admin
const isTeacherOrAdmin = (req, res, next) => {
  if (![USER_ROLES.TEACHER, USER_ROLES.ADMIN].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Only teachers and administrators can access this route'
    });
  }
  next();
};

// Check if user is super admin
const isSuperAdmin = (req, res, next) => {
  if (!req.user.isSuperAdmin) {
    return res.status(403).json({
      success: false,
      message: 'Super admin access required'
    });
  }
  next();
};

module.exports = {
  authorize,
  isAdmin,
  isTeacher,
  isParent,
  isTeacherOrAdmin,
  isSuperAdmin
};