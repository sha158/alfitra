// src/models/Attendance.js
const mongoose = require('mongoose');
const { ATTENDANCE_STATUS } = require('../config/constants');

const attendanceSchema = new mongoose.Schema({
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
  
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
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
  
  lateBy: {
    type: Number, // minutes late
    default: null
  }
}, {
  timestamps: true
});

// Indexes
attendanceSchema.index({ tenant: 1, student: 1, date: 1 }, { unique: true });
attendanceSchema.index({ tenant: 1, class: 1, date: 1 });
attendanceSchema.index({ tenant: 1, date: 1, status: 1 });

// Static method to get attendance summary
attendanceSchema.statics.getAttendanceSummary = async function(studentId, startDate, endDate) {
  const attendance = await this.find({
    student: studentId,
    date: { $gte: startDate, $lte: endDate }
  });
  
  const summary = {
    totalDays: attendance.length,
    present: 0,
    absent: 0,
    late: 0,
    holiday: 0
  };
  
  attendance.forEach(record => {
    summary[record.status]++;
  });
  
  summary.percentage = summary.totalDays > 0 
    ? ((summary.present + summary.late) / summary.totalDays * 100).toFixed(2)
    : 0;
  
  return summary;
};

module.exports = mongoose.model('Attendance', attendanceSchema);