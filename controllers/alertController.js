import expressAsyncHandler from 'express-async-handler';
import Alert from '../models/alertModel.js';
import User from '../models/userModel.js';
import DispenserDevice from '../models/dispenserDeviceModel.js';
import DispensingLog from '../models/dispenserLogModel.js';
import Medication from '../models/medicationModel.js';
import { sendSMS, sendEmail, sendPushNotification } from '../services/notification/notificationService.js';

// @desc    Get all alerts
// @route   GET /api/alerts
// @access  Admin
const getAllAlerts = expressAsyncHandler(async (req, res) => {
  const { status, type, startDate, endDate } = req.query;
  
  // Build filter
  const filter = {};
  
  if (status) {
    filter.status = status;
  }
  
  if (type) {
    filter.alertType = type;
  }
  
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) {
      filter.createdAt.$gte = new Date(startDate);
    }
    if (endDate) {
      filter.createdAt.$lte = new Date(endDate);
    }
  }
  
  const alerts = await Alert.find(filter)
    .populate('patient', 'firstName lastName')
    .populate('dispenser', 'name deviceId')
    .populate('medication', 'name dosage')
    .sort({ createdAt: -1 });
  
  res.json(alerts);
});

// @desc    Get alerts by patient
// @route   GET /api/alerts/patient/:patientId
// @access  Admin/Healthcare Provider/Patient/Caregiver
const getAlertsByPatient = expressAsyncHandler(async (req, res) => {
  const { status, type, startDate, endDate } = req.query;
  
  // Build filter
  const filter = { patient: req.params.patientId };
  
  if (status) {
    filter.status = status;
  }
  
  if (type) {
    filter.alertType = type;
  }
  
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) {
      filter.createdAt.$gte = new Date(startDate);
    }
    if (endDate) {
      filter.createdAt.$lte = new Date(endDate);
    }
  }
  
  const alerts = await Alert.find(filter)
    .populate('dispenser', 'name deviceId')
    .populate('medication', 'name dosage')
    .sort({ createdAt: -1 });
  
  res.json(alerts);
});

// @desc    Get alert by ID
// @route   GET /api/alerts/:id
// @access  Admin/Healthcare Provider/Patient/Caregiver
const getAlertById = expressAsyncHandler(async (req, res) => {
  const alert = await Alert.findById(req.params.id)
    .populate('patient', 'firstName lastName email')
    .populate('dispenser', 'name deviceId location')
    .populate('medication', 'name dosage form instructions')
    .populate('relatedLog')
    .populate('acknowledgedBy', 'firstName lastName role');
  
  if (alert) {
    res.json(alert);
  } else {
    res.status(404);
    throw new Error('Alert not found');
  }
});

// @desc    Create new alert
// @route   POST /api/alerts
// @access  System/Admin/Healthcare Provider
const createAlert = expressAsyncHandler(async (req, res) => {
  const { 
    alertType, 
    severity, 
    patient, 
    dispenser, 
    medication, 
    message,
    relatedLog,
    notificationMethods,
    recipientGroups
  } = req.body;

  // Validate required fields
  if (!alertType || !patient) {
    res.status(400);
    throw new Error('Alert type and patient are required');
  }
  
  // Verify patient exists
  const patientExists = await User.findById(patient);
  if (!patientExists) {
    res.status(400);
    throw new Error('Patient not found');
  }
  
  // Create alert
  const alert = await Alert.create({
    alertType,
    severity: severity || 'medium',
    patient,
    dispenser,
    medication,
    message,
    relatedLog,
    status: 'active',
    notificationsSent: [],
    escalationLevel: 0
  });

  if (alert) {
    // Send initial notifications
    await sendAlertNotifications(
      alert, 
      notificationMethods || ['push', 'email'],
      recipientGroups || ['patient']
    );
    
    res.status(201).json(alert);
  } else {
    res.status(400);
    throw new Error('Invalid alert data');
  }
});

// @desc    Update alert status
// @route   PUT /api/alerts/:id
// @access  Admin/Healthcare Provider/Patient/Caregiver
const updateAlertStatus = expressAsyncHandler(async (req, res) => {
  const { status, notes } = req.body;
  
  const alert = await Alert.findById(req.params.id);
  
  if (!alert) {
    res.status(404);
    throw new Error('Alert not found');
  }
  
  // Update status
  alert.status = status || alert.status;
  
  // Add acknowledgment if resolving or acknowledging
  if ((status === 'acknowledged' || status === 'resolved') && 
      alert.status !== status) {
    alert.acknowledgedBy = req.user._id;
    alert.acknowledgedAt = new Date();
  }
  
  // Add notes if provided
  if (notes) {
    alert.notes = notes;
  }
  
  // Add status history
  alert.statusHistory.push({
    status: status || alert.status,
    timestamp: new Date(),
    updatedBy: req.user._id,
    notes: notes || ''
  });
  
  const updatedAlert = await alert.save();
  
  res.json(updatedAlert);
});

