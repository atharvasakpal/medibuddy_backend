// medicationRoutes.js
import express from 'express';
import { 
  getMedications, 
  getMedicationById, 
  createMedication, 
  updateMedication, 
  deleteMedication,
  getUserMedications
} from '../controllers/medicationController.js';
import { protect, authorize, syncUser } from '../middleware/authMiddleware.js';

const router = express.Router();

// All medication routes are protected
router.use(protect);
router.use(syncUser);

// User medication routes
router.route('/')
  .get(getUserMedications)
  .post(createMedication);

router.route('/:id')
  .get(getMedicationById)
  .put(updateMedication)
  .delete(deleteMedication);

// Admin and healthcare provider routes
router.route('/all')
  .get(authorize('admin', 'healthcare_provider'), getMedications);

export default router;