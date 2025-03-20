import express from 'express';
import { getUsers, getUserById, updateUser, deleteUser, getUserProfile, updateUserProfile } from '../controllers/userController.js';
import { protect, authorize, syncUser } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public routes
router.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const payload = req.body;
  // Handle Clerk webhooks - user created, updated, deleted
  console.log('Webhook received:', payload);
  res.status(200).json({ received: true });
});

// Protected routes
router.use(protect); // All routes below require authentication
router.use(syncUser); // Sync Clerk user with our database

router.route('/profile')
  .get(getUserProfile)
  .put(updateUserProfile);

// Admin only routes
router.route('/')
  .get(authorize('admin'), getUsers);

router.route('/:id')
  .get(authorize('admin', 'healthcare_provider'), getUserById)
  .put(authorize('admin'), updateUser)
  .delete(authorize('admin'), deleteUser);

export default router;