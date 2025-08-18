// src/models/HifzTracker.js
const mongoose = require('mongoose');

const hifzTrackerSchema = new mongoose.Schema({
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
  
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true
  },
  
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  
  // Hifz specific fields
  newLesson: {
    surah: String,
    fromVerse: Number,
    toVerse: Number,
    completed: {
      type: Boolean,
      default: false
    }
  },
  
  recentRevision: {
    surah: String,
    fromVerse: Number,
    toVerse: Number,
    remarks: String,
    rating: {
      type: String,
      enum: ['Excellent', 'Good', 'Fair', 'Needs Improvement'],
      default: 'Good'
    }
  },
  
  oldRevision: {
    surah: String,
    fromVerse: Number,
    toVerse: Number,
    remarks: String,
    rating: {
      type: String,
      enum: ['Excellent', 'Good', 'Fair', 'Needs Improvement'],
      default: 'Good'
    }
  },
  
  tilawah: {
    surah: String,
    fromVerse: Number,
    toVerse: Number,
    fluency: {
      type: String,
      enum: ['Excellent', 'Good', 'Fair', 'Needs Improvement'],
      default: 'Good'
    }
  },
  
  homeAssignment: {
    description: String,
    surah: String,
    fromVerse: Number,
    toVerse: Number,
    dueDate: Date
  },
  
  tafseer: {
    topic: String,
    surah: String,
    verses: String,
    notes: String
  },
  
  // Teacher's overall remarks
  teacherRemarks: {
    type: String,
    maxlength: 500
  },
  
  // Parent's remarks/feedback
  parentRemarks: {
    type: String,
    maxlength: 500
  },
  
  // Teacher's signature (timestamp when teacher confirms)
  teacherSignature: {
    signed: {
      type: Boolean,
      default: false
    },
    signedAt: Date,
    signedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  
  // Parent acknowledgment
  parentAcknowledgment: {
    acknowledged: {
      type: Boolean,
      default: false
    },
    acknowledgedAt: Date,
    acknowledgedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  
  // Overall performance for the day
  overallPerformance: {
    type: String,
    enum: ['Excellent', 'Good', 'Satisfactory', 'Needs Improvement'],
    default: 'Good'
  },
  
  // Attendance for Hifz class
  attendance: {
    present: {
      type: Boolean,
      default: true
    },
    reason: String // If absent
  },
  
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for better query performance
hifzTrackerSchema.index({ tenant: 1, student: 1, date: -1 });
hifzTrackerSchema.index({ tenant: 1, teacher: 1, date: -1 });
hifzTrackerSchema.index({ tenant: 1, class: 1, date: -1 });
hifzTrackerSchema.index({ date: -1 });

// Virtual to check if parent has reviewed
hifzTrackerSchema.virtual('isReviewedByParent').get(function() {
  return this.parentAcknowledgment.acknowledged;
});

// Virtual to check if teacher has signed
hifzTrackerSchema.virtual('isSignedByTeacher').get(function() {
  return this.teacherSignature.signed;
});

// Include virtuals in JSON
hifzTrackerSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('HifzTracker', hifzTrackerSchema);