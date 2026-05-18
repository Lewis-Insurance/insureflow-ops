/**
 * Push Notifications Service
 *
 * Handles:
 * - Expo push token registration
 * - Device registration with backend
 * - Notification listeners
 * - Notification permission handling
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase, getSession } from './supabase';
import Constants from 'expo-constants';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export interface PushNotificationState {
  token: string | null;
  notification: Notifications.Notification | null;
  error: string | null;
}

/**
 * Request push notification permissions
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return false;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permission denied');
    return false;
  }

  return true;
}

/**
 * Get Expo push token
 */
export async function getExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  const permissionGranted = await requestNotificationPermissions();
  if (!permissionGranted) {
    return null;
  }

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const token = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    return token.data;
  } catch (error) {
    console.error('Error getting push token:', error);
    return null;
  }
}

/**
 * Register device with backend
 */
export async function registerDeviceForPush(agencyWorkspaceId?: string): Promise<boolean> {
  const session = await getSession();
  if (!session?.access_token) {
    console.log('User not authenticated, skipping device registration');
    return false;
  }

  const pushToken = await getExpoPushToken();
  if (!pushToken) {
    return false;
  }

  // Get device info
  const deviceId = Device.osBuildId || Device.modelId || 'unknown';
  const deviceName = Device.deviceName || `${Device.brand} ${Device.modelName}`;
  const deviceType = Platform.OS as 'ios' | 'android' | 'web';
  const osVersion = `${Platform.OS} ${Device.osVersion}`;
  const appVersion = Constants.expoConfig?.version || '1.0.0';

  try {
    const response = await supabase.functions.invoke('push-notifications', {
      body: {
        action: 'register_device',
        device_id: deviceId,
        device_name: deviceName,
        device_type: deviceType,
        push_token: pushToken,
        push_provider: 'expo',
        os_version: osVersion,
        app_version: appVersion,
        agency_workspace_id: agencyWorkspaceId,
      },
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (response.error) {
      console.error('Device registration failed:', response.error);
      return false;
    }

    console.log('Device registered for push notifications');
    return true;
  } catch (error) {
    console.error('Error registering device:', error);
    return false;
  }
}

/**
 * Unregister device from push notifications
 */
export async function unregisterDevice(): Promise<boolean> {
  const session = await getSession();
  if (!session?.access_token) {
    return false;
  }

  const deviceId = Device.osBuildId || Device.modelId || 'unknown';

  try {
    const response = await supabase.functions.invoke('push-notifications', {
      body: {
        action: 'unregister_device',
        device_id: deviceId,
      },
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    return !response.error;
  } catch (error) {
    console.error('Error unregistering device:', error);
    return false;
  }
}

/**
 * Set up notification listeners
 */
export function setupNotificationListeners(
  onNotificationReceived: (notification: Notifications.Notification) => void,
  onNotificationResponse: (response: Notifications.NotificationResponse) => void
) {
  // Listener for notifications received while app is foregrounded
  const notificationListener = Notifications.addNotificationReceivedListener(onNotificationReceived);

  // Listener for when user taps on notification
  const responseListener = Notifications.addNotificationResponseReceivedListener(onNotificationResponse);

  // Return cleanup function
  return () => {
    notificationListener.remove();
    responseListener.remove();
  };
}

/**
 * Get last notification response (for deep linking when app opens)
 */
export async function getLastNotificationResponse() {
  return Notifications.getLastNotificationResponseAsync();
}

/**
 * Set badge count (iOS)
 */
export async function setBadgeCount(count: number) {
  if (Platform.OS === 'ios') {
    await Notifications.setBadgeCountAsync(count);
  }
}

/**
 * Schedule a local notification (for reminders, etc.)
 */
export async function scheduleLocalNotification(
  title: string,
  body: string,
  triggerInSeconds: number,
  data?: Record<string, unknown>
): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: triggerInSeconds,
    },
  });
}

/**
 * Cancel a scheduled notification
 */
export async function cancelScheduledNotification(notificationId: string) {
  await Notifications.cancelScheduledNotificationAsync(notificationId);
}

/**
 * Cancel all scheduled notifications
 */
export async function cancelAllScheduledNotifications() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

// Android-specific channel setup
if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#1e3a8a',
  });

  Notifications.setNotificationChannelAsync('tasks', {
    name: 'Tasks',
    description: 'Task assignments and reminders',
    importance: Notifications.AndroidImportance.HIGH,
  });

  Notifications.setNotificationChannelAsync('messages', {
    name: 'Messages',
    description: 'Client messages and communications',
    importance: Notifications.AndroidImportance.HIGH,
  });

  Notifications.setNotificationChannelAsync('renewals', {
    name: 'Renewals',
    description: 'Policy renewal alerts',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}
