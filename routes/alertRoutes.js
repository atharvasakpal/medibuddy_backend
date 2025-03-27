import express from 'express';
import { 
  createAlert, 
  getAlertsByPatient, 
  updateAlertStatus,
  getMissedDoseAlerts
} from '../controllers/alertController.js';
import { protect, authorize, syncUser } from '../middleware/authMiddleware.js';

const router = express.Router();

// All alert routes are protected
router.use(protect);
router.use(syncUser);

// Patient-specific alerts (for patient and authorized users)
router.route('/patient/:patientId')
  .get(getAlertsByPatient);

// Missed dose alerts for a specific patient
router.route('/misseddoses/:patientId')
  .get(getMissedDoseAlerts);

// General alert management routes
router.route('/')
  .post(authorize('admin', 'healthcare_provider'), createAlert);

router.route('/:id')
  .put(authorize('admin', 'healthcare_provider'), updateAlertStatus);

export default router;