// src/controllers/notificationController.js
const { Notification, Announcement } = require('../models/Notification');
const User = require('../models/User');
const Student = require('../models/Student');
const { NOTIFICATION_TARGET, USER_ROLES } = require('../config/constants');
const { admin } = require('../config/firebaseAdmin'); // Import from your firebaseAdmin config

// Helper function to send FCM notifications
const sendFCMNotification = async (targetUserIds, notification) => {
  try {
    // Get FCM tokens for target users
    const users = await User.find({
      _id: { $in: targetUserIds },
      'fcmTokens.0': { $exists: true }
    }).select('fcmTokens');

    // Extract all tokens
    const tokens = users.flatMap(user => 
      user.fcmTokens
        .filter(t => t.token && t.token.length > 0) // Filter out empty tokens
        .map(t => t.token)
    );

    if (tokens.length === 0) {
      console.log('No FCM tokens found for target users');
      return;
    }

    // Remove duplicate tokens
    const uniqueTokens = [...new Set(tokens)];

    console.log(`Sending FCM notification to ${uniqueTokens.length} devices`);

    // Prepare the message
    const message = {
      notification: {
        title: notification.title,
        body: notification.message
      },
      data: {
        type: notification.type || 'general',
        priority: notification.priority || 'medium',
        notificationId: notification._id.toString(),
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        // Include metadata for frontend navigation
        ...(notification.metadata && {
          attendanceType: notification.metadata.attendanceType || '',
          studentId: notification.metadata.studentId?.toString() || '',
          classId: notification.metadata.classId?.toString() || '',
          date: notification.metadata.date || '',
          navigateTo: notification.metadata.navigateTo || '',
          presentCount: notification.metadata.presentCount?.toString() || '',
          absentCount: notification.metadata.absentCount?.toString() || '',
          totalStudents: notification.metadata.totalStudents?.toString() || ''
        })
      },
      android: {
        priority: notification.priority === 'urgent' || notification.priority === 'high' ? 'high' : 'normal',
        notification: {
          channelId: 'high_importance_channel',
          priority: notification.priority === 'urgent' || notification.priority === 'high' ? 'high' : 'default',
          sound: 'default'
        }
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1
          }
        }
      }
    };

    // Send notifications in batches of 500 (FCM limit)
    const batchSize = 500;
    let totalSuccess = 0;
    let totalFailure = 0;

    for (let i = 0; i < uniqueTokens.length; i += batchSize) {
      const batchTokens = uniqueTokens.slice(i, i + batchSize);
      
      try {
        const response = await admin.messaging().sendEachForMulticast({
          tokens: batchTokens,
          ...message
        });
        
        totalSuccess += response.successCount;
        totalFailure += response.failureCount;
        
        // Log failed tokens for debugging
        if (response.failureCount > 0) {
          response.responses.forEach((resp, idx) => {
            if (!resp.success) {
              console.error(`Failed to send to token ${batchTokens[idx]}: ${resp.error?.message}`);
              // TODO: You might want to remove invalid tokens from database here
              if (resp.error?.code === 'messaging/invalid-registration-token' ||
                  resp.error?.code === 'messaging/registration-token-not-registered') {
                // Mark token for removal
                console.log(`Token should be removed: ${batchTokens[idx]}`);
              }
            }
          });
        }
      } catch (error) {
        console.error('Error sending batch:', error);
        totalFailure += batchTokens.length;
      }
    }
    
    console.log(`FCM send complete: ${totalSuccess} successful, ${totalFailure} failed`);

    return {
      successCount: totalSuccess,
      failureCount: totalFailure
    };
  } catch (error) {
    console.error('Error sending FCM notification:', error);
    // Don't throw - FCM failure shouldn't stop the notification from being created
  }
};

