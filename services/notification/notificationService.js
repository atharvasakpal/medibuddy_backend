// notificationService.js
// Handles all user notifications in the Smart Medicine application

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

class NotificationService {
  constructor() {
    this.notificationListener = null;
    this.responseListener = null;
    this.expoPushToken = null;
  }

  // Initialize notifications and request permissions
  async initialize() {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    // Request permission
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for notification!');
      return;
    }
    
    // Get push token
    if (Device.isDevice) {
      const token = await Notifications.getExpoPushTokenAsync({
        projectId: Constants.expoConfig?.extra?.eas?.projectId,
      });
      this.expoPushToken = token.data;
      await this.savePushToken(token.data);
    } else {
      console.log('Must use physical device for Push Notifications');
    }

    // Set up notification listeners
    this.setupListeners();
  }

  // Save push token to storage
  async savePushToken(token) {
    try {
      await AsyncStorage.setItem('pushToken', token);
    } catch (error) {
      console.error('Error saving push token:', error);
    }
  }

  // Get saved push token
  async getPushToken() {
    try {
      const token = await AsyncStorage.getItem('pushToken');
      return token;
    } catch (error) {
      console.error('Error getting push token:', error);
      return null;
    }
  }

  // Setup notification listeners
  setupListeners() {
    this.notificationListener = Notifications.addNotificationReceivedListener(
      this.handleNotificationReceived
    );
    
    this.responseListener = Notifications.addNotificationResponseReceivedListener(
      this.handleNotificationResponse
    );
  }

  // Clean up listeners
  cleanupListeners() {
    if (this.notificationListener) {
      Notifications.removeNotificationSubscription(this.notificationListener);
    }
    if (this.responseListener) {
      Notifications.removeNotificationSubscription(this.responseListener);
    }
  }

  // Handle received notification
  handleNotificationReceived = (notification) => {
    console.log('Notification received:', notification);
    // Additional handling can be implemented here
  }

  // Handle notification response (when user taps)
  handleNotificationResponse = (response) => {
    const data = response.notification.request.content.data;
    console.log('Notification response:', data);
    
    // Handle different notification types
    if (data.type === 'medication') {
      // Navigate to medication screen or mark as taken
      // This would need to integrate with your navigation system
    }
  }

  // Schedule a notification
  async scheduleNotification({ title, body, data, trigger }) {
    try {
      const identifier = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: data || {},
          sound: true,
        },
        trigger,
      });
      return identifier;
    } catch (error) {
      console.error('Error scheduling notification:', error);
      return null;
    }
  }

  // Cancel a specific notification
  async cancelNotification(notificationId) {
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
    } catch (error) {
      console.error('Error canceling notification:', error);
    }
  }

  // Cancel all notifications
  async cancelAllNotifications() {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch (error) {
      console.error('Error canceling all notifications:', error);
    }
  }

  // Get all scheduled notifications
  async getAllScheduledNotifications() {
    try {
      const notifications = await Notifications.getAllScheduledNotificationsAsync();
      return notifications;
    } catch (error) {
      console.error('Error getting scheduled notifications:', error);
      return [];
    }
  }

  // Send instant notification
  async sendInstantNotification(title, body, data = {}) {
    return this.scheduleNotification({
      title,
      body,
      data,
      trigger: null, // null trigger means send immediately
    });
  }

  // Send SMS notification
  async sendSMS(phoneNumber, message) {
    try {
      // This is a placeholder for actual SMS sending functionality
      // In a real app, you would integrate with services like Twilio, Nexmo, etc.
      console.log(`Sending SMS to ${phoneNumber}: ${message}`);
      
      // Mock API call to SMS service
      const response = await fetch('https://api.smsservice.example/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: phoneNumber,
          message: message,
          apiKey: 'YOUR_SMS_API_KEY', // In production, use environment variables
        }),
      });
      
      if (!response.ok) {
        throw new Error('SMS service responded with an error');
      }
      
      return true;
    } catch (error) {
      console.error('Error sending SMS:', error);
      return false;
    }
  }

  // Send email notification
  async sendEmail(email, subject, message, htmlBody = null) {
    try {
      // This is a placeholder for actual email sending functionality
      // In a real app, you would integrate with services like SendGrid, Mailgun, etc.
      console.log(`Sending email to ${email}: ${subject}`);
      
      // Mock API call to email service
      const response = await fetch('https://api.emailservice.example/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: email,
          subject: subject,
          text: message,
          html: htmlBody || message,
          apiKey: 'YOUR_EMAIL_API_KEY', // In production, use environment variables
        }),
      });
      
      if (!response.ok) {
        throw new Error('Email service responded with an error');
      }
      
      return true;
    } catch (error) {
      console.error('Error sending email:', error);
      return false;
    }
  }

  // Send push notification
  async sendPushNotification(token, title, body, data = {}) {
    try {
      // For Expo push notifications
      const message = {
        to: token,
        sound: 'default',
        title: title,
        body: body,
        data: data,
      };

      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        throw new Error('Push notification service responded with an error');
      }
      
      return true;
    } catch (error) {
      console.error('Error sending push notification:', error);
      return false;
    }
  }
}

// Create and export instance of the service
const notificationService = new NotificationService();
export default notificationService;

// Export the specific methods that are being imported in other modules
export const sendSMS = (phoneNumber, message) => notificationService.sendSMS(phoneNumber, message);
export const sendEmail = (email, subject, message, htmlBody) => notificationService.sendEmail(email, subject, message, htmlBody);
export const sendPushNotification = (token, title, body, data) => notificationService.sendPushNotification(token, title, body, data);