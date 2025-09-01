// src/config/constants.js

// User roles
const USER_ROLES = {
  ADMIN: 'admin',
  TEACHER: 'teacher',
  PARENT: 'parent'
};

// Fee status
const FEE_STATUS = {
  PAID: 'paid',
  PENDING: 'pending',
  PARTIALLY_PAID: 'partially_paid',
  OVERDUE: 'overdue',
  CANCELLED: 'cancelled'
};

// Leave status
const LEAVE_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected'
};

// Attendance status
const ATTENDANCE_STATUS = {
  PRESENT: 'present',
  ABSENT: 'absent',
  LATE: 'late',
  HOLIDAY: 'holiday'
};

// Notification target types
const NOTIFICATION_TARGET = {
  ALL: 'all',
  TEACHERS: 'teachers',
  PARENTS: 'parents',
  SPECIFIC_CLASS: 'specific_class',
  SPECIFIC_USER: 'specific_user'
};

// File upload limits
const FILE_UPLOAD = {
  MAX_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_TYPES: ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'xlsx', 'xls']
};

module.exports = {
  USER_ROLES,
  FEE_STATUS,
  LEAVE_STATUS,
  ATTENDANCE_STATUS,
  NOTIFICATION_TARGET,
  FILE_UPLOAD
};