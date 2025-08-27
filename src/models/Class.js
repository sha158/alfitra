// src/models/Class.js
const mongoose = require('mongoose');

const classSchema = new mongoose.Schema({
  // Multi-tenant reference
  tenant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: [true, 'Tenant is required']
  },
  
  // Class details
  name: {
    type: String,
    required: [true, 'Class name is required'],
    trim: true
  },
  
  section: {
    type: String,
    trim: true,
    uppercase: true
  },
  
  // Academic year
  academicYear: {
    type: String,
    required: [true, 'Academic year is required'],
    match: [/^\d{4}-\d{4}$/, 'Academic year must be in format YYYY-YYYY']
  },
  
  // Class teacher (primary teacher) - NOW REQUIRED
  classTeacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Class teacher is required']
  },
  
  // Subject teachers - NOW REQUIRED with at least one subject
  subjectTeachers: {
    type: [{
      teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Subject teacher is required']
      },
      subject: {
        type: String,
        required: [true, 'Subject name is required'],
        trim: true
      }
    }],
    validate: {
      validator: function(subjects) {
        return subjects && subjects.length > 0;
      },
      message: 'At least one subject with assigned teacher is required'
    }
  },
  
  // Core subjects for this class (list of all subjects taught)
  subjects: [{
    type: String,
    required: true,
    trim: true
  }],
  
  // Room/Location
  room: {
    type: String,
    default: null
  },
  
  // Capacity
  maxStudents: {
    type: Number,
    default: 40
  },
  
  // Schedule
  schedule: {
    startTime: {
      type: String, // "09:00"
      default: "09:00"
    },
    endTime: {
      type: String, // "15:00"
      default: "15:00"
    }
  },
  
  // Status
  isActive: {
    type: Boolean,
    default: true
  },

  // New fields based on user request
  description: {
    type: String,
    trim: true,
    default: null // Making it optional
  },
  startDate: {
    type: Date,
    default: null // Making it optional
  },
  endDate: {
    type: Date,
    default: null // Making it optional
  },
  feeStructure: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FeeStructure',
    required: [true, 'Fee structure ID is required']
  }],
}, {
  timestamps: true
});

// Indexes
classSchema.index({ tenant: 1, name: 1, section: 1, academicYear: 1 }, { unique: true });
classSchema.index({ tenant: 1, isActive: 1 });
classSchema.index({ classTeacher: 1 });

// Virtual for display name
classSchema.virtual('displayName').get(function() {
  return `${this.name} - ${this.section}`;
});

// Pre-save hook to ensure subjects array matches subjectTeachers
classSchema.pre('save', function(next) {
  if (this.subjectTeachers && this.subjectTeachers.length > 0) {
    // Extract unique subjects from subjectTeachers
    this.subjects = [...new Set(this.subjectTeachers.map(st => st.subject))];
  }
  next();
});

// Instance methods
classSchema.methods.getStudentCount = async function() {
  const Student = mongoose.model('Student');
  return await Student.countDocuments({ 
    class: this._id, 
    isActive: true 
  });
};

classSchema.methods.hasCapacity = async function() {
  const currentCount = await this.getStudentCount();
  return currentCount < this.maxStudents;
};

// Method to check if a teacher is assigned to this class
classSchema.methods.hasTeacher = function(teacherId) {
  // Check if class teacher
  if (this.classTeacher && this.classTeacher.toString() === teacherId.toString()) {
    return true;
  }
  
  // Check if subject teacher
  return this.subjectTeachers.some(st => 
    st.teacher && st.teacher.toString() === teacherId.toString()
  );
};

// Method to get all teachers (class teacher + subject teachers)
classSchema.methods.getAllTeachers = function() {
  const teachers = new Set();
  
  if (this.classTeacher) {
    teachers.add(this.classTeacher.toString());
  }
  
  this.subjectTeachers.forEach(st => {
    if (st.teacher) {
      teachers.add(st.teacher.toString());
    }
  });
  
  return Array.from(teachers);
};

// Include virtuals in JSON
classSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Class', classSchema);