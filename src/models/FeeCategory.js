// src/models/FeeCategory.js
const mongoose = require('mongoose');

const feeCategorySchema = new mongoose.Schema({
  tenant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true
  },
  
  name: {
    type: String,
    required: [true, 'Category name is required'],
    trim: true
  },
  
  code: {
    type: String,
    trim: true,
    uppercase: true,
    match: [/^[A-Z_]+$/, 'Code must contain only uppercase letters and underscores']
  },
  
  description: {
    type: String,
    trim: true
  },
  
  isSystem: {
    type: Boolean,
    default: false // true for predefined categories, false for custom
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
feeCategorySchema.index({ tenant: 1, code: 1 }, { unique: true });
feeCategorySchema.index({ tenant: 1, name: 1 }, { unique: true });

// Pre-save hook to generate code from name and ensure uniqueness
feeCategorySchema.pre('save', async function(next) {
  if (!this.code && this.name) {
    // Generate code from name: "Bus Transport" -> "BUS_TRANSPORT"
    this.code = this.name.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z_]/g, '');
  }
  
  // Ensure code is always set (required for unique index)
  if (!this.code) {
    return next(new Error('Code must be provided or generated from name'));
  }
  
  next();
});

// Static method to get default categories
feeCategorySchema.statics.getDefaultCategories = function() {
  return [
    { name: 'Tuition Fee', code: 'TUITION', isSystem: true, displayOrder: 1 },
    { name: 'Transport Fee', code: 'TRANSPORT', isSystem: true, displayOrder: 2 },
    { name: 'Library Fee', code: 'LIBRARY', isSystem: true, displayOrder: 3 },
    { name: 'Laboratory Fee', code: 'LABORATORY', isSystem: true, displayOrder: 4 },
    { name: 'Sports Fee', code: 'SPORTS', isSystem: true, displayOrder: 5 },
    { name: 'Exam Fee', code: 'EXAM', isSystem: true, displayOrder: 6 },
    { name: 'Admission Fee', code: 'ADMISSION', isSystem: true, displayOrder: 7 },
    { name: 'Other', code: 'OTHER', isSystem: true, displayOrder: 999 }
  ];
};

// Instance method to check if category can be deleted
feeCategorySchema.methods.canDelete = async function() {
  if (this.isSystem) {
    return { canDelete: false, reason: 'System categories cannot be deleted' };
  }
  
  // Check if any fee structures are using this category
  const FeeStructure = mongoose.model('FeeStructure');
  const count = await FeeStructure.countDocuments({ 
    tenant: this.tenant,
    category: this.code 
  });
  
  if (count > 0) {
    return { 
      canDelete: false, 
      reason: `This category is being used by ${count} fee structure(s)` 
    };
  }
  
  return { canDelete: true };
};

module.exports = mongoose.model('FeeCategory', feeCategorySchema);