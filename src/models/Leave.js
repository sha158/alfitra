// src/models/Leave.js
const mongoose = require('mongoose');
const { LEAVE_STATUS } = require('../config/constants');

const leaveSchema = new mongoose.Schema({
  tenant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true
  },
  
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  
  appliedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  fromDate: {
    type: Date,
    required: [true, 'From date is required']
  },
  
  toDate: {
    type: Date,
    required: [true, 'To date is required']
  },
  
  reason: {
    type: String,
    required: [true, 'Leave reason is required'],
    trim: true
  },
  
  type: {
    type: String,
    enum: ['sick', 'personal', 'emergency', 'other'],
    default: 'personal'
  },
  
  status: {
    type: String,
    enum: Object.values(LEAVE_STATUS),
    default: LEAVE_STATUS.PENDING
  },
  
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  approvalDate: Date,
  
  remarks: String,
  
  attachments: [{
    fileName: String,
    fileUrl: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Indexes
leaveSchema.index({ tenant: 1, student: 1, status: 1 });
leaveSchema.index({ tenant: 1, fromDate: 1, toDate: 1 });
leaveSchema.index({ tenant: 1, appliedBy: 1 });

// Virtual for number of days
leaveSchema.virtual('numberOfDays').get(function() {
  const oneDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.round(Math.abs((this.toDate - this.fromDate) / oneDay)) + 1;
  return diffDays;
});

// Pre-save validation
leaveSchema.pre('save', function(next) {
  if (this.toDate < this.fromDate) {
    next(new Error('End date must be after start date'));
  }
  next();
});

// Include virtuals in JSON
leaveSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Leave', leaveSchema);