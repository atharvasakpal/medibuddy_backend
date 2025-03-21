// dispenserRoutes.js
import express from 'express';
import { 
  getDispensers, 
  getDispenserById, 
  registerDispenser, 
  updateDispenser, 
  deleteDispenser,
  getUserDispensers,
  syncDispenser,
  calibrateDispenser
} from '../controllers/dispenserController.js';
import { protect, authorize, syncUser } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public webhook for IoT device communication
router.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const payload = req.body;
  // Handle dispenser events - refill, malfunction, dose taken
  console.log('Dispenser webhook received:', payload);
  res.status(200).json({ received: true });
});

// Protected routes
router.use(protect);
router.use(syncUser);

router.route('/')
  .get(getUserDispensers)
  .post(registerDispenser);

router.route('/:id')
  .get(getDispenserById)
  .put(updateDispenser)
  .delete(deleteDispenser);

router.route('/:id/sync')
  .post(syncDispenser);

router.route('/:id/calibrate')
  .post(calibrateDispenser);

// Admin only routes
router.route('/all')
  .get(authorize('admin'), getDispensers);

export default router;