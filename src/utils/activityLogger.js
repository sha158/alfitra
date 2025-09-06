const Activity = require('../models/Activity');

const activityLogger = {
  // Log homework related activities
  logHomeworkCreated: async (teacher, homework) => {
    try {
      return await Activity.logActivity({
        tenant: teacher.tenant._id,
        teacher: teacher._id,
        type: 'homework_created',
        title: `New homework assigned: ${homework.title}`,
        description: `Assigned homework "${homework.title}" for subject ${homework.subject} to class ${homework.class.name}-${homework.class.section}. Due: ${new Date(homework.dueDate).toLocaleDateString()}`,
        class: homework.class._id,
        subject: homework.subject,
        metadata: {
          homeworkId: homework._id,
          dueDate: homework.dueDate,
          className: `${homework.class.name}-${homework.class.section}`
        }
      });
    } catch (error) {
      console.error('Error logging homework creation:', error);
    }
  },

  logHomeworkUpdated: async (teacher, homework) => {
    try {
      return await Activity.logActivity({
        tenant: teacher.tenant._id,
        teacher: teacher._id,
        type: 'homework_updated',
        title: `Homework updated: ${homework.title}`,
        description: `Updated homework "${homework.title}" for subject ${homework.subject}`,
        class: homework.class._id,
        subject: homework.subject,
        metadata: {
          homeworkId: homework._id,
          className: `${homework.class.name}-${homework.class.section}`
        }
      });
    } catch (error) {
      console.error('Error logging homework update:', error);
    }
  },

  logHomeworkDeleted: async (teacher, homework) => {
    try {
      return await Activity.logActivity({
        tenant: teacher.tenant._id,
        teacher: teacher._id,
        type: 'homework_deleted',
        title: `Homework deleted: ${homework.title}`,
        description: `Deleted homework "${homework.title}" for subject ${homework.subject}`,
        class: homework.class._id,
        subject: homework.subject,
        metadata: {
          homeworkId: homework._id,
          className: `${homework.class.name}-${homework.class.section}`
        }
      });
    } catch (error) {
      console.error('Error logging homework deletion:', error);
    }
  },

  // Log notes/study material activities
  logNotesUploaded: async (teacher, note) => {
    try {
      return await Activity.logActivity({
        tenant: teacher.tenant._id,
        teacher: teacher._id,
        type: 'notes_uploaded',
        title: `Study material uploaded: ${note.title}`,
        description: `Uploaded new study material "${note.title}" for subject ${note.subject} to class ${note.class.name}-${note.class.section}`,
        class: note.class._id,
        subject: note.subject,
        metadata: {
          noteId: note._id,
          noteType: note.type,
          className: `${note.class.name}-${note.class.section}`
        }
      });
    } catch (error) {
      console.error('Error logging notes upload:', error);
    }
  },

  logNotesUpdated: async (teacher, note) => {
    try {
      return await Activity.logActivity({
        tenant: teacher.tenant._id,
        teacher: teacher._id,
        type: 'notes_updated',
        title: `Study material updated: ${note.title}`,
        description: `Updated study material "${note.title}" for subject ${note.subject}`,
        class: note.class._id,
        subject: note.subject,
        metadata: {
          noteId: note._id,
          className: `${note.class.name}-${note.class.section}`
        }
      });
    } catch (error) {
      console.error('Error logging notes update:', error);
    }
  },

  logNotesDeleted: async (teacher, note) => {
    try {
      return await Activity.logActivity({
        tenant: teacher.tenant._id,
        teacher: teacher._id,
        type: 'notes_deleted',
        title: `Study material deleted: ${note.title}`,
        description: `Deleted study material "${note.title}" for subject ${note.subject}`,
        class: note.class._id,
        subject: note.subject,
        metadata: {
          noteId: note._id,
          className: `${note.class.name}-${note.class.section}`
        }
      });
    } catch (error) {
      console.error('Error logging notes deletion:', error);
    }
  },

  // Log attendance activities
  logAttendanceMarked: async (teacher, classObj, date, attendanceRecords, isUpdate = false) => {
    try {
      const totalStudents = attendanceRecords.length;
      const presentCount = attendanceRecords.filter(r => r.status === 'present').length;
      const absentCount = totalStudents - presentCount;
      const actionText = isUpdate ? 'updated' : 'marked';
      
      return await Activity.logActivity({
        tenant: teacher.tenant._id,
        teacher: teacher._id,
        type: isUpdate ? 'attendance_updated' : 'attendance_marked',
        title: `Attendance ${actionText} for ${classObj.name}-${classObj.section}`,
        description: `${actionText.charAt(0).toUpperCase() + actionText.slice(1)} attendance for ${new Date(date).toLocaleDateString()}. Present: ${presentCount}, Absent: ${absentCount}, Total: ${totalStudents}`,
        class: classObj._id,
        metadata: {
          date: date,
          totalStudents: totalStudents,
          presentCount: presentCount,
          absentCount: absentCount,
          className: `${classObj.name}-${classObj.section}`,
          isUpdate: isUpdate
        }
      });
    } catch (error) {
      console.error('Error logging attendance:', error);
    }
  },

  // Log leave management activities
  logLeaveStatusUpdate: async (teacher, leave, status, remarks) => {
    try {
      const statusText = status === 'approved' ? 'approved' : 'rejected';
      const fromDate = new Date(leave.fromDate).toLocaleDateString();
      const toDate = new Date(leave.toDate).toLocaleDateString();
      const dateRange = fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`;
      
      return await Activity.logActivity({
        tenant: teacher.tenant._id,
        teacher: teacher._id,
        type: status === 'approved' ? 'leave_approved' : 'leave_rejected',
        title: `Leave ${statusText}: ${leave.student.firstName} ${leave.student.lastName}`,
        description: `${statusText.charAt(0).toUpperCase() + statusText.slice(1)} leave application for ${leave.student.firstName} ${leave.student.lastName} (${dateRange})${remarks ? `. Remarks: ${remarks}` : ''}`,
        class: leave.student.class._id,
        student: leave.student._id,
        metadata: {
          leaveId: leave._id,
          status: status,
          fromDate: leave.fromDate,
          toDate: leave.toDate,
          dateRange: dateRange,
          leaveType: leave.type,
          remarks: remarks || '',
          studentName: `${leave.student.firstName} ${leave.student.lastName}`
        }
      });
    } catch (error) {
      console.error('Error logging leave status update:', error);
    }
  },

  // Log payment activities (for when payment is received)
  logPaymentReceived: async (admin, student, feeStructure, amount, paymentMethod) => {
    try {
      return await Activity.logActivity({
        tenant: admin.tenant._id,
        teacher: admin._id,
        type: 'payment_received',
        title: `Payment received: ${student.firstName} ${student.lastName}`,
        description: `Received payment of ₹${amount} from ${student.firstName} ${student.lastName} for ${feeStructure.name} via ${paymentMethod}`,
        class: student.class,
        student: student._id,
        metadata: {
          amount: amount,
          paymentMethod: paymentMethod,
          feeStructureName: feeStructure.name,
          studentName: `${student.firstName} ${student.lastName}`,
          feeStructureId: feeStructure._id
        }
      });
    } catch (error) {
      console.error('Error logging payment:', error);
    }
  },

  // Generic log method for custom activities
  logCustomActivity: async (teacher, type, title, description, options = {}) => {
    try {
      return await Activity.logActivity({
        tenant: teacher.tenant._id,
        teacher: teacher._id,
        type: type,
        title: title,
        description: description,
        class: options.classId || null,
        student: options.studentId || null,
        subject: options.subject || null,
        metadata: options.metadata || {}
      });
    } catch (error) {
      console.error('Error logging custom activity:', error);
    }
  }
};

module.exports = activityLogger;