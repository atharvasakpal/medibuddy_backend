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

export {
  getMedications,
  getMedicationsByUser,
  getMedicationById,
  createMedication,
  updateMedication,
  deleteMedication,
  searchMedications
};