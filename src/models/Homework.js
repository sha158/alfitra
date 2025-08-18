// src/models/Homework.js
const mongoose = require('mongoose');

const homeworkSchema = new mongoose.Schema({
  tenant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true
  },
  
  title: {
    type: String,
    required: [true, 'Homework title is required'],
    trim: true
  },
  
  description: {
    type: String,
    required: [true, 'Homework description is required']
  },
  
  subject: {
    type: String,
    required: [true, 'Subject is required']
  },
  
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: [true, 'Class is required']
  },
  
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  dueDate: {
    type: Date,
    required: [true, 'Due date is required']
  },
  
  attachments: [{
    fileName: String,
    fileUrl: String,
    fileSize: Number,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  instructions: String,
  
  totalMarks: {
    type: Number,
    default: null
  },
  
  type: {
    type: String,
    enum: ['assignment', 'project', 'worksheet', 'reading', 'practice'],
    default: 'assignment'
  },
  
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes
homeworkSchema.index({ tenant: 1, class: 1, dueDate: -1 });
homeworkSchema.index({ tenant: 1, teacher: 1 });
homeworkSchema.index({ tenant: 1, subject: 1 });

// Virtual to check if homework is overdue
homeworkSchema.virtual('isOverdue').get(function() {
  return new Date() > this.dueDate;
});

// Include virtuals in JSON
homeworkSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Homework', homeworkSchema);