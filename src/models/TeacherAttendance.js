const mongoose = require('mongoose');
const { ATTENDANCE_STATUS } = require('../config/constants');

const teacherAttendanceSchema = new mongoose.Schema({
  tenant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true
  },
  
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  date: {
    type: Date,
    required: true
  },
  
  status: {
    type: String,
    required: true,
    enum: Object.values(ATTENDANCE_STATUS)
  },
  
  markedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  remarks: String,
  
  checkInTime: {
    type: Date,
    default: null
  },
  
  checkOutTime: {
    type: Date,
    default: null
  },
  
  lateBy: {
    type: Number, // minutes late
    default: null
  },
  
  workingHours: {
    type: Number, // calculated working hours
    default: null
  }
}, {
  timestamps: true
});

// Indexes
teacherAttendanceSchema.index({ tenant: 1, teacher: 1, date: 1 }, { unique: true });
teacherAttendanceSchema.index({ tenant: 1, date: 1, status: 1 });
teacherAttendanceSchema.index({ tenant: 1, teacher: 1 });

// Pre-save middleware to calculate working hours if both check-in and check-out times are present
teacherAttendanceSchema.pre('save', function(next) {
  if (this.checkInTime && this.checkOutTime) {
    const diffMs = this.checkOutTime - this.checkInTime;
    this.workingHours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100; // hours rounded to 2 decimal places
  }
  next();
});

// Static method to get teacher attendance summary
teacherAttendanceSchema.statics.getAttendanceSummary = async function(teacherId, startDate, endDate) {
  const attendance = await this.find({
    teacher: teacherId,
    date: { $gte: startDate, $lte: endDate }
  });
  
  const summary = {
    totalDays: attendance.length,
    present: 0,
    absent: 0,
    late: 0,
    holiday: 0,
    totalWorkingHours: 0
  };
  
  attendance.forEach(record => {
    summary[record.status]++;
    if (record.workingHours) {
      summary.totalWorkingHours += record.workingHours;
    }
  });
  
  summary.attendancePercentage = summary.totalDays > 0 
    ? ((summary.present + summary.late) / summary.totalDays * 100).toFixed(2)
    : 0;
    
  summary.averageWorkingHours = summary.totalDays > 0 
    ? (summary.totalWorkingHours / summary.totalDays).toFixed(2)
    : 0;
  
  return summary;
};

// Static method to get monthly attendance report
teacherAttendanceSchema.statics.getMonthlyReport = async function(tenantId, year, month) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);
  
  return await this.aggregate([
    {
      $match: {
        tenant: new mongoose.Types.ObjectId(tenantId),
        date: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: 'teacher',
        foreignField: '_id',
        as: 'teacherInfo'
      }
    },
    {
      $unwind: '$teacherInfo'
    },
    {
      $group: {
        _id: '$teacher',
        teacherName: { $first: { $concat: ['$teacherInfo.firstName', ' ', '$teacherInfo.lastName'] } },
        teacherEmail: { $first: '$teacherInfo.email' },
        totalDays: { $sum: 1 },
        presentDays: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
        absentDays: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
        lateDays: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } },
        totalWorkingHours: { $sum: '$workingHours' }
      }
    },
    {
      $project: {
        _id: 1,
        teacherName: 1,
        teacherEmail: 1,
        totalDays: 1,
        presentDays: 1,
        absentDays: 1,
        lateDays: 1,
        totalWorkingHours: { $round: ['$totalWorkingHours', 2] },
        attendancePercentage: {
          $round: [
            { $multiply: [{ $divide: [{ $add: ['$presentDays', '$lateDays'] }, '$totalDays'] }, 100] },
            2
          ]
        }
      }
    },
    { $sort: { teacherName: 1 } }
  ]);
};

module.exports = mongoose.model('TeacherAttendance', teacherAttendanceSchema);