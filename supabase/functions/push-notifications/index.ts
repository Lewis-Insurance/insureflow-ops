/**
 * Push Notifications Edge Function
 *
 * Handles:
 * 1. Device registration (register/unregister push tokens)
 * 2. Processing the notification queue
 * 3. Sending push notifications via Expo Push API
 * 4. Notification preferences management
 * 5. Notification history retrieval
 *
 * Actions:
 * - register_device: Register a device for push notifications
 * - unregister_device: Remove a device registration
 * - process_queue: Send pending notifications (scheduled)
 * - get_notifications: Get notification history
 * - mark_read: Mark notifications as read
 * - get_preferences: Get notification preferences
 * - update_preferences: Update notification preferences
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createLogger } from '../_shared/logger.ts';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import { ValidationError, createErrorResponse } from '../_shared/error-handler.ts';
import { requireAgencyAuth, AgencyAuthenticatedUser } from '../_shared/agency-auth.ts';

const logger = createLogger('push-notifications');

// Expo Push API endpoint
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  badge?: number;
  priority?: 'default' | 'normal' | 'high';
  channelId?: string;
}

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

// Actions that require user authentication
const AUTH_REQUIRED_ACTIONS = [
  'register_device',
  'unregister_device',
  'get_notifications',
  'mark_read',
  'get_preferences',
  'update_preferences',
];

// Scheduled actions (service role only)
const SCHEDULED_ACTIONS = ['process_queue'];

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return handleCors(req);
  }

  const corsHeaders = getCorsHeaders(req);

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { action, ...params } = await req.json();
    logger.info('Processing push notification action', { action });

    let user: AgencyAuthenticatedUser | null = null;

    // Require authentication for user actions
    if (AUTH_REQUIRED_ACTIONS.includes(action)) {
      const authResult = await requireAgencyAuth(req, supabase, corsHeaders);
      if (authResult instanceof Response) {
        return authResult;
      }
      user = authResult;
    }

    let result;

    switch (action) {
      // User actions
      case 'register_device':
        result = await registerDevice(supabase, params, user!);
        break;

      case 'unregister_device':
        result = await unregisterDevice(supabase, params, user!);
        break;

      case 'get_notifications':
        result = await getNotifications(supabase, params, user!);
        break;

      case 'mark_read':
        result = await markNotificationsRead(supabase, params, user!);
        break;

      case 'get_preferences':
        result = await getPreferences(supabase, user!);
        break;

      case 'update_preferences':
        result = await updatePreferences(supabase, params, user!);
        break;

      // Scheduled actions
      case 'process_queue':
        result = await processNotificationQueue(supabase);
        break;

      default:
        throw new ValidationError(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('Push notification error', { error });
    return createErrorResponse(error, corsHeaders);
  }
});

// ============================================================================
// Device Registration
// ============================================================================

async function registerDevice(
  supabase: SupabaseClient,
  params: Record<string, unknown>,
  user: AgencyAuthenticatedUser
) {
  const {
    device_id,
    device_name,
    device_type,
    push_token,
    push_provider = 'expo',
    os_version,
    app_version,
    agency_workspace_id,
  } = params;

  if (!device_id || !push_token || !device_type) {
    throw new ValidationError('device_id, push_token, and device_type are required');
  }

  // Validate push token format for Expo
  if (push_provider === 'expo' && !push_token.toString().startsWith('ExponentPushToken[')) {
    throw new ValidationError('Invalid Expo push token format');
  }

  // Upsert device registration
  const { data, error } = await supabase
    .from('device_registrations')
    .upsert(
      {
        user_id: user.id,
        device_id,
        device_name,
        device_type,
        push_token,
        push_provider,
        os_version,
        app_version,
        agency_workspace_id,
        is_active: true,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,device_id' }
    )
    .select()
    .single();

  if (error) {
    logger.error('Failed to register device', { error });
    throw error;
  }

  logger.info('Device registered', { deviceId: device_id, userId: user.id });

  return { device: data };
}

async function unregisterDevice(
  supabase: SupabaseClient,
  params: Record<string, unknown>,
  user: AgencyAuthenticatedUser
) {
  const { device_id } = params;

  if (!device_id) {
    throw new ValidationError('device_id is required');
  }

  // Soft delete - mark as inactive
  const { error } = await supabase
    .from('device_registrations')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('device_id', device_id);

  if (error) {
    logger.error('Failed to unregister device', { error });
    throw error;
  }

  logger.info('Device unregistered', { deviceId: device_id, userId: user.id });

  return { unregistered: true };
}

// ============================================================================
// Notification Queue Processing
// ============================================================================

async function processNotificationQueue(supabase: SupabaseClient) {
  // Get pending notifications
  const { data: pendingNotifications, error: fetchError } = await supabase
    .from('push_notification_queue')
    .select(`
      *,
      device_registrations!inner(push_token, push_provider, is_active)
    `)
    .eq('status', 'pending')
    .lte('scheduled_for', new Date().toISOString())
    .gt('expires_at', new Date().toISOString())
    .lt('attempts', 3)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(100);

  if (fetchError) {
    logger.error('Failed to fetch pending notifications', { error: fetchError });
    throw fetchError;
  }

  if (!pendingNotifications || pendingNotifications.length === 0) {
    return { processed: 0, sent: 0, failed: 0 };
  }

  // Group notifications by user and get their active devices
  const userDevices = new Map<string, { tokens: string[]; notificationIds: string[] }>();

  for (const notification of pendingNotifications) {
    const userId = notification.user_id;

    // Get all active devices for this user if not already fetched
    if (!userDevices.has(userId)) {
      const { data: devices } = await supabase
        .from('device_registrations')
        .select('push_token')
        .eq('user_id', userId)
        .eq('is_active', true);

      userDevices.set(userId, {
        tokens: devices?.map((d) => d.push_token) || [],
        notificationIds: [],
      });
    }

    userDevices.get(userId)!.notificationIds.push(notification.id);
  }

  // Build Expo push messages
  const messages: ExpoPushMessage[] = [];
  const messageToNotification = new Map<number, string>();

  for (const notification of pendingNotifications) {
    const devices = userDevices.get(notification.user_id);
    if (!devices || devices.tokens.length === 0) {
      // No active devices, mark as failed
      await supabase
        .from('push_notification_queue')
        .update({
          status: 'failed',
          error_message: 'No active devices',
          last_attempt_at: new Date().toISOString(),
        })
        .eq('id', notification.id);
      continue;
    }

    // Send to all active devices
    for (const token of devices.tokens) {
      if (!token.startsWith('ExponentPushToken[')) {
        continue; // Skip non-Expo tokens for now
      }

      const messageIndex = messages.length;
      messageToNotification.set(messageIndex, notification.id);

      messages.push({
        to: token,
        title: notification.title,
        body: notification.body,
        data: notification.data || {},
        sound: 'default',
        priority: notification.priority === 'urgent' || notification.priority === 'high' ? 'high' : 'normal',
        channelId: notification.category,
      });
    }
  }

  if (messages.length === 0) {
    return { processed: pendingNotifications.length, sent: 0, failed: pendingNotifications.length };
  }

  // Send to Expo Push API
  let sent = 0;
  let failed = 0;

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const result = await response.json();
    const tickets: ExpoPushTicket[] = result.data || [];

    // Process tickets
    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      const notificationId = messageToNotification.get(i);

      if (!notificationId) continue;

      if (ticket.status === 'ok') {
        sent++;
        await supabase
          .from('push_notification_queue')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            last_attempt_at: new Date().toISOString(),
          })
          .eq('id', notificationId);
      } else {
        failed++;
        await supabase
          .from('push_notification_queue')
          .update({
            status: 'failed',
            error_message: ticket.message || ticket.details?.error || 'Unknown error',
            attempts: supabase.rpc ? undefined : 1, // Increment handled differently
            last_attempt_at: new Date().toISOString(),
          })
          .eq('id', notificationId);
      }
    }
  } catch (error) {
    logger.error('Expo push API error', { error });
    failed = messages.length;

    // Mark all as failed with retry
    for (const notification of pendingNotifications) {
      await supabase
        .from('push_notification_queue')
        .update({
          attempts: notification.attempts + 1,
          error_message: error instanceof Error ? error.message : 'Push API error',
          last_attempt_at: new Date().toISOString(),
        })
        .eq('id', notification.id);
    }
  }

  logger.info('Notification queue processed', { processed: pendingNotifications.length, sent, failed });

  return { processed: pendingNotifications.length, sent, failed };
}

// ============================================================================
// Notification History
// ============================================================================

async function getNotifications(
  supabase: SupabaseClient,
  params: Record<string, unknown>,
  user: AgencyAuthenticatedUser
) {
  const {
    limit = 50,
    offset = 0,
    unread_only = false,
    category,
    since_version,
  } = params;

  let query = supabase
    .from('notification_history')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .eq('is_archived', false)
    .order('created_at', { ascending: false })
    .range(offset as number, (offset as number) + (limit as number) - 1);

  if (unread_only) {
    query = query.eq('is_read', false);
  }

  if (category) {
    query = query.eq('category', category);
  }

  if (since_version) {
    query = query.gt('sync_version', since_version);
  }

  const { data, error, count } = await query;

  if (error) {
    logger.error('Failed to fetch notifications', { error });
    throw error;
  }

  // Get unread count
  const { count: unreadCount } = await supabase
    .from('notification_history')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_read', false)
    .eq('is_archived', false);

  return {
    notifications: data,
    total: count,
    unread_count: unreadCount || 0,
  };
}

async function markNotificationsRead(
  supabase: SupabaseClient,
  params: Record<string, unknown>,
  user: AgencyAuthenticatedUser
) {
  const { notification_ids, mark_all = false } = params;

  if (mark_all) {
    const { data } = await supabase.rpc('mark_notifications_read', {
      p_user_id: user.id,
      p_notification_ids: null,
    });
    return { marked: data || 0 };
  }

  if (!notification_ids || !Array.isArray(notification_ids)) {
    throw new ValidationError('notification_ids array is required when mark_all is false');
  }

  const { data } = await supabase.rpc('mark_notifications_read', {
    p_user_id: user.id,
    p_notification_ids: notification_ids,
  });

  return { marked: data || 0 };
}

// ============================================================================
// Notification Preferences
// ============================================================================

async function getPreferences(supabase: SupabaseClient, user: AgencyAuthenticatedUser) {
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('user_id', user.id);

  if (error) {
    logger.error('Failed to fetch preferences', { error });
    throw error;
  }

  // Return default preferences if none exist
  if (!data || data.length === 0) {
    return {
      preferences: {
        tasks_enabled: true,
        leads_enabled: true,
        policies_enabled: true,
        renewals_enabled: true,
        documents_enabled: true,
        messages_enabled: true,
        goals_enabled: true,
        system_enabled: true,
        push_enabled: true,
        email_enabled: true,
        sms_enabled: false,
        quiet_hours_enabled: false,
        batch_notifications: false,
      },
    };
  }

  return { preferences: data[0] };
}

async function updatePreferences(
  supabase: SupabaseClient,
  params: Record<string, unknown>,
  user: AgencyAuthenticatedUser
) {
  const { agency_workspace_id, ...preferences } = params;

  // Upsert preferences
  const { data, error } = await supabase
    .from('notification_preferences')
    .upsert(
      {
        user_id: user.id,
        agency_workspace_id: agency_workspace_id || user.defaultAgencyId,
        ...preferences,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,agency_workspace_id' }
    )
    .select()
    .single();

  if (error) {
    logger.error('Failed to update preferences', { error });
    throw error;
  }

  return { preferences: data };
}
