// reminderService.js
// Manages medication reminders and schedules

import notificationService from './notificationService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format } from 'date-fns';
import { sendSMS, sendEmail, sendPushNotification } from './notificationService';

// Storage keys
const REMINDERS_STORAGE_KEY = 'smartMedicine_reminders';
const REMINDER_HISTORY_KEY = 'smartMedicine_reminderHistory';

class ReminderService {
  constructor() {
    this.reminders = [];
    this.initialized = false;
  }

  // Initialize service and load saved reminders
  async initialize() {
    if (!this.initialized) {
      await this.loadReminders();
      this.initialized = true;
    }
  }

  // Load reminders from storage
  async loadReminders() {
    try {
      const remindersJson = await AsyncStorage.getItem(REMINDERS_STORAGE_KEY);
      if (remindersJson) {
        this.reminders = JSON.parse(remindersJson);
        // Re-schedule all active reminders
        this.rescheduleAllReminders();
      }
    } catch (error) {
      console.error('Error loading reminders:', error);
      this.reminders = [];
    }
  }

  // Save reminders to storage
  async saveReminders() {
    try {
      const remindersJson = JSON.stringify(this.reminders);
      await AsyncStorage.setItem(REMINDERS_STORAGE_KEY, remindersJson);
    } catch (error) {
      console.error('Error saving reminders:', error);
    }
  }

  // Add a new reminder
  async addReminder(reminderData) {
    const newReminder = {
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      ...reminderData,
      active: true,
      notificationIds: [],
    };

    this.reminders.push(newReminder);
    await this.saveReminders();
    await this.scheduleReminderNotifications(newReminder);
    return newReminder;
  }

  // Update an existing reminder
  async updateReminder(id, updatedData) {
    const index = this.reminders.findIndex(reminder => reminder.id === id);
    if (index === -1) {
      throw new Error(`Reminder with id ${id} not found`);
    }

    // Cancel existing notifications for this reminder
    await this.cancelReminderNotifications(this.reminders[index]);

    // Update the reminder
    this.reminders[index] = {
      ...this.reminders[index],
      ...updatedData,
      updatedAt: new Date().toISOString(),
    };

    // Reschedule notifications if reminder is active
    if (this.reminders[index].active) {
      await this.scheduleReminderNotifications(this.reminders[index]);
    }

    await this.saveReminders();
    return this.reminders[index];
  }

  // Delete a reminder
  async deleteReminder(id) {
    const index = this.reminders.findIndex(reminder => reminder.id === id);
    if (index === -1) {
      throw new Error(`Reminder with id ${id} not found`);
    }

    // Cancel notifications
    await this.cancelReminderNotifications(this.reminders[index]);

    // Remove from array
    this.reminders.splice(index, 1);
    await this.saveReminders();
  }

  // Get all reminders
  getAllReminders() {
    return [...this.reminders];
  }

  // Get a specific reminder by ID
  getReminderById(id) {
    return this.reminders.find(reminder => reminder.id === id);
  }

  // Get active reminders
  getActiveReminders() {
    return this.reminders.filter(reminder => reminder.active);
  }

  // Toggle reminder active status
  async toggleReminderStatus(id) {
    const reminder = this.getReminderById(id);
    if (!reminder) {
      throw new Error(`Reminder with id ${id} not found`);
    }

    reminder.active = !reminder.active;

    if (reminder.active) {
      await this.scheduleReminderNotifications(reminder);
    } else {
      await this.cancelReminderNotifications(reminder);
    }

    await this.saveReminders();
    return reminder;
  }

  // Schedule notifications for a single reminder
  async scheduleReminderNotifications(reminder) {
    // Clear any existing notification IDs
    reminder.notificationIds = [];

    // Schedule based on reminder type
    if (reminder.type === 'one-time') {
      const notificationId = await this.scheduleOneTimeReminder(reminder);
      if (notificationId) {
        reminder.notificationIds.push(notificationId);
      }
    } else if (reminder.type === 'recurring') {
      const notificationIds = await this.scheduleRecurringReminder(reminder);
      reminder.notificationIds = notificationIds;
    }

    await this.saveReminders();
  }

