// src/models/FeeFrequency.js
const mongoose = require('mongoose');

const feeFrequencySchema = new mongoose.Schema({
  tenant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true
  },
  
  name: {
    type: String,
    required: [true, 'Frequency name is required'],
    trim: true
  },
  
  code: {
    type: String,
    trim: true,
    lowercase: true,
    match: [/^[a-z-]+$/, 'Code must contain only lowercase letters and hyphens']
  },
  
  description: {
    type: String,
    trim: true
  },
  
  monthsInterval: {
    type: Number,
    required: [true, 'Months interval is required'],
    min: [0, 'Months interval cannot be negative']
    // 0 for one-time, 1 for monthly, 3 for quarterly, etc.
  },
  
  isSystem: {
    type: Boolean,
    default: false
  },
  
  displayOrder: {
    type: Number,
    default: 999
  },
  
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes
feeFrequencySchema.index({ tenant: 1, code: 1 }, { unique: true });
feeFrequencySchema.index({ tenant: 1, name: 1 }, { unique: true });

// Pre-save hook to generate code from name
feeFrequencySchema.pre('save', async function(next) {
  if (!this.code && this.name) {
    // Generate code from name: "Bi-Monthly" -> "bi-monthly"
    this.code = this.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z-]/g, '');
  }
  
  if (!this.code) {
    return next(new Error('Code must be provided or generated from name'));
  }
  
  next();
});

// Static method to get default frequencies
feeFrequencySchema.statics.getDefaultFrequencies = function() {
  return [
    { name: 'One Time', code: 'one-time', monthsInterval: 0, isSystem: true, displayOrder: 1 },
    { name: 'Monthly', code: 'monthly', monthsInterval: 1, isSystem: true, displayOrder: 2 },
    { name: 'Quarterly', code: 'quarterly', monthsInterval: 3, isSystem: true, displayOrder: 3 },
    { name: 'Half Yearly', code: 'half-yearly', monthsInterval: 6, isSystem: true, displayOrder: 4 },
    { name: 'Yearly', code: 'yearly', monthsInterval: 12, isSystem: true, displayOrder: 5 }
  ];
};

// Instance method to check if frequency can be deleted
feeFrequencySchema.methods.canDelete = async function() {
  if (this.isSystem) {
    return { canDelete: false, reason: 'System frequencies cannot be deleted' };
  }
  
  // Check if any fee structures are using this frequency
  const FeeStructure = mongoose.model('FeeStructure');
  const count = await FeeStructure.countDocuments({ 
    tenant: this.tenant,
    frequency: this.code 
  });
  
  if (count > 0) {
    return { 
      canDelete: false, 
      reason: `This frequency is being used by ${count} fee structure(s)` 
    };
  }
  
  return { canDelete: true };
};

// Virtual to calculate number of payments per year
feeFrequencySchema.virtual('paymentsPerYear').get(function() {
  if (this.monthsInterval === 0) return 1; // One-time payment
  return Math.floor(12 / this.monthsInterval);
});

// Include virtuals in JSON
feeFrequencySchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('FeeFrequency', feeFrequencySchema);