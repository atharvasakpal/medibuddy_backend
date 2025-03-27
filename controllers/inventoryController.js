import Medication from '../models/medicationModel.js';
import expressAsyncHandler from 'express-async-handler';

// Get all inventory items
export const getAllItems = expressAsyncHandler(async (req, res) => {
  const medications = await Medication.find().sort({ name: 1 });
  
  res.status(200).json({
    success: true,
    count: medications.length,
    data: medications
  });
});

// Get medication by ID
export const getMedicationById = expressAsyncHandler(async (req, res) => {
  const medication = await Medication.findById(req.params.id);
  
  if (!medication) {
    res.status(404);
    throw new Error('Medication not found');
  }
  
  res.status(200).json({
    success: true,
    data: medication
  });
});

// Add new medication to inventory
export const addItem = expressAsyncHandler(async (req, res) => {
  const medication = new Medication({
    name: req.body.name,
    strength: req.body.strength,
    strengthUnit: req.body.strengthUnit,
    shape: req.body.shape,
    color: req.body.color,
    description: req.body.description,
    size: {
      diameter: req.body.diameter,
      thickness: req.body.thickness
    },
    scoreLines: req.body.scoreLines || 0,
    coated: req.body.coated || false,
    manufacturer: req.body.manufacturer,
    ndc: req.body.ndc,
    barcode: req.body.barcode
  });
  
  await medication.save();
  
  res.status(201).json({
    success: true,
    data: medication
  });
});

// Update medication details
export const updateMedication = expressAsyncHandler(async (req, res) => {
  const updateFields = {
    name: req.body.name,
    strength: req.body.strength,
    strengthUnit: req.body.strengthUnit,
    shape: req.body.shape,
    color: req.body.color,
    description: req.body.description,
    size: {
      diameter: req.body.diameter,
      thickness: req.body.thickness
    },
    scoreLines: req.body.scoreLines,
    coated: req.body.coated,
    manufacturer: req.body.manufacturer,
    ndc: req.body.ndc,
    barcode: req.body.barcode
  };

  const medication = await Medication.findByIdAndUpdate(
    req.params.id,
    updateFields,
    { new: true, runValidators: true }
  );
  
  if (!medication) {
    res.status(404);
    throw new Error('Medication not found');
  }
  
  res.status(200).json({
    success: true,
    data: medication
  });
});

// Delete medication
export const deleteMedication = expressAsyncHandler(async (req, res) => {
  const medication = await Medication.findByIdAndDelete(req.params.id);
  
  if (!medication) {
    res.status(404);
    throw new Error('Medication not found');
  }
  
  res.status(200).json({
    success: true,
    data: {}
  });
});