// Helper function to send topic-based notifications
const sendFCMToTopic = async (topic, notification) => {
  try {
    console.log(`Sending FCM notification to topic: ${topic}`);
    
    const message = {
      topic: topic,
      notification: {
        title: notification.title,
        body: notification.message
      },
      data: {
        type: notification.type || 'general',
        priority: notification.priority || 'medium',
        notificationId: notification._id.toString(),
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        // Include metadata for frontend navigation
        ...(notification.metadata && {
          attendanceType: notification.metadata.attendanceType || '',
          studentId: notification.metadata.studentId?.toString() || '',
          classId: notification.metadata.classId?.toString() || '',
          date: notification.metadata.date || '',
          navigateTo: notification.metadata.navigateTo || '',
          presentCount: notification.metadata.presentCount?.toString() || '',
          absentCount: notification.metadata.absentCount?.toString() || '',
          totalStudents: notification.metadata.totalStudents?.toString() || ''
        })
      },
      android: {
        priority: notification.priority === 'urgent' || notification.priority === 'high' ? 'high' : 'normal',
        notification: {
          channelId: 'high_importance_channel',
          priority: notification.priority === 'urgent' || notification.priority === 'high' ? 'high' : 'default',
          sound: 'default'
        }
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1
          }
        }
      }
    };

    const response = await admin.messaging().send(message);
    console.log(`Successfully sent to topic ${topic}:`, response);
    
    return { success: true, messageId: response };
  } catch (error) {
    console.error(`Error sending to topic ${topic}:`, error);
    return { success: false, error: error.message };
  }
};

// @desc    Send notification
// @route   POST /api/admin/notifications
// @access  Private/Admin
const sendNotification = async (req, res) => {
  try {
    const {
      title,
      message,
      type,
      priority,
      targetType,
      targetClass,
      targetUsers,
      targetRole
    } = req.body;
    
    // Create notification
    const notification = await Notification.create({
      tenant: req.user.tenant._id,
      title,
      message,
      sender: req.user._id,
      type: type || 'general',
      priority: priority || 'medium',
      targetType,
      targetClass,
      targetUsers,
      targetRole
    });
    
    // Send FCM notifications based on targetType
    let fcmResult = { successCount: 0, failureCount: 0 };
    
    switch (targetType) {
      case NOTIFICATION_TARGET.ALL:
        // Send to topic
        await sendFCMToTopic('all_users', notification);
        fcmResult.successCount = 'Sent to all_users topic';
        break;
        
      case NOTIFICATION_TARGET.TEACHERS:
        // Send to teachers topic
        await sendFCMToTopic('teachers', notification);
        fcmResult.successCount = 'Sent to teachers topic';
        break;
        
      case NOTIFICATION_TARGET.PARENTS:
        // Send to parents topic
        await sendFCMToTopic('parents', notification);
        fcmResult.successCount = 'Sent to parents topic';
        break;
        
      case NOTIFICATION_TARGET.SPECIFIC_CLASS:
        if (targetClass) {
          // Send to class topic
          await sendFCMToTopic(`class_${targetClass}`, notification);
          fcmResult.successCount = `Sent to class_${targetClass} topic`;
        }
        break;
        
      case NOTIFICATION_TARGET.SPECIFIC_USER:
        if (targetUsers && targetUsers.length > 0) {
          // Send to specific users by tokens
          fcmResult = await sendFCMNotification(targetUsers, notification);
        }
        break;
    }
    
    // Get recipient count for response
    let recipientCount = 0;
    switch (targetType) {
      case NOTIFICATION_TARGET.ALL:
        const allUsers = await User.countDocuments({
          tenant: req.user.tenant._id,
          isActive: true
        });
        recipientCount = allUsers;
        break;
        
      case NOTIFICATION_TARGET.TEACHERS:
        const teachers = await User.countDocuments({
          tenant: req.user.tenant._id,
          role: USER_ROLES.TEACHER,
          isActive: true
        });
        recipientCount = teachers;
        break;
        
      case NOTIFICATION_TARGET.PARENTS:
        const parents = await User.countDocuments({
          tenant: req.user.tenant._id,
          role: USER_ROLES.PARENT,
          isActive: true
        });
        recipientCount = parents;
        break;
        
      case NOTIFICATION_TARGET.SPECIFIC_CLASS:
        if (targetClass) {
          const students = await Student.countDocuments({
            tenant: req.user.tenant._id,
            class: targetClass,
            isActive: true
          });
          recipientCount = students;
        }
        break;
        
      case NOTIFICATION_TARGET.SPECIFIC_USER:
        recipientCount = targetUsers ? targetUsers.length : 0;
        break;
    }
    
    res.status(201).json({
      success: true,
      data: notification,
      recipientCount,
      fcmResult
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error sending notification',
      error: error.message
    });
  }
};

