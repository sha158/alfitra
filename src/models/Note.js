// src/models/Note.js
const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
  tenant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true
  },
  
  title: {
    type: String,
    required: [true, 'Note title is required'],
    trim: true
  },
  
  description: {
    type: String,
    required: [true, 'Note description is required']
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
  
  type: {
    type: String,
    enum: ['lecture', 'study_material', 'reference', 'worksheet', 'syllabus', 'other'],
    default: 'study_material'
  },
  
  files: [{
    fileName: String,
    fileUrl: String,
    fileSize: Number,
    fileType: String, // pdf, doc, ppt, etc.
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  content: String, // Rich text content if needed
  
  tags: [String],
  
  chapter: String,
  
  topic: String,
  
  isPublished: {
    type: Boolean,
    default: true
  },
  
  downloadCount: {
    type: Number,
    default: 0
  },
  
  viewCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes
noteSchema.index({ tenant: 1, class: 1, subject: 1 });
noteSchema.index({ tenant: 1, teacher: 1 });
noteSchema.index({ tenant: 1, tags: 1 });
noteSchema.index({ tenant: 1, isPublished: 1 });

// Method to increment view count
noteSchema.methods.incrementViewCount = async function() {
  this.viewCount += 1;
  await this.save();
};

// Method to increment download count
noteSchema.methods.incrementDownloadCount = async function() {
  this.downloadCount += 1;
  await this.save();
};

module.exports = mongoose.model('Note', noteSchema);