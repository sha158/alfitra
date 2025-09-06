// src/models/Fee.js
const mongoose = require('mongoose');
const { FEE_STATUS } = require('../config/constants');

// Fee Structure Schema - defines fee types and amounts
const feeStructureSchema = new mongoose.Schema({
  tenant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true
  },
  
  name: {
    type: String,
    required: [true, 'Fee name is required'],
    trim: true
  },
  
  category: {
    type: mongoose.Schema.Types.ObjectId,  // Changed to ObjectId
    ref: 'FeeCategory'
  },
  
  classes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class'
  }],
  
  amount: {
    type: Number,
    required: [true, 'Fee amount is required'],
    min: 0
  },
  
  frequency: {
    type: mongoose.Schema.Types.ObjectId,  // Changed to ObjectId
    ref: 'FeeFrequency'
  },
  
  academicYear: {
    type: String,
    required: true
  },
  
  dueDate: {
    type: Number, // Day of month (1-31) for recurring fees
    default: 10
  },
  
  description: String,
  
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});


feeStructureSchema.virtual('categoryInfo', {
  ref: 'FeeCategory',
  localField: 'category',
  foreignField: 'code',
  justOne: true,
  match: function() {
    return { tenant: this.tenant };
  }
});

// Virtual populate for frequency  
feeStructureSchema.virtual('frequencyInfo', {
  ref: 'FeeFrequency',
  localField: 'frequency',
  foreignField: 'code',
  justOne: true,
  match: function() {
    return { tenant: this.tenant };
  }
});

// Ensure virtual fields are included in JSON output
feeStructureSchema.set('toJSON', { virtuals: true });
feeStructureSchema.set('toObject', { virtuals: true });

// Fee Assignment Schema - assigns fees to students (simplified without installments)
const feeAssignmentSchema = new mongoose.Schema({
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
  
  feeStructure: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FeeStructure',
    required: true
  },
  
  academicYear: {
    type: String,
    required: true
  },
  
  totalAmount: {
    type: Number,
    required: true
  },
  
  discount: {
    amount: {
      type: Number,
      default: 0
    },
    reason: String
  },
  
  finalAmount: {
    type: Number,
    required: true
  },
  
  dueDate: {
    type: Date,
    required: true
  },
  
  status: {
    type: String,
    enum: Object.values(FEE_STATUS),
    default: FEE_STATUS.PENDING
  },
  
  paidAmount: {
    type: Number,
    default: 0
  },
  
  paidDate: Date,
  
  paymentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FeePayment'
  },
  
  // Cancellation fields
  cancelledAt: Date,
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  cancellationReason: String
}, {
  timestamps: true
});

// Fee Payment Schema - records actual payments
const feePaymentSchema = new mongoose.Schema({
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
  
  feeAssignment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FeeAssignment',
    required: true
  },
  
  amount: {
    type: Number,
    required: true
  },
  
  paymentDate: {
    type: Date,
    default: Date.now
  },
  
  paymentMethod: {
    type: String,
    required: true,
    enum: ['cash', 'cheque', 'online', 'bank_transfer', 'card']
  },
  
  transactionId: String,
  
  receiptNumber: {
    type: String,
    unique: true
  },
  
  collectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  remarks: String,
  
  status: {
    type: String,
    enum: ['completed', 'pending', 'failed', 'refunded'],
    default: 'completed'
  }
}, {
  timestamps: true
});

// Indexes
feeStructureSchema.index({ tenant: 1, name: 1, academicYear: 1 });
feeAssignmentSchema.index({ tenant: 1, student: 1, academicYear: 1 });
feeAssignmentSchema.index({ tenant: 1, status: 1 });
feePaymentSchema.index({ tenant: 1, student: 1 });
feePaymentSchema.index({ tenant: 1, receiptNumber: 1 }, { unique: true });

// Pre-save hooks
feeAssignmentSchema.pre('save', function(next) {
  // Calculate final amount after discount
  if (this.isNew) {
    this.finalAmount = this.totalAmount - (this.discount?.amount || 0);
  }
  
  // Update status based on payment
  if (this.paidAmount >= this.finalAmount) {
    this.status = FEE_STATUS.PAID;
  } else if (this.paidAmount > 0) {
    this.status = FEE_STATUS.PARTIALLY_PAID;
  } else if (this.dueDate < new Date()) {
    this.status = FEE_STATUS.OVERDUE;
  }
  
  next();
});

feePaymentSchema.pre('save', async function(next) {
  if (this.isNew && !this.receiptNumber) {
    const count = await this.constructor.countDocuments({ tenant: this.tenant });
    const year = new Date().getFullYear();
    this.receiptNumber = `RCP${year}${(count + 1).toString().padStart(6, '0')}`;
  }
  next();
});

// Instance methods
feeAssignmentSchema.methods.calculatePendingAmount = function() {
  const finalAmount = typeof this.finalAmount === 'number' ? this.finalAmount : 0;
  const paidAmount = typeof this.paidAmount === 'number' ? this.paidAmount : 0;
  return Math.max(finalAmount - paidAmount, 0);
};


feeAssignmentSchema.methods.updateStatus = function() {
  const today = new Date();
  const paid = typeof this.paidAmount === 'number' ? this.paidAmount : 0;
  
  if (paid >= this.finalAmount) {
    this.status = FEE_STATUS.PAID;
  } else if (paid > 0) {
    // If partially paid, check if overdue
    if (this.dueDate < today) {
      this.status = FEE_STATUS.OVERDUE;
    } else {
      this.status = FEE_STATUS.PARTIALLY_PAID;
    }
  } else {
    // If nothing paid
    if (this.dueDate < today) {
      this.status = FEE_STATUS.OVERDUE;
    } else {
      this.status = FEE_STATUS.PENDING;
    }
  }
};
// Create models
const FeeStructure = mongoose.model('FeeStructure', feeStructureSchema);
const FeeAssignment = mongoose.model('FeeAssignment', feeAssignmentSchema);
const FeePayment = mongoose.model('FeePayment', feePaymentSchema);

module.exports = {
  FeeStructure,
  FeeAssignment,
  FeePayment
};