// @desc    Get notifications for current user
// @route   GET /api/notifications/my
// @access  Private
const getMyNotifications = async (req, res) => {
  try {
    const { unreadOnly, type, limit = 20, skip = 0 } = req.query;
    
    // Build base query
    const query = {
      tenant: req.user.tenant._id,
      expiresAt: { $gt: new Date() },
      $or: [
        // Notifications for all users
        { targetType: NOTIFICATION_TARGET.ALL },
        
        // Notifications for specific role
        {
          targetType: {
            $in: [NOTIFICATION_TARGET.TEACHERS, NOTIFICATION_TARGET.PARENTS]
          },
          targetRole: req.user.role
        },
        
        // Notifications for specific users
        {
          targetType: NOTIFICATION_TARGET.SPECIFIC_USER,
          targetUsers: req.user._id
        }
      ]
    };
    
    // Add role-specific conditions
    if (req.user.role === USER_ROLES.TEACHER) {
      query.$or.push({ targetType: NOTIFICATION_TARGET.TEACHERS });
    } else if (req.user.role === USER_ROLES.PARENT) {
      // Get children's classes for class-specific notifications
      const children = await Student.find({
        tenant: req.user.tenant._id,
        parent: req.user._id,
        isActive: true
      }).select('class');
      
      const classIds = children.map(c => c.class);
      
      query.$or.push({
        targetType: NOTIFICATION_TARGET.SPECIFIC_CLASS,
        targetClass: { $in: classIds }
      });
      query.$or.push({ targetType: NOTIFICATION_TARGET.PARENTS });
    }
    
    if (type) query.type = type;
    
    if (unreadOnly === 'true') {
      query['readBy.user'] = { $ne: req.user._id };
    }
    
    const notifications = await Notification.find(query)
      .populate('sender', 'firstName lastName role')
      .sort('-createdAt')
      .limit(parseInt(limit))
      .skip(parseInt(skip));
    
    // Mark which notifications are read by current user
    const notificationsWithReadStatus = notifications.map(notif => {
      const notification = notif.toObject();
      notification.isRead = notif.readBy.some(item => 
        item.user.toString() === req.user._id.toString()
      );
      return notification;
    });
    
    // Get unread count
    const unreadCount = await Notification.countDocuments({
      ...query,
      'readBy.user': { $ne: req.user._id }
    });
    
    res.status(200).json({
      success: true,
      count: notifications.length,
      unreadCount,
      data: notificationsWithReadStatus
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error fetching notifications',
      error: error.message
    });
  }
};

// @desc    Mark notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
const markNotificationAsRead = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }
    
    await notification.markAsRead(req.user._id);
    
    res.status(200).json({
      success: true,
      message: 'Notification marked as read'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error marking notification as read',
      error: error.message
    });
  }
};

// @desc    Mark all notifications as read
// @route   PUT /api/notifications/read-all
// @access  Private
const markAllNotificationsAsRead = async (req, res) => {
  try {
    // Get all unread notifications for user
    const notifications = await Notification.find({
      tenant: req.user.tenant._id,
      'readBy.user': { $ne: req.user._id },
      expiresAt: { $gt: new Date() }
    });
    
    // Mark each as read
    const updatePromises = notifications.map(notif => 
      notif.markAsRead(req.user._id)
    );
    
    await Promise.all(updatePromises);
    
    res.status(200).json({
      success: true,
      message: `${notifications.length} notifications marked as read`
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error marking notifications as read',
      error: error.message
    });
  }
};

