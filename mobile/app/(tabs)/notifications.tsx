import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { supabase, getSession } from '../../src/services/supabase';

interface Notification {
  id: string;
  title: string;
  body: string;
  category: string;
  is_read: boolean;
  created_at: string;
  source_type: string | null;
  source_id: string | null;
}

export default function NotificationsScreen() {
  const queryClient = useQueryClient();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const session = await getSession();
      if (!session) return { notifications: [], unread_count: 0 };

      try {
        const response = await supabase.functions.invoke('push-notifications', {
          body: { action: 'get_notifications', limit: 50 },
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        return response.data || { notifications: [], unread_count: 0 };
      } catch (error) {
        console.error('Error fetching notifications:', error);
        return { notifications: [], unread_count: 0 };
      }
    },
  });

  const markAsRead = useMutation({
    mutationFn: async (notificationId: string) => {
      const session = await getSession();
      if (!session) throw new Error('Not authenticated');

      await supabase.functions.invoke('push-notifications', {
        body: { action: 'mark_read', notification_ids: [notificationId] },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllAsRead = useMutation({
    mutationFn: async () => {
      const session = await getSession();
      if (!session) throw new Error('Not authenticated');

      await supabase.functions.invoke('push-notifications', {
        body: { action: 'mark_read', mark_all: true },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const getCategoryIcon = (category: string): string => {
    switch (category) {
      case 'task': return 'checkbox';
      case 'lead': return 'person-add';
      case 'policy': return 'document-text';
      case 'renewal': return 'calendar';
      case 'message': return 'chatbubble';
      case 'goal': return 'trophy';
      case 'achievement': return 'medal';
      default: return 'notifications';
    }
  };

  const getCategoryColor = (category: string): string => {
    switch (category) {
      case 'task': return '#3b82f6';
      case 'lead': return '#22c55e';
      case 'policy': return '#8b5cf6';
      case 'renewal': return '#f97316';
      case 'message': return '#06b6d4';
      case 'goal': return '#eab308';
      case 'achievement': return '#ec4899';
      default: return '#64748b';
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const renderNotification = ({ item }: { item: Notification }) => (
    <TouchableOpacity
      style={[styles.notificationCard, !item.is_read && styles.unread]}
      onPress={() => !item.is_read && markAsRead.mutate(item.id)}
      activeOpacity={0.7}
    >
      <View style={[styles.iconContainer, { backgroundColor: getCategoryColor(item.category) + '20' }]}>
        <Ionicons
          name={getCategoryIcon(item.category) as any}
          size={22}
          color={getCategoryColor(item.category)}
        />
      </View>
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.title} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.time}>{formatTimeAgo(item.created_at)}</Text>
        </View>
        <Text style={styles.body} numberOfLines={2}>
          {item.body}
        </Text>
      </View>
      {!item.is_read && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );

  const unreadCount = data?.unread_count || 0;

  return (
    <View style={styles.container}>
      {unreadCount > 0 && (
        <View style={styles.headerBar}>
          <Text style={styles.unreadLabel}>
            {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
          </Text>
          <TouchableOpacity
            style={styles.markAllButton}
            onPress={() => markAllAsRead.mutate()}
            disabled={markAllAsRead.isPending}
          >
            <Ionicons name="checkmark-done" size={18} color="#1e3a8a" />
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={data?.notifications || []}
        keyExtractor={(item) => item.id}
        renderItem={renderNotification}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="notifications-outline" size={48} color="#94a3b8" />
            </View>
            <Text style={styles.emptyTitle}>No notifications</Text>
            <Text style={styles.emptyText}>
              You're all caught up! Notifications will appear here.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  unreadLabel: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  markAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  markAllText: {
    color: '#1e3a8a',
    fontWeight: '600',
    fontSize: 14,
  },
  list: {
    padding: 16,
  },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  unread: {
    backgroundColor: '#eff6ff',
    borderLeftWidth: 3,
    borderLeftColor: '#1e3a8a',
  },
  iconContainer: {
    width: 42,
    height: 42,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
    flex: 1,
    marginRight: 8,
  },
  time: {
    fontSize: 12,
    color: '#94a3b8',
  },
  body: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#1e3a8a',
    marginLeft: 8,
    marginTop: 4,
  },
  emptyState: {
    alignItems: 'center',
    padding: 48,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
  },
});
