// src/models/Tenant.js
const mongoose = require('mongoose');

const tenantSchema = new mongoose.Schema({
  // School/Institution name
  name: {
    type: String,
    required: [true, 'Tenant name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  
  // Unique identifier for the tenant (used in URLs, etc.)
  code: {
    type: String,
    required: [true, 'Tenant code is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^[a-z0-9-]+$/, 'Code can only contain lowercase letters, numbers, and hyphens']
  },
  
  // Contact information
  email: {
    type: String,
    required: [true, 'Email is required'],
    lowercase: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
  },
  
  phone: {
    type: String,
    required: [true, 'Phone number is required']
  },
  
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: {
      type: String,
      default: 'India'
    }
  },
  
  // Subscription/Plan information
  subscription: {
    plan: {
      type: String,
      enum: ['basic', 'standard', 'premium'],
      default: 'basic'
    },
    startDate: {
      type: Date,
      default: Date.now
    },
    endDate: Date,
    isActive: {
      type: Boolean,
      default: true
    },
    maxStudents: {
      type: Number,
      default: 100
    },
    maxTeachers: {
      type: Number,
      default: 10
    }
  },
  
  // Branding
  logo: {
    type: String, // URL to logo
    default: null
  },
  
  // Settings
  settings: {
    academicYearStart: {
      type: Number,
      default: 4 // April
    },
    academicYearEnd: {
      type: Number,
      default: 3 // March
    },
    workingDays: {
      type: [String],
      default: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    },
    timeZone: {
      type: String,
      default: 'Asia/Kolkata'
    },
    currency: {
      type: String,
      default: 'INR'
    }
  },
  
  // Super admin flag
  isSuperAdmin: {
    type: Boolean,
    default: false
  },
  
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true // Adds createdAt and updatedAt automatically
});

// Indexes for better query performance
tenantSchema.index({ code: 1 });
tenantSchema.index({ isActive: 1 });

// Instance methods
tenantSchema.methods.canAddMoreStudents = async function(count = 1) {
  const Student = mongoose.model('Student');
  const currentCount = await Student.countDocuments({ 
    tenant: this._id, 
    isActive: true 
  });
  return (currentCount + count) <= this.subscription.maxStudents;
};

tenantSchema.methods.canAddMoreTeachers = async function(count = 1) {
  const User = mongoose.model('User');
  const currentCount = await User.countDocuments({ 
    tenant: this._id, 
    role: 'teacher',
    isActive: true 
  });
  return (currentCount + count) <= this.subscription.maxTeachers;
};

// Static methods
tenantSchema.statics.findByCode = function(code) {
  return this.findOne({ code: code.toLowerCase(), isActive: true, isDeleted: false });
};

// Don't return sensitive information
tenantSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.isDeleted;
  return obj;
};

module.exports = mongoose.model('Tenant', tenantSchema);