  // Schedule a one-time reminder
  async scheduleOneTimeReminder(reminder) {
    const { medicationName, dosage, time } = reminder;
    const reminderTime = new Date(time);
    
    // Only schedule if the time is in the future
    if (reminderTime > new Date()) {
      const title = 'Medication Reminder';
      const body = `Time to take ${dosage} of ${medicationName}`;
      
      const notificationId = await notificationService.scheduleNotification({
        title,
        body,
        data: { type: 'medication', reminderId: reminder.id },
        trigger: reminderTime,
      });
      
      return notificationId;
    }
    
    return null;
  }

  // Schedule recurring reminders
  async scheduleRecurringReminder(reminder) {
    const notificationIds = [];
    const { medicationName, dosage, frequency, times, daysOfWeek } = reminder;
    
    // Example: daily reminders
    if (frequency === 'daily') {
      for (const time of times) {
        const [hours, minutes] = time.split(':').map(Number);
        
        const trigger = {
          hour: hours,
          minute: minutes,
          repeats: true,
        };
        
        const title = 'Daily Medication Reminder';
        const body = `Time to take ${dosage} of ${medicationName}`;
        
        const notificationId = await notificationService.scheduleNotification({
          title,
          body,
          data: { type: 'medication', reminderId: reminder.id },
          trigger,
        });
        
        if (notificationId) {
          notificationIds.push(notificationId);
        }
      }
    } 
    // Weekly reminders
    else if (frequency === 'weekly') {
      for (const day of daysOfWeek) {
        for (const time of times) {
          const [hours, minutes] = time.split(':').map(Number);
          
          const trigger = {
            weekday: day, // 1 = Monday, 2 = Tuesday, etc.
            hour: hours,
            minute: minutes,
            repeats: true,
          };
          
          const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          const dayName = dayNames[day === 7 ? 0 : day]; // Convert to JS day format
          
          const title = 'Weekly Medication Reminder';
          const body = `${dayName}: Time to take ${dosage} of ${medicationName}`;
          
          const notificationId = await notificationService.scheduleNotification({
            title,
            body,
            data: { type: 'medication', reminderId: reminder.id },
            trigger,
          });
          
          if (notificationId) {
            notificationIds.push(notificationId);
          }
        }
      }
    }
    
    return notificationIds;
  }

  // Cancel all notifications for a specific reminder
  async cancelReminderNotifications(reminder) {
    if (reminder.notificationIds && reminder.notificationIds.length > 0) {
      for (const notificationId of reminder.notificationIds) {
        await notificationService.cancelNotification(notificationId);
      }
      reminder.notificationIds = [];
    }
  }

  // Reschedule all active reminders (useful after app restart)
  async rescheduleAllReminders() {
    const activeReminders = this.getActiveReminders();
    for (const reminder of activeReminders) {
      // First cancel any existing notifications
      await this.cancelReminderNotifications(reminder);
      // Then reschedule
      await this.scheduleReminderNotifications(reminder);
    }
  }

  // Mark a reminder as taken
  async markReminderAsTaken(reminderId, takenAt = new Date()) {
    const reminder = this.getReminderById(reminderId);
    if (!reminder) {
      throw new Error(`Reminder with id ${reminderId} not found`);
    }

    // Record history
    const historyEntry = {
      id: Date.now().toString(),
      reminderId,
      medicationName: reminder.medicationName,
      dosage: reminder.dosage,
      scheduledTime: reminder.type === 'one-time' ? reminder.time : null,
      takenAt: takenAt.toISOString(),
      status: 'taken',
    };

    await this.addToHistory(historyEntry);

    // For one-time reminders, deactivate after taken
    if (reminder.type === 'one-time') {
      await this.updateReminder(reminderId, { active: false });
    }

    return historyEntry;
  }

