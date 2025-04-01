import expressAsyncHandler from 'express-async-handler';
import DispensingLog from '../models/dispenserLogModel.js';
import PatientMedication from '../models/patientModel.js';
import Alert from '../models/alertModel.js';

// @desc    Get recent activity for a patient
// @route   GET /api/activity/:patientId
// @access  Private/Patient
const getRecentActivity = expressAsyncHandler(async (req, res) => {
  const patientId = req.params.patientId;
  const limit = parseInt(req.query.limit) || 10;
  
  // Get dispensing logs (taken medications)
  const takenLogs = await DispensingLog.find({
    patient: patientId,
    status: { $in: ['taken', 'dispensed'] }
  })
    .sort({ takenTime: -1 })
    .limit(limit)
    .populate('medication', 'name');
  
  // Get refill logs
  const refillLogs = await PatientMedication.find({
    patient: patientId,
    'refillHistory.date': { $exists: true }
  })
    .sort({ 'refillHistory.date': -1 })
    .limit(limit)
    .populate('medication', 'name');
  
  // Get missed dose alerts
  const missedDoseAlerts = await Alert.find({
    patient: patientId,
    alertType: 'missed_dose'
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('medication', 'name');
  
  // Combine and sort activities
  const activities = [
    ...takenLogs.map(log => ({
      type: 'taken',
      medication: log.medication,
      time: log.takenTime,
      scheduleTime: log.scheduledTime,
      id: log._id
    })),
    ...refillLogs.flatMap(med => 
      med.refillHistory.map(refill => ({
        type: 'refill',
        medication: med.medication,
        time: refill.date,
        quantity: refill.quantity,
        id: `${med._id}-${refill.date}`
      }))
    ),
    ...missedDoseAlerts.map(alert => ({
      type: 'missed',
      medication: alert.medication,
      time: alert.createdAt,
      message: alert.message,
      id: alert._id
    }))
  ];
  
  // Sort by time, most recent first
  activities.sort((a, b) => new Date(b.time) - new Date(a.time));
  
  // Limit to requested number
  const limitedActivities = activities.slice(0, limit);
  
  res.json(limitedActivities);
});

// @desc    Log medication taken
// @route   POST /api/activity/taken
// @access  Private/Patient
const logMedicationTaken = expressAsyncHandler(async (req, res) => {
  const {
    patient,
    medication,
    scheduleId,
    scheduledTime,
    takenTime = new Date()
  } = req.body;
  
  // Validate required fields
  if (!patient || !medication) {
    res.status(400);
    throw new Error('Patient and medication are required');
  }
  
  // Create dispensing log
  const dispensingLog = await DispensingLog.create({
    patient,
    medication,
    scheduledTime: scheduledTime || takenTime,
    takenTime,
    status: 'taken',
    schedule: scheduleId
  });
  
  if (dispensingLog) {
    // Update inventory
    const patientMed = await PatientMedication.findOne({
      patient,
      medication
    });
    
    if (patientMed) {
      // Default to 1 if not specified
      const quantityTaken = req.body.quantity || 1;
      
      patientMed.inventory.currentQuantity = Math.max(
        0, 
        patientMed.inventory.currentQuantity - quantityTaken
      );
      
      await patientMed.save();
    }
    
    res.status(201).json(dispensingLog);
  } else {
    res.status(400);
    throw new Error('Invalid log data');
  }
});

// @desc    Log medication refill
// @route   POST /api/activity/refill
// @access  Private/Patient
const logMedicationRefill = expressAsyncHandler(async (req, res) => {
  const {
    patient,
    medication,
    quantity,
    source,
    notes
  } = req.body;
  
  // Validate required fields
  if (!patient || !medication || !quantity) {
    res.status(400);
    throw new Error('Patient, medication and quantity are required');
  }
  
  // Find or create patient medication
  let patientMed = await PatientMedication.findOne({
    patient,
    medication
  });
  
  if (!patientMed) {
    // Create new patient medication
    patientMed = await PatientMedication.create({
      patient,
      medication,
      inventory: {
        currentQuantity: 0,
        alertThreshold: 7 // Default 7-day supply warning
      },
      refillHistory: []
    });
  }
  
  // Add to refill history
  patientMed.refillHistory.push({
    date: new Date(),
    quantity,
    source: source || 'manual',
    notes
  });
  
  // Update current quantity
  patientMed.inventory.currentQuantity += parseInt(quantity);
  
  await patientMed.save();
  
  res.status(201).json({
    success: true,
    data: patientMed
  });
});

export {
  getRecentActivity,
  logMedicationTaken,
  logMedicationRefill
};