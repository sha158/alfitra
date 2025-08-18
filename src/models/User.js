// src/models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { USER_ROLES } = require('../config/constants');

const userSchema = new mongoose.Schema({
  // Reference to tenant (for multi-tenancy)
  tenant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: [true, 'Tenant is required']
  },
  
  // Basic information
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters']
  },
  
  lastName: {
    type: String,
    required: false, // Made optional
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters'],
    default: '' // Add default empty string
  },
  fcmTokens: [{
  token: {
    type: String,
    required: true
  },
  platform: {
    type: String,
    enum: ['android', 'ios', 'web'],
    default: 'android'
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}],
  
  email: {
    type: String,
    required: [true, 'Email is required'],
    lowercase: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
  },
  
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    match: [/^[0-9]{10}$/, 'Please provide a valid 10-digit phone number']
  },
  
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false // Don't return password by default
  },
  
  role: {
    type: String,
    required: [true, 'User role is required'],
    enum: {
      values: Object.values(USER_ROLES),
      message: 'Invalid role selected'
    }
  },
  
  // Profile picture
  avatar: {
    type: String,
    default: null
  },
  
  // Teacher specific fields
  teacherInfo: {
    employeeId: String,
    subjects: [String],
    qualification: String,
    experience: Number, // in years
    joiningDate: Date
  },
  
  // Parent specific fields
  parentInfo: {
    occupation: String,
    // Students will be linked separately in Student model
  },
  
  // Admin specific fields
  adminInfo: {
    employeeId: String,
    department: String
  },
  
  // Super admin flag (for users in super admin tenant)
  isSuperAdmin: {
    type: Boolean,
    default: false
  },
  
  // Security
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  
  lastLogin: Date,
  
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  
  emailVerificationToken: String,
  emailVerificationExpire: Date
  
}, {
  timestamps: true
});

// Create compound index for unique email per tenant
userSchema.index({ tenant: 1, email: 1 }, { unique: true });
userSchema.index({ tenant: 1, role: 1 });
userSchema.index({ tenant: 1, isActive: 1 });

// Encrypt password before saving
userSchema.pre('save', async function(next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) {
    return next();
  }
  
  // Generate salt and hash password
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});
userSchema.methods.updateFCMToken = async function(token, platform = 'android') {
  // Remove existing token for this platform
  this.fcmTokens = this.fcmTokens.filter(t => t.platform !== platform);
  
  // Add new token
  this.fcmTokens.push({
    token,
    platform,
    lastUpdated: new Date()
  });
  
  // Keep only last 5 tokens to avoid accumulation
  if (this.fcmTokens.length > 5) {
    this.fcmTokens = this.fcmTokens.slice(-5);
  }
  
  await this.save();
};

// Method to remove FCM token
userSchema.methods.removeFCMToken = async function(token) {
  this.fcmTokens = this.fcmTokens.filter(t => t.token !== token);
  await this.save();
};

// Instance method to check password
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Instance method to generate JWT token
userSchema.methods.getSignedJwtToken = function() {
  return jwt.sign(
    { 
      id: this._id,
      tenant: this.tenant,
      role: this.role
    }, 
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRE
    }
  );
};

// Instance method to get full name
userSchema.methods.getFullName = function() {
  return `${this.firstName} ${this.lastName}`;
};

// Hide sensitive data
userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.resetPasswordToken;
  delete obj.resetPasswordExpire;
  delete obj.emailVerificationToken;
  delete obj.emailVerificationExpire;
  return obj;
};

// Static method to find users by tenant and role
userSchema.statics.findByTenantAndRole = function(tenantId, role) {
  return this.find({ 
    tenant: tenantId, 
    role: role,
    isActive: true 
  });
};

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  if (this.lastName) {
    return `${this.firstName} ${this.lastName}`;
  }
  return this.firstName;
});

module.exports = mongoose.model('User', userSchema);