// @desc    Escalate alert
// @route   PUT /api/alerts/:id/escalate
// @access  System/Admin/Healthcare Provider
const escalateAlert = expressAsyncHandler(async (req, res) => {
  const { escalationLevel, notificationMethods, recipientGroups, notes } = req.body;
  
  const alert = await Alert.findById(req.params.id);
  
  if (!alert) {
    res.status(404);
    throw new Error('Alert not found');
  }
  
  // Only escalate active alerts
  if (alert.status !== 'active') {
    res.status(400);
    throw new Error('Cannot escalate non-active alert');
  }
  
  // Update escalation level
  alert.escalationLevel = escalationLevel || alert.escalationLevel + 1;
  
  // Add escalation history
  alert.escalationHistory.push({
    level: alert.escalationLevel,
    timestamp: new Date(),
    initiatedBy: req.user?._id || 'system',
    notes: notes || 'Automatic escalation'
  });
  
  const updatedAlert = await alert.save();
  
  // Send notifications for this escalation level
  await sendAlertNotifications(
    updatedAlert,
    notificationMethods || ['push', 'sms', 'email'],
    recipientGroups || getRecipientsForEscalationLevel(updatedAlert.escalationLevel)
  );
  
  res.json(updatedAlert);
});

// @desc    Send test alert
// @route   POST /api/alerts/test
// @access  Admin/Healthcare Provider
const sendTestAlert = expressAsyncHandler(async (req, res) => {
  const { 
    patient, 
    alertType,
    dispenser,
    message,
    notificationMethods,
    recipientGroups
  } = req.body;

  // Validate required fields
  if (!patient || !alertType) {
    res.status(400);
    throw new Error('Patient and alert type are required');
  }
  
  // Create test alert
  const alert = await Alert.create({
    alertType,
    severity: 'low',
    patient,
    dispenser,
    message: message || 'This is a test alert',
    status: 'test',
    notificationsSent: [],
    escalationLevel: 0
  });

  if (alert) {
    // Send test notifications
    await sendAlertNotifications(
      alert,
      notificationMethods || ['push'],
      recipientGroups || ['patient'],
      true // Mark as test
    );
    
    res.status(201).json(alert);
  } else {
    res.status(400);
    throw new Error('Failed to create test alert');
  }
});

// @desc    Get alert statistics
// @route   GET /api/alerts/stats
// @access  Admin/Healthcare Provider
const getAlertStatistics = expressAsyncHandler(async (req, res) => {
  const { patientId, startDate, endDate } = req.query;
  
  const filter = {};
  
  // Add patient filter if provided
  if (patientId) {
    filter.patient = patientId;
  }
  
  // Add date range filter if provided
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) {
      filter.createdAt.$gte = new Date(startDate);
    }
    if (endDate) {
      filter.createdAt.$lte = new Date(endDate);
    }
  }
  
  // Get count by type
  const alertsByType = await Alert.aggregate([
    { $match: filter },
    { $group: {
        _id: '$alertType',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } }
  ]);
  
  // Get count by severity
  const alertsBySeverity = await Alert.aggregate([
    { $match: filter },
    { $group: {
        _id: '$severity',
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);
  
  // Get count by status
  const alertsByStatus = await Alert.aggregate([
    { $match: filter },
    { $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);
  
  // Get response time stats (time to acknowledge)
  const responseTimeStats = await Alert.aggregate([
    { 
      $match: {
        ...filter,
        acknowledgedAt: { $exists: true },
        createdAt: { $exists: true }
      }
    },
    {
      $project: {
        responseTimeMinutes: {
          $divide: [
            { $subtract: ['$acknowledgedAt', '$createdAt'] },
            60000 // Convert ms to minutes
          ]
        },
        alertType: 1,
        severity: 1
      }
    },
    {
      $group: {
        _id: null,
        averageResponseTime: { $avg: '$responseTimeMinutes' },
        minResponseTime: { $min: '$responseTimeMinutes' },
        maxResponseTime: { $max: '$responseTimeMinutes' }
      }
    }
  ]);
  
  // Get alert trend (count by day)
  const alertTrend = await Alert.aggregate([
    { $match: filter },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
        },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);
  
  res.json({
    totalAlerts: await Alert.countDocuments(filter),
    activeAlerts: await Alert.countDocuments({ ...filter, status: 'active' }),
    alertsByType,
    alertsBySeverity,
    alertsByStatus,
    responseTimeStats: responseTimeStats[0] || {
      averageResponseTime: 0,
      minResponseTime: 0,
      maxResponseTime: 0
    },
    alertTrend
  });
});

// @desc    Get missed dose alerts
// @route   GET /api/alerts/misseddoses/:patientId
// @access  Admin/Healthcare Provider/Patient/Caregiver
const getMissedDoseAlerts = expressAsyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  
  const filter = {
    patient: req.params.patientId,
    alertType: 'missed_dose'
  };
  
  // Add date range filter if provided
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) {
      filter.createdAt.$gte = new Date(startDate);
    }
    if (endDate) {
      filter.createdAt.$lte = new Date(endDate);
    }
  }
  
  const missedDoseAlerts = await Alert.find(filter)
    .populate('medication', 'name dosage')
    .populate('relatedLog', 'scheduledTime')
    .sort({ createdAt: -1 });
  
  // Aggregate by medication
  const medicationMap = {};
  
  missedDoseAlerts.forEach(alert => {
    if (alert.medication) {
      const medId = alert.medication._id.toString();
      if (!medicationMap[medId]) {
        medicationMap[medId] = {
          medication: alert.medication,
          count: 0,
          dates: []
        };
      }
      
      medicationMap[medId].count += 1;
      
      if (alert.relatedLog && alert.relatedLog.scheduledTime) {
        medicationMap[medId].dates.push(alert.relatedLog.scheduledTime);
      } else {
        medicationMap[medId].dates.push(alert.createdAt);
      }
    }
  });
  
  const summary = Object.values(medicationMap).map(item => ({
    medication: item.medication,
    missedCount: item.count,
    dates: item.dates.sort((a, b) => new Date(a) - new Date(b))
  }));
  
  res.json({
    alerts: missedDoseAlerts,
    summary
  });
});

