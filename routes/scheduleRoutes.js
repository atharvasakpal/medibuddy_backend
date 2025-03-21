// scheduleRoutes.js
import express from 'express';
import { 
  getSchedules, 
  getScheduleById, 
  createSchedule, 
  updateSchedule, 
  deleteSchedule,
  getUserSchedules,
  validateSchedule
} from '../controllers/scheduleController.js';
import { protect, authorize, syncUser } from '../middleware/authMiddleware.js';

const router = express.Router();

// All schedule routes are protected
router.use(protect);
router.use(syncUser);

router.route('/')
  .get(getUserSchedules)
  .post(createSchedule);

router.route('/:id')
  .get(getScheduleById)
  .put(updateSchedule)
  .delete(deleteSchedule);

router.route('/:id/validate')
  .post(validateSchedule);

// Healthcare provider and admin routes
router.route('/all')
  .get(authorize('admin', 'healthcare_provider'), getSchedules);

export default router;