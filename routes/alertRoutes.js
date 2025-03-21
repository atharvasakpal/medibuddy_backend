// alertRoutes.js
import express from 'express';
import { 
  getAlerts, 
  getAlertById, 
  createAlert, 
  updateAlert, 
  dismissAlert,
  getUserAlerts,
  sendTestAlert
} from '../controllers/alertController.js';
import { protect, authorize, syncUser } from '../middleware/authMiddleware.js';

const router = express.Router();

// All alert routes are protected
router.use(protect);
router.use(syncUser);

router.route('/')
  .get(getUserAlerts)
  .post(authorize('admin', 'healthcare_provider'), createAlert);

router.route('/:id')
  .get(getAlertById)
  .put(authorize('admin', 'healthcare_provider'), updateAlert)
  .patch(dismissAlert);

router.route('/test')
  .post(sendTestAlert);

// Admin and healthcare provider routes
router.route('/all')
  .get(authorize('admin', 'healthcare_provider'), getAlerts);

export default router;