// Helper function to send alert notifications
const sendAlertNotifications = async (alert, methods = ['push', 'email'], recipients = ['patient'], isTest = false) => {
  try {
    // Get patient information
    const patient = await User.findById(alert.patient);
    if (!patient) {
      console.error(`Patient not found for alert: ${alert._id}`);
      return;
    }
    
    // Get dispenser information if available
    let dispenser = null;
    if (alert.dispenser) {
      dispenser = await DispenserDevice.findById(alert.dispenser);
    }
    
    // Get medication information if available
    let medication = null;
    if (alert.medication) {
      medication = await Medication.findById(alert.medication);
    }
    
    // Get related log if available
    let dispensingLog = null;
    if (alert.relatedLog) {
      dispensingLog = await DispensingLog.findById(alert.relatedLog);
    }
    
    // Format the alert message
    const formattedMessage = formatAlertMessage(alert, patient, dispenser, medication, dispensingLog);
    
    // Determine recipients for notifications
    const recipientUsers = await getRecipientUsers(recipients, patient);
    
    // Send notifications through each method
    const notificationResults = [];
    
    for (const method of methods) {
      for (const recipient of recipientUsers) {
        let result;
        
        // Skip if contact information not available for this method
        if (method === 'sms' && !recipient.phone) continue;
        if (method === 'email' && !recipient.email) continue;
        if (method === 'push' && !recipient.pushToken) continue;
        
        // Send notification based on method
        switch (method) {
          case 'sms':
            result = await sendSMS(
              recipient.phone,
              formattedMessage,
              isTest
            );
            break;
            
          case 'email':
            result = await sendEmail(
              recipient.email,
              `${isTest ? '[TEST] ' : ''}Alert: ${alert.alertType}`,
              formattedMessage,
              isTest
            );
            break;
            
          case 'push':
            result = await sendPushNotification(
              recipient.pushToken,
              `${isTest ? '[TEST] ' : ''}MedDispenser Alert`,
              formattedMessage,
              {
                alertId: alert._id.toString(),
                alertType: alert.alertType,
                severity: alert.severity
              },
              isTest
            );
            break;
        }
        
        // Record notification sent
        if (result && result.success) {
          notificationResults.push({
            method,
            recipient: recipient._id,
            timestamp: new Date(),
            status: 'sent',
            isTest
          });
        } else {
          notificationResults.push({
            method,
            recipient: recipient._id,
            timestamp: new Date(),
            status: 'failed',
            error: result?.error || 'Unknown error',
            isTest
          });
        }
      }
    }
    
    // Update alert with notification history
    alert.notificationsSent.push(...notificationResults);
    await alert.save();
    
    return notificationResults;
  } catch (error) {
    console.error('Error sending alert notifications:', error);
    return [];
  }
};

