// src/models/Notification.js
const mongoose = require('mongoose');
const { NOTIFICATION_TARGET } = require('../config/constants');

// Notification Schema - for instant notifications
const notificationSchema = new mongoose.Schema({
  tenant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true
  },
  
  title: {
    type: String,
    required: [true, 'Notification title is required'],
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  
  message: {
    type: String,
    required: [true, 'Notification message is required'],
    maxlength: [500, 'Message cannot exceed 500 characters']
  },
  
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  type: {
    type: String,
    enum: ['general', 'fee_reminder', 'homework', 'attendance', 'leave', 'event', 'emergency'],
    default: 'general'
  },
  
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent','normal'],
    default: 'medium'
  },
  
  targetType: {
    type: String,
    enum: Object.values(NOTIFICATION_TARGET),
    required: true
  },
  
  // Target specifics based on targetType
  targetClass: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class'
  },
  
  targetUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  targetRole: {
    type: String,
    enum: ['admin', 'teacher', 'parent']
  },
  
  // Tracking
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  expiresAt: {
    type: Date,
    default: () => new Date(+new Date() + 30*24*60*60*1000) // 30 days
  }
}, {
  timestamps: true
});

// Announcement Schema - for persistent announcements
const announcementSchema = new mongoose.Schema({
  tenant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true
  },
  
  title: {
    type: String,
    required: [true, 'Announcement title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  
  content: {
    type: String,
    required: [true, 'Announcement content is required']
  },
  
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  type: {
    type: String,
    enum: ['general', 'academic', 'event', 'holiday', 'urgent', 'policy'],
    default: 'general'
  },
  
  targetType: {
    type: String,
    enum: Object.values(NOTIFICATION_TARGET),
    required: true
  },
  
  targetClass: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class'
  },
  
  targetRole: {
    type: String,
    enum: ['admin', 'teacher', 'parent', 'all']
  },
  
  attachments: [{
    fileName: String,
    fileUrl: String,
    fileType: String,
    fileSize: Number
  }],
  
  isActive: {
    type: Boolean,
    default: true
  },
  
  isPinned: {
    type: Boolean,
    default: false
  },
  
  validFrom: {
    type: Date,
    default: Date.now
  },
  
  validUntil: {
    type: Date,
    default: () => new Date(+new Date() + 90*24*60*60*1000) // 90 days
  },
  
  viewCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes
notificationSchema.index({ tenant: 1, targetType: 1, createdAt: -1 });
notificationSchema.index({ tenant: 1, 'readBy.user': 1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

announcementSchema.index({ tenant: 1, targetType: 1, isActive: 1 });
announcementSchema.index({ tenant: 1, validFrom: 1, validUntil: 1 });
announcementSchema.index({ tenant: 1, isPinned: -1, createdAt: -1 });

// Methods
notificationSchema.methods.markAsRead = async function(userId) {
  const alreadyRead = this.readBy.some(item => 
    item.user.toString() === userId.toString()
  );
  
  if (!alreadyRead) {
    this.readBy.push({ user: userId });
    await this.save();
  }
};

notificationSchema.methods.getReadCount = function() {
  return this.readBy.length;
};

announcementSchema.methods.incrementViewCount = async function() {
  this.viewCount += 1;
  await this.save();
};

// Virtual to check if announcement is valid
announcementSchema.virtual('isValid').get(function() {
  const now = new Date();
  return this.isActive && 
         this.validFrom <= now && 
         this.validUntil >= now;
});

// Include virtuals in JSON
announcementSchema.set('toJSON', { virtuals: true });

const Notification = mongoose.model('Notification', notificationSchema);
const Announcement = mongoose.model('Announcement', announcementSchema);

module.exports = { Notification, Announcement };