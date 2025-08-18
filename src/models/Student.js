// src/models/Student.js
const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  // Multi-tenant reference
  tenant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: [true, 'Tenant is required']
  },
  
  // Student ID (Roll number)
  studentId: {
    type: String,
    required: false, // Will be auto-generated if not provided
    trim: true
  },
  
  // Personal Information
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true
  },
  
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true
  },
  
  dateOfBirth: {
    type: Date,
    required: [true, 'Date of birth is required']
  },
  
  gender: {
    type: String,
    required: [true, 'Gender is required'],
    enum: ['male', 'female', 'other']
  },
  
  bloodGroup: {
    type: String,
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', ''],
    default: ''
  },
  
  // Contact Information
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
  
  // Academic Information
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: [true, 'Class is required']
  },
  
  rollNumber: {
    type: Number,
    required: [true, 'Roll number is required']
  },
  
  admissionDate: {
    type: Date,
    default: Date.now
  },
  
  admissionNumber: {
    type: String,
    required: [true, 'Admission number is required']
  },
  
  // Parent Information
  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Parent is required']
  },
  
  // Emergency Contact
  emergencyContact: {
    name: String,
    relationship: String,
    phone: String
  },
  
  // Profile picture
  photo: {
    type: String,
    default: null
  },
  
  // Medical Information
  medicalInfo: {
    allergies: [String],
    medications: [String],
    conditions: [String],
    doctorName: String,
    doctorPhone: String
  },
  
  // Transportation
  transportation: {
    mode: {
      type: String,
      enum: ['school_bus', 'private', 'walk', 'other'],
      default: 'private'
    },
    busRoute: String,
    pickupPoint: String
  },
  
  // Status
  status: {
    type: String,
    enum: ['active', 'inactive', 'graduated', 'transferred'],
    default: 'active'
  },
  
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Previous school information
  previousSchool: {
    name: String,
    board: String,
    class: String,
    yearOfPassing: Number
  }
}, {
  timestamps: true
});

// Indexes
studentSchema.index({ tenant: 1, studentId: 1 }, { unique: true });
studentSchema.index({ tenant: 1, admissionNumber: 1 }, { unique: true });
studentSchema.index({ tenant: 1, class: 1, rollNumber: 1 }, { unique: true });
studentSchema.index({ tenant: 1, parent: 1 });
studentSchema.index({ tenant: 1, isActive: 1 });

// Virtual for full name
studentSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual for age
studentSchema.virtual('age').get(function() {
  const today = new Date();
  const birthDate = new Date(this.dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
});

// Instance methods
studentSchema.methods.promote = async function(newClassId) {
  this.class = newClassId;
  await this.save();
  return this;
};

studentSchema.methods.getAttendancePercentage = async function(startDate, endDate) {
  const Attendance = mongoose.model('Attendance');
  const query = {
    student: this._id,
    date: { $gte: startDate, $lte: endDate }
  };
  
  const totalDays = await Attendance.countDocuments(query);
  const presentDays = await Attendance.countDocuments({
    ...query,
    status: 'present'
  });
  
  return totalDays > 0 ? (presentDays / totalDays) * 100 : 0;
};

// Include virtuals in JSON
studentSchema.set('toJSON', { virtuals: true });

// Pre-save hook to generate student ID if not provided
studentSchema.pre('save', async function(next) {
  if (this.isNew && !this.studentId) {
    const count = await this.constructor.countDocuments({ tenant: this.tenant });
    const year = new Date().getFullYear();
    this.studentId = `STU${year}${(count + 1).toString().padStart(4, '0')}`;
  }
  next();
});

module.exports = mongoose.model('Student', studentSchema);