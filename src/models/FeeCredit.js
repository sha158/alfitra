// src/models/FeeCredit.js
const mongoose = require('mongoose');

const feeCreditSchema = new mongoose.Schema({
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

  originalAssignment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FeeAssignment',
    required: true
  },

  creditAmount: {
    type: Number,
    required: true,
    min: 0
  },

  usedAmount: {
    type: Number,
    default: 0,
    min: 0
  },

  remainingAmount: {
    type: Number,
    required: true,
    min: 0
  },

  reason: {
    type: String,
    required: true,
    enum: [
      'class_change_overpayment',
      'fee_structure_change',
      'admin_adjustment',
      'refund_processing',
      'other'
    ]
  },

  reasonDetails: {
    type: String,
    trim: true
  },

  status: {
    type: String,
    enum: ['active', 'fully_used', 'expired', 'cancelled'],
    default: 'active'
  },

  expiryDate: {
    type: Date,
    default: function() {
      // Credits expire after 1 year by default
      const oneYear = new Date();
      oneYear.setFullYear(oneYear.getFullYear() + 1);
      return oneYear;
    }
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  appliedToAssignments: [{
    assignment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FeeAssignment'
    },
    amountApplied: {
      type: Number,
      required: true
    },
    appliedDate: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Indexes
feeCreditSchema.index({ tenant: 1, student: 1 });
feeCreditSchema.index({ tenant: 1, status: 1 });
feeCreditSchema.index({ tenant: 1, expiryDate: 1 });

// Pre-save hook to update status and remaining amount
feeCreditSchema.pre('save', function(next) {
  // Calculate remaining amount
  this.remainingAmount = this.creditAmount - this.usedAmount;

  // Update status based on remaining amount
  if (this.remainingAmount <= 0) {
    this.status = 'fully_used';
  } else if (this.expiryDate < new Date()) {
    this.status = 'expired';
  } else if (this.status === 'fully_used' && this.remainingAmount > 0) {
    this.status = 'active';
  }

  next();
});

// Instance methods
feeCreditSchema.methods.applyCredit = function(assignmentId, amount) {
  if (this.remainingAmount < amount) {
    throw new Error(`Insufficient credit balance. Available: ${this.remainingAmount}, Requested: ${amount}`);
  }

  if (this.status !== 'active') {
    throw new Error(`Credit is not active. Status: ${this.status}`);
  }

  // Add to applied assignments
  this.appliedToAssignments.push({
    assignment: assignmentId,
    amountApplied: amount,
    appliedDate: new Date()
  });

  // Update used amount
  this.usedAmount += amount;

  return this.save();
};

feeCreditSchema.methods.canApply = function(amount) {
  return this.status === 'active' &&
         this.remainingAmount >= amount &&
         this.expiryDate > new Date();
};

// Static methods
feeCreditSchema.statics.getAvailableCredits = function(tenantId, studentId) {
  return this.find({
    tenant: tenantId,
    student: studentId,
    status: 'active',
    remainingAmount: { $gt: 0 },
    expiryDate: { $gt: new Date() }
  }).sort({ createdAt: 1 }); // FIFO - use oldest credits first
};

feeCreditSchema.statics.getTotalAvailableCredit = async function(tenantId, studentId) {
  const credits = await this.getAvailableCredits(tenantId, studentId);
  return credits.reduce((total, credit) => total + credit.remainingAmount, 0);
};

module.exports = mongoose.model('FeeCredit', feeCreditSchema);