// ... rest of your controller methods (announcements, stats) remain the same ...

// @desc    Create announcement
// @route   POST /api/admin/announcements
// @access  Private/Admin
const createAnnouncement = async (req, res) => {
  try {
    const announcement = await Announcement.create({
      ...req.body,
      tenant: req.user.tenant._id,
      createdBy: req.user._id
    });
    
    await announcement.populate('createdBy', 'firstName lastName');
    
    res.status(201).json({
      success: true,
      data: announcement
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error creating announcement',
      error: error.message
    });
  }
};

// @desc    Get announcements
// @route   GET /api/announcements
// @access  Private
const getAnnouncements = async (req, res) => {
  try {
    const { type, limit = 10, skip = 0 } = req.query;
    
    // Build query based on user role
    const query = {
      tenant: req.user.tenant._id,
      isActive: true,
      validFrom: { $lte: new Date() },
      validUntil: { $gte: new Date() },
      $or: [
        { targetType: NOTIFICATION_TARGET.ALL },
        { 
          targetRole: { $in: [req.user.role, 'all'] }
        }
      ]
    };
    
    // Add role-specific conditions
    if (req.user.role === USER_ROLES.PARENT) {
      // Get children's classes
      const children = await Student.find({
        tenant: req.user.tenant._id,
        parent: req.user._id,
        isActive: true
      }).select('class');
      
      const classIds = children.map(c => c.class);
      
      query.$or.push({
        targetType: NOTIFICATION_TARGET.SPECIFIC_CLASS,
        targetClass: { $in: classIds }
      });
    }
    
    if (type) query.type = type;
    
    const announcements = await Announcement.find(query)
      .populate('createdBy', 'firstName lastName')
      .sort({ isPinned: -1, createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));
    
    res.status(200).json({
      success: true,
      count: announcements.length,
      data: announcements
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error fetching announcements',
      error: error.message
    });
  }
};

// @desc    Update announcement
// @route   PUT /api/admin/announcements/:id
// @access  Private/Admin
const updateAnnouncement = async (req, res) => {
  try {
    const announcement = await Announcement.findOneAndUpdate(
      {
        _id: req.params.id,
        tenant: req.user.tenant._id
      },
      req.body,
      {
        new: true,
        runValidators: true
      }
    ).populate('createdBy', 'firstName lastName');
    
    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: announcement
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error updating announcement',
      error: error.message
    });
  }
};

// @desc    Delete announcement
// @route   DELETE /api/admin/announcements/:id
// @access  Private/Admin
const deleteAnnouncement = async (req, res) => {
  try {
    const announcement = await Announcement.findOneAndUpdate(
      {
        _id: req.params.id,
        tenant: req.user.tenant._id
      },
      { isActive: false },
      { new: true }
    );
    
    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Announcement deleted successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error deleting announcement',
      error: error.message
    });
  }
};

// @desc    Get notification statistics (Admin)
// @route   GET /api/admin/notifications/stats
// @access  Private/Admin
const getNotificationStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const query = {
      tenant: req.user.tenant._id
    };
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    const stats = await Notification.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          totalReads: { $sum: { $size: '$readBy' } }
        }
      }
    ]);
    
    const totalNotifications = await Notification.countDocuments(query);
    
    res.status(200).json({
      success: true,
      data: {
        total: totalNotifications,
        byType: stats
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Error fetching notification stats',
      error: error.message
    });
  }
};

module.exports = {
  // Notifications
  sendNotification,
  getMyNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getNotificationStats,
  // Announcements
  createAnnouncement,
  getAnnouncements,
  updateAnnouncement,
  deleteAnnouncement,
  // FCM Helper functions (for internal use by other controllers)
  sendFCMNotification,
  sendFCMToTopic
};