import expressAsyncHandler from 'express-async-handler';
import Medication from '../models/medicationModel.js';

// @desc    Get all medications
// @route   GET /api/medications
// @access  Admin/Healthcare Provider
const getMedications = expressAsyncHandler(async (req, res) => {
  const medications = await Medication.find({});
  res.json(medications);
});

// @desc    Get medications by user ID
// @route   GET /api/medications/user/:userId
// @access  Admin/Healthcare Provider/Owner
const getMedicationsByUser = expressAsyncHandler(async (req, res) => {
  const medications = await Medication.find({ user: req.params.userId });
  res.json(medications);
});

// @desc    Get medication by ID
// @route   GET /api/medications/:id
// @access  Admin/Healthcare Provider/Owner
const getMedicationById = expressAsyncHandler(async (req, res) => {
  const medication = await Medication.findById(req.params.id);
  
  if (medication) {
    res.json(medication);
  } else {
    res.status(404);
    throw new Error('Medication not found');
  }
});

// @desc    Create new medication
// @route   POST /api/medications
// @access  Admin/Healthcare Provider
const createMedication = expressAsyncHandler(async (req, res) => {
  const {
    name,
    strength,
    strengthUnit,
    shape,
    color
  } = req.body;

  const medication = await Medication.create({
    name,
    strength,
    strengthUnit,
    shape,
    color,
    dosageForm: 'tablet'
  });

  if (medication) {
    res.status(201).json(medication);
  } else {
    res.status(400);
    throw new Error('Invalid medication data');
  }
});

// @desc    Update medication
// @route   PUT /api/medications/:id
// @access  Admin/Healthcare Provider
const updateMedication = expressAsyncHandler(async (req, res) => {
 const medication = await Medication.findById(req.params.id);
 
 if (medication) {
   medication.name = req.body.name || medication.name;
   medication.strength = req.body.strength || medication.strength;
   medication.strengthUnit = req.body.strengthUnit || medication.strengthUnit;
   medication.shape = req.body.shape || medication.shape;
   medication.color = req.body.color || medication.color;
   
   const updatedMedication = await medication.save();
   res.json(updatedMedication);
 } else {
   res.status(404);
   throw new Error('Medication not found');
 }
});

// @desc    Delete medication
// @route   DELETE /api/medications/:id
// @access  Admin/Healthcare Provider
const deleteMedication = expressAsyncHandler(async (req, res) => {
  const medication = await Medication.findById(req.params.id);
  
  if (medication) {
    await Medication.deleteOne({ _id: req.params.id });
    res.json({ message: 'Medication removed' });
  } else {
    res.status(404);
    throw new Error('Medication not found');
  }
});

// @desc    Search medications
// @route   GET /api/medications/search
// @access  Admin/Healthcare Provider/User
const searchMedications = expressAsyncHandler(async (req, res) => {
  const { query } = req.query;
  
  const medications = await Medication.find({
    $or: [
      { name: { $regex: query, $options: 'i' } },
      { description: { $regex: query, $options: 'i' } },
      { manufacturer: { $regex: query, $options: 'i' } }
    ]
  });
  
  res.json(medications);
});

// @desc    Get active medications count and details
// @route   GET /api/medications/active/:patientId
// @access  Private/Patient
const getActiveMedications = expressAsyncHandler(async (req, res) => {
  const patientId = req.params.patientId;
  const today = new Date();
  
  // Find active schedules to get active medications
  const activeSchedules = await Schedule.find({
    patient: patientId,
    active: true,
    startDate: { $lte: today },
    $or: [
      { endDate: { $gte: today } },
      { endDate: null }
    ]
  }).populate('medication', 'name strength strengthUnit shape color dosageForm');
  
  // Get unique medications
  const uniqueMedications = [];
  const medicationIds = new Set();
  
  activeSchedules.forEach(schedule => {
    const medId = schedule.medication._id.toString();
    if (!medicationIds.has(medId)) {
      medicationIds.add(medId);
      uniqueMedications.push({
        medicationId: medId,
        name: schedule.medication.name,
        strength: schedule.medication.strength,
        strengthUnit: schedule.medication.strengthUnit,
        shape: schedule.medication.shape,
        color: schedule.medication.color,
        dosageForm: schedule.medication.dosageForm,
        schedules: []
      });
    }
    
    // Find the medication and add this schedule
    const medication = uniqueMedications.find(m => m.medicationId === medId);
    medication.schedules.push({
      scheduleId: schedule._id,
      times: schedule.scheduleTimes,
      daysOfWeek: schedule.daysOfWeek,
      dosage: schedule.dosage
    });
  });
  
  res.json({
    count: uniqueMedications.length,
    medications: uniqueMedications
  });
});

// @desc    Get medications needing refill soon
// @route   GET /api/medications/refills/:patientId
// @access  Private/Patient
const getUpcomingRefills = expressAsyncHandler(async (req, res) => {
  const patientId = req.params.patientId;
  const daysThreshold = parseInt(req.query.days) || 7; // Default to 7 days
  
  // Get patient medications with low inventory
  const medications = await PatientMedication.find({
    patient: patientId,
    'inventory.currentQuantity': { $lte: 'inventory.alertThreshold' }
  }).populate('medication', 'name strength strengthUnit');
  
  // Filter to those that will run out within threshold
  const today = new Date();
  const thresholdDate = new Date();
  thresholdDate.setDate(today.getDate() + daysThreshold);
  
  // Calculate estimated days remaining based on dosing schedule
  const upcomingRefills = [];
  
  for (const patientMed of medications) {
    // Get schedules for this medication
    const schedules = await Schedule.find({
      patient: patientId,
      medication: patientMed.medication._id,
      active: true
    });
    
    // Calculate daily usage
    let dailyUsage = 0;
    schedules.forEach(schedule => {
      const daysPerWeek = schedule.daysOfWeek.length;
      const dosesPerDay = schedule.scheduleTimes.length;
      const tabletPerDose = schedule.dosage.tablets || 1;
      
      dailyUsage += (daysPerWeek / 7) * dosesPerDay * tabletPerDose;
    });
    
    // Skip if no usage
    if (dailyUsage === 0) continue;
    
    // Calculate days until refill needed
    const currentQuantity = patientMed.inventory.currentQuantity;
    const daysRemaining = Math.floor(currentQuantity / dailyUsage);
    const estimatedEmptyDate = new Date();
    estimatedEmptyDate.setDate(today.getDate() + daysRemaining);
    
    // Add to list if within threshold
    if (daysRemaining <= daysThreshold) {
      upcomingRefills.push({
        medicationId: patientMed.medication._id,
        name: patientMed.medication.name,
        strength: patientMed.medication.strength,
        strengthUnit: patientMed.medication.strengthUnit,
        currentQuantity,
        daysRemaining,
        estimatedEmptyDate,
        dailyUsage
      });
    }
  }
  
  res.json({
    count: upcomingRefills.length,
    refills: upcomingRefills
  });
});


export {
  getMedications,
  getMedicationsByUser,
  getMedicationById,
  createMedication,
  updateMedication,
  deleteMedication,
  searchMedications,
  getActiveMedications,
  getUpcomingRefills
};