import expressAsyncHandler from 'express-async-handler';
import Alert from '../models/alertModel.js';
import User from '../models/userModel.js';
// import Medication from '../models/medicationModel.js';

// @desc    Create new alert
// @route   POST /api/alerts
// @access  System/Admin/Healthcare Provider
const createAlert = expressAsyncHandler(async (req, res) => {
  const { 
    alertType, 
    patient, 
    medication,
    message,
    severity
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
    medication,
    message,
    status: 'active'
  });

  if (alert) {
    // Notify patient (simplified notification)
    await notifyPatient(alert, patientExists);
    
    res.status(201).json(alert);
  } else {
    res.status(400);
    throw new Error('Invalid alert data');
  }
});

// @desc    Get alerts by patient
// @route   GET /api/alerts/patient/:patientId
// @access  Admin/Healthcare Provider/Patient
const getAlertsByPatient = expressAsyncHandler(async (req, res) => {
  const { status } = req.query;
  
  const filter = { 
    patient: req.params.patientId,
    ...(status && { status }) 
  };
  
  const alerts = await Alert.find(filter)
    .populate('medication', 'name dosage')
    .sort({ createdAt: -1 });
  
  res.json(alerts);
});

// @desc    Update alert status
// @route   PUT /api/alerts/:id
// @access  Admin/Healthcare Provider
const updateAlertStatus = expressAsyncHandler(async (req, res) => {
  const { status } = req.body;
  
  const alert = await Alert.findById(req.params.id);
  
  if (!alert) {
    res.status(404);
    throw new Error('Alert not found');
  }
  
  // Update status
  alert.status = status || alert.status;
  
  const updatedAlert = await alert.save();
  
  res.json(updatedAlert);
});

// Simplified notification helper
const notifyPatient = async (alert, patient) => {
  try {
    // In a real prototype, this would integrate with SMS, email, or push notification service
    console.log(`Notification sent to ${patient.firstName} ${patient.lastName}`);
    console.log(`Alert: ${alert.alertType} - ${alert.message}`);
  } catch (error) {
    console.error('Notification failed:', error);
  }
};

// @desc    Get missed dose alerts for patient
// @route   GET /api/alerts/misseddoses/:patientId
// @access  Admin/Healthcare Provider/Patient
const getMissedDoseAlerts = expressAsyncHandler(async (req, res) => {
  const filter = {
    patient: req.params.patientId,
    alertType: 'missed_dose'
  };
  
  const missedDoseAlerts = await Alert.find(filter)
    .populate('medication', 'name dosage')
    .sort({ createdAt: -1 });
  
  // Simple summary of missed doses
  const summary = missedDoseAlerts.reduce((acc, alert) => {
    const medId = alert.medication?._id.toString();
    if (medId) {
      if (!acc[medId]) {
        acc[medId] = {
          medication: alert.medication,
          missedCount: 0,
          dates: []
        };
      }
      acc[medId].missedCount++;
      acc[medId].dates.push(alert.createdAt);
    }
    return acc;
  }, {});
  
  res.json({
    alerts: missedDoseAlerts,
    summary: Object.values(summary)
  });
});

export {
  createAlert,
  getAlertsByPatient,
  updateAlertStatus,
  getMissedDoseAlerts
}