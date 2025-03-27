import express from 'express';
const router = express.Router();
import { 
  getAllItems, 
  getMedicationById, 
  addItem, 
  updateMedication, 
  deleteMedication 
} from '../controllers/inventoryController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

// Get all medications
router.get('/', protect, getAllItems);

// Get single medication by ID
router.get('/:id', protect, getMedicationById);

// Add new medication
router.post('/', protect, authorize('admin', 'pharmacist'), addItem);

// Update medication details
router.put('/:id', protect, authorize('admin', 'pharmacist'), updateMedication);

// Delete medication
router.delete('/:id', protect, authorize('admin', 'pharmacist'), deleteMedication);

export default router;