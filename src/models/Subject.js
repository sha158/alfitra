const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema({
  tenant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: [true, 'Tenant is required']
  },
  
  name: {
    type: String,
    required: [true, 'Subject name is required'],
    trim: true
  },
  
  code: {
    type: String,
    trim: true,
    uppercase: true
  },
  
  description: {
    type: String,
    trim: true
  },
  
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

subjectSchema.index({ tenant: 1, name: 1 }, { unique: true });
subjectSchema.index({ tenant: 1, isActive: 1 });

module.exports = mongoose.model('Subject', subjectSchema);