// Helper function to format alert message
const formatAlertMessage = (alert, patient, dispenser, medication, dispensingLog) => {
  let message = alert.message;
  
  if (!message) {
    // Create default message based on alert type
    switch (alert.alertType) {
      case 'missed_dose':
        message = `Missed medication dose${medication ? ': ' + medication.name : ''}`;
        if (dispensingLog) {
          message += ` scheduled for ${new Date(dispensingLog.scheduledTime).toLocaleTimeString()}`;
        }
        break;
        
      case 'low_medication':
        message = `Low medication supply${medication ? ' for ' + medication.name : ''}`;
        if (medication && medication.dosage) {
          message += ` (${medication.dosage})`;
        }
        break;
        
      case 'device_error':
        message = `Device error detected${dispenser ? ' on ' + dispenser.name : ''}`;
        break;
        
      case 'device_offline':
        message = `Device went offline${dispenser ? ': ' + dispenser.name : ''}`;
        if (dispenser && dispenser.location) {
          message += ` at ${dispenser.location}`;
        }
        break;
        
      case 'battery_low':
        message = `Battery level critical${dispenser ? ' on ' + dispenser.name : ''}`;
        break;
        
      case 'unauthorized_access':
        message = `Unauthorized access attempt detected${dispenser ? ' on ' + dispenser.name : ''}`;
        break;
        
      default:
        message = `Alert: ${alert.alertType} (${alert.severity} severity)`;
    }
  }
  
  // Add patient name for caregivers/providers
  const patientName = patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown patient';
  
  // Add severity indicator
  const severityIndicator = getSeverityIndicator(alert.severity);
  
  return `${severityIndicator} ${message} for ${patientName}`;
};

// Helper function to get severity indicator
const getSeverityIndicator = (severity) => {
  switch (severity) {
    case 'high':
      return '🔴 URGENT:';
    case 'medium':
      return '🟠 ALERT:';
    case 'low':
      return '🟡 NOTICE:';
    default:
      return 'ALERT:';
  }
};

// Helper function to get recipient users based on recipient groups
const getRecipientUsers = async (recipientGroups, patient) => {
  const recipientUsers = [];
  
  // Always include the patient if they're in the recipient groups
  if (recipientGroups.includes('patient')) {
    recipientUsers.push(patient);
  }
  
  // Add caregivers if requested
  if (recipientGroups.includes('caregivers') && patient.caregivers && patient.caregivers.length > 0) {
    const caregivers = await User.find({
      _id: { $in: patient.caregivers },
      active: true
    });
    
    recipientUsers.push(...caregivers);
  }
  
  // Add healthcare providers if requested
  if (recipientGroups.includes('providers') && patient.healthcareProviders && patient.healthcareProviders.length > 0) {
    const providers = await User.find({
      _id: { $in: patient.healthcareProviders },
      active: true
    });
    
    recipientUsers.push(...providers);
  }
  
  // Add emergency contacts if requested
  if (recipientGroups.includes('emergency') && patient.emergencyContacts && patient.emergencyContacts.length > 0) {
    // Map emergency contacts to users if they exist in the system
    const emergencyContactEmails = patient.emergencyContacts
      .filter(contact => contact.email)
      .map(contact => contact.email);
    
    if (emergencyContactEmails.length > 0) {
      const emergencyUsers = await User.find({
        email: { $in: emergencyContactEmails },
        active: true
      });
      
      recipientUsers.push(...emergencyUsers);
    }
  }
  
  // Add system admins for highest level of escalation
  if (recipientGroups.includes('admins')) {
    const admins = await User.find({
      role: 'admin',
      active: true
    });
    
    recipientUsers.push(...admins);
  }
  
  return [...new Set(recipientUsers)]; // Remove duplicates
};

// Helper function to determine recipients based on escalation level
const getRecipientsForEscalationLevel = (level) => {
  switch (level) {
    case 0:
      return ['patient'];
    case 1:
      return ['patient', 'caregivers'];
    case 2:
      return ['patient', 'caregivers', 'providers'];
    case 3:
      return ['patient', 'caregivers', 'providers', 'emergency'];
    case 4:
      return ['patient', 'caregivers', 'providers', 'emergency', 'admins'];
    default:
      return ['patient', 'caregivers'];
  }
};

// @desc    Delete alert (for testing purposes only)
// @route   DELETE /api/alerts/:id
// @access  Admin
const deleteAlert = expressAsyncHandler(async (req, res) => {
  const alert = await Alert.findById(req.params.id);
  
  if (!alert) {
    res.status(404);
    throw new Error('Alert not found');
  }
  
  await alert.remove();
  
  res.json({ message: 'Alert removed' });
});

export {
  getAllAlerts,
  getAlertsByPatient,
  getAlertById,
  createAlert,
  updateAlertStatus,
  escalateAlert,
  sendTestAlert,
  getAlertStatistics,
  getMissedDoseAlerts,
  deleteAlert
};