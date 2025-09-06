const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  tenant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: [true, 'Tenant is required']
  },
  
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Teacher is required']
  },
  
  type: {
    type: String,
    required: [true, 'Activity type is required'],
    enum: [
      'homework_created',
      'homework_updated', 
      'homework_deleted',
      'notes_uploaded',
      'notes_updated',
      'notes_deleted',
      'attendance_marked',
      'attendance_updated',
      'leave_approved',
      'leave_rejected',
      'payment_received',
      'assignment_created',
      'assignment_updated'
    ]
  },
  
  title: {
    type: String,
    required: [true, 'Activity title is required'],
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  
  description: {
    type: String,
    required: [true, 'Activity description is required'],
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    default: null
  },
  
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    default: null
  },
  
  subject: {
    type: String,
    default: null
  },
  
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Create compound indexes for efficient queries
activitySchema.index({ tenant: 1, createdAt: -1 });
activitySchema.index({ tenant: 1, teacher: 1, createdAt: -1 });
activitySchema.index({ tenant: 1, type: 1, createdAt: -1 });
activitySchema.index({ tenant: 1, class: 1, createdAt: -1 });

// Static method to create activity log
activitySchema.statics.logActivity = async function(activityData) {
  try {
    return await this.create(activityData);
  } catch (error) {
    console.error('❌ Error logging activity:', error);
    // Don't throw error to avoid breaking the main operation
  }
};

// Static method to get recent activities for admin
activitySchema.statics.getRecentActivities = async function(tenantId, options = {}) {
  const {
    limit = 50,
    skip = 0,
    type = null,
    teacherId = null,
    classId = null,
    startDate = null,
    endDate = null
  } = options;
  
  const query = { tenant: tenantId };
  
  if (type) query.type = type;
  if (teacherId) query.teacher = teacherId;
  if (classId) query.class = classId;
  
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }
  
  return await this.find(query)
    .populate('teacher', 'firstName lastName')
    .populate('class', 'name section')
    .populate('student', 'firstName lastName')
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip);
};

module.exports = mongoose.model('Activity', activitySchema);