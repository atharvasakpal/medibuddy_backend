import expressAsyncHandler from 'express-async-handler';
import Reminder from '../models/reminderModel.js';
import User from '../models/userModel.js';
import PatientMedication from '../models/patientModel.js';

// @desc    Get all important reminders for a patient
// @route   GET /api/reminders/:patientId
// @access  Private/Patient
const getImportantReminders = expressAsyncHandler(async (req, res) => {
  const patientId = req.params.patientId;
  
  // Get explicit reminders (appointments, etc.)
  const reminders = await Reminder.find({
    patient: patientId,
    isActive: true,
    date: { $gte: new Date() }
  }).sort({ date: 1 });
  
  // Get medication supply alerts
  const lowSupplyMedications = await PatientMedication.find({
    patient: patientId,
    'inventory.currentQuantity': { $lte: 'inventory.alertThreshold' }
  }).populate('medication', 'name strength strengthUnit');
  
  // Format response
  const formattedReminders = {
    appointments: reminders.filter(r => r.type === 'appointment').map(reminder => ({
      id: reminder._id,
      title: reminder.title,
      description: reminder.description,
      date: reminder.date,
      type: reminder.type,
      priority: reminder.priority
    })),
    lowSupply: lowSupplyMedications.map(med => ({
      id: med._id,
      medicationId: med.medication._id,
      name: med.medication.name,
      strength: med.medication.strength,
      strengthUnit: med.medication.strengthUnit,
      currentQuantity: med.inventory.currentQuantity,
      alertThreshold: med.inventory.alertThreshold,
      type: 'low_supply'
    })),
    other: reminders.filter(r => r.type !== 'appointment').map(reminder => ({
      id: reminder._id,
      title: reminder.title,
      description: reminder.description,
      date: reminder.date,
      type: reminder.type,
      priority: reminder.priority
    }))
  };
  
  res.json(formattedReminders);
});

// @desc    Create appointment reminder
// @route   POST /api/reminders/appointment
// @access  Private/Patient/Healthcare Provider
const createAppointmentReminder = expressAsyncHandler(async (req, res) => {
  const {
    patient,
    title,
    description,
    date,
    location,
    priority
  } = req.body;
  
  // Validate required fields
  if (!patient || !title || !date) {
    res.status(400);
    throw new Error('Patient, title and date are required');
  }
  
  // Create reminder
  const reminder = await Reminder.create({
    patient,
    title,
    description,
    date: new Date(date),
    type: 'appointment',
    location,
    priority: priority || 'medium',
    isActive: true
  });
  
  if (reminder) {
    res.status(201).json(reminder);
  } else {
    res.status(400);
    throw new Error('Invalid reminder data');
  }
});

// @desc    Update reminder status
// @route   PUT /api/reminders/:id
// @access  Private/Patient
const updateReminderStatus = expressAsyncHandler(async (req, res) => {
  const { isActive, isRead } = req.body;
  
  const reminder = await Reminder.findById(req.params.id);
  
  if (!reminder) {
    res.status(404);
    throw new Error('Reminder not found');
  }
  
  // Update fields
  if (isActive !== undefined) reminder.isActive = isActive;
  if (isRead !== undefined) reminder.isRead = isRead;
  
  const updatedReminder = await reminder.save();
  
  res.json(updatedReminder);
});

export {
  getImportantReminders,
  createAppointmentReminder,
  updateReminderStatus
};