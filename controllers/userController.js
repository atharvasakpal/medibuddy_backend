import expressAsyncHandler from 'express-async-handler';
import User from '../models/userModel.js';

// @desc    Get all users
// @route   GET /api/users
// @access  Admin
const getUsers = expressAsyncHandler(async (req, res) => {
  const users = await User.find({});
  res.json(users);
});

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Admin/Healthcare Provider
const getUserById = expressAsyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  
  if (user) {
    res.json(user);
  } else {
    res.status(404);
    throw new Error('User not found');
  }
});

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Admin
const updateUser = expressAsyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  
  if (user) {
    user.firstName = req.body.firstName || user.firstName;
    user.lastName = req.body.lastName || user.lastName;
    user.role = req.body.role || user.role;
    // Add other fields as needed
    
    const updatedUser = await user.save();
    res.json(updatedUser);
  } else {
    res.status(404);
    throw new Error('User not found');
  }
});

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Admin
const deleteUser = expressAsyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  
  if (user) {
    await user.remove();
    res.json({ message: 'User removed' });
  } else {
    res.status(404);
    throw new Error('User not found');
  }
});

// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
const getUserProfile = expressAsyncHandler(async (req, res) => {
  res.json(req.user);
});

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
const updateUserProfile = expressAsyncHandler(async (req, res) => {
  const user = req.user;
  
  if (user) {
    // Only update fields that were actually passed
    if (req.body.phoneNumber) user.phoneNumber = req.body.phoneNumber;
    if (req.body.dateOfBirth) user.dateOfBirth = req.body.dateOfBirth;
    if (req.body.address) user.address = req.body.address;
    if (req.body.emergencyContacts) user.emergencyContacts = req.body.emergencyContacts;
    if (req.body.preferences) user.preferences = {
      ...user.preferences,
      ...req.body.preferences
    };
    
    const updatedUser = await user.save();
    res.json(updatedUser);
  } else {
    res.status(404);
    throw new Error('User not found');
  }
});

export {
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
  getUserProfile,
  updateUserProfile
};