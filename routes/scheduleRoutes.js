import express from 'express';
import { 
  getAllSchedules, 
  getScheduleById, 
  createSchedule, 
  updateSchedule, 
  deleteSchedule
} from '../controllers/scheduleController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// All schedule routes are protected
router.use(protect);

router.route('/')
  .get(getAllSchedules)
  .post(createSchedule);

router.route('/:id')
  .get(getScheduleById)
  .put(updateSchedule)
  .delete(deleteSchedule);

export default router;