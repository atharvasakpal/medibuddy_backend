import express from 'express';
import { 
  registerDispenserDevice, 
  getDispenserDeviceById,
  createDispensingLog,
  updateDispensingLogStatus,
  getUpcomingDispenses
} from '../controllers/dispenserController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public webhook for IoT device communication
router.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const payload = req.body;
  // Handle basic dispenser events
  console.log('Dispenser webhook received:', payload);
  res.status(200).json({ received: true });
});

// Protect all routes after this point
router.use(protect);

// Dispenser device management
router.route('/')
  .post(registerDispenserDevice);

router.route('/:id')
  .get(getDispenserDeviceById);

// Dispensing log routes
router.route('/:id/logs')
  .post(createDispensingLog);

router.route('/logs/:logId')
  .put(updateDispensingLogStatus);

// Patient upcoming dispenses
router.route('/upcoming/:patientId')
  .get(getUpcomingDispenses);

export default router;