  // Skip a reminder
  async skipReminder(reminderId, reason = '') {
    const reminder = this.getReminderById(reminderId);
    if (!reminder) {
      throw new Error(`Reminder with id ${reminderId} not found`);
    }

    // Record in history
    const historyEntry = {
      id: Date.now().toString(),
      reminderId,
      medicationName: reminder.medicationName,
      dosage: reminder.dosage,
      scheduledTime: reminder.type === 'one-time' ? reminder.time : null,
      skippedAt: new Date().toISOString(),
      status: 'skipped',
      reason,
    };

    await this.addToHistory(historyEntry);

    // For one-time reminders, deactivate after skipped
    if (reminder.type === 'one-time') {
      await this.updateReminder(reminderId, { active: false });
    }

    return historyEntry;
  }

  // Add an entry to reminder history
  async addToHistory(historyEntry) {
    try {
      const historyJson = await AsyncStorage.getItem(REMINDER_HISTORY_KEY);
      let history = [];
      
      if (historyJson) {
        history = JSON.parse(historyJson);
      }
      
      history.push(historyEntry);
      await AsyncStorage.setItem(REMINDER_HISTORY_KEY, JSON.stringify(history));
    } catch (error) {
      console.error('Error adding to reminder history:', error);
    }
  }

  // Get reminder history
  async getReminderHistory() {
    try {
      const historyJson = await AsyncStorage.getItem(REMINDER_HISTORY_KEY);
      if (historyJson) {
        return JSON.parse(historyJson);
      }
      return [];
    } catch (error) {
      console.error('Error getting reminder history:', error);
      return [];
    }
  }

  // Get adherence statistics
  async getAdherenceStats(startDate, endDate) {
    const history = await this.getReminderHistory();
    const filteredHistory = history.filter(entry => {
      const entryDate = new Date(entry.takenAt || entry.skippedAt);
      return entryDate >= startDate && entryDate <= endDate;
    });

    const total = filteredHistory.length;
    const taken = filteredHistory.filter(entry => entry.status === 'taken').length;
    const skipped = filteredHistory.filter(entry => entry.status === 'skipped').length;

    return {
      total,
      taken,
      skipped,
      adherenceRate: total > 0 ? (taken / total) * 100 : 0,
    };
  }

  // Send reminder through different channels
  async sendCustomReminder(reminderId, channels = ['notification']) {
    const reminder = this.getReminderById(reminderId);
    if (!reminder) {
      throw new Error(`Reminder with id ${reminderId} not found`);
    }

    const title = 'Medication Reminder';
    const message = `Time to take ${reminder.dosage} of ${reminder.medicationName}`;
    
    const results = {};

    // Send through selected channels
    for (const channel of channels) {
      switch (channel) {
        case 'notification':
          const notificationId = await notificationService.sendInstantNotification(
            title,
            message,
            { type: 'medication', reminderId }
          );
          results.notification = !!notificationId;
          break;
          
        case 'sms':
          if (reminder.phoneNumber) {
            results.sms = await sendSMS(
              reminder.phoneNumber,
              message
            );
          }
          break;
          
        case 'email':
          if (reminder.email) {
            const emailSubject = 'Smart Medicine Reminder';
            const htmlBody = `
              <h2>Medication Reminder</h2>
              <p>It's time to take your medication:</p>
              <ul>
                <li><strong>Medication:</strong> ${reminder.medicationName}</li>
                <li><strong>Dosage:</strong> ${reminder.dosage}</li>
                <li><strong>Time:</strong> ${format(new Date(), 'h:mm a')}</li>
              </ul>
              <p>Stay healthy!</p>
            `;
            
            results.email = await sendEmail(
              reminder.email,
              emailSubject,
              message,
              htmlBody
            );
          }
          break;
          
        case 'push':
          const token = await notificationService.getPushToken();
          if (token) {
            results.push = await sendPushNotification(
              token,
              title,
              message,
              { type: 'medication', reminderId }
            );
          }
          break;
          
        default:
          console.warn(`Unknown notification channel: ${channel}`);
      }
    }
    
    return results;
  }
}

export default new ReminderService();