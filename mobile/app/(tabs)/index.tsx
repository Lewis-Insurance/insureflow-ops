import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { supabase, getCurrentUser } from '../../src/services/supabase';

interface DashboardStats {
  totalTasks: number;
  pendingTasks: number;
  activePolicies: number;
  upcomingRenewals: number;
}

export default function DashboardScreen() {
  const { data: user } = useQuery({
    queryKey: ['current-user'],
    queryFn: getCurrentUser,
  });

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async (): Promise<DashboardStats> => {
      // Fetch tasks count
      const { count: totalTasks } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true });

      const { count: pendingTasks } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .in('status', ['pending', 'in_progress']);

      // Fetch policies count
      const { count: activePolicies } = await supabase
        .from('policies')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');

      // Fetch upcoming renewals (next 30 days)
      const today = new Date();
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      const { count: upcomingRenewals } = await supabase
        .from('policies')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .gte('expiration_date', today.toISOString().split('T')[0])
        .lte('expiration_date', thirtyDaysFromNow.toISOString().split('T')[0]);

      return {
        totalTasks: totalTasks || 0,
        pendingTasks: pendingTasks || 0,
        activePolicies: activePolicies || 0,
        upcomingRenewals: upcomingRenewals || 0,
      };
    },
  });

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.greeting}>{getGreeting()}!</Text>
        <Text style={styles.userName}>
          {user?.email?.split('@')[0] || 'User'}
        </Text>
      </View>

      <View style={styles.statsGrid}>
        <TouchableOpacity
          style={styles.statCard}
          onPress={() => router.push('/(tabs)/tasks')}
        >
          <View style={[styles.iconBg, { backgroundColor: '#dbeafe' }]}>
            <Ionicons name="checkbox" size={24} color="#1e3a8a" />
          </View>
          <Text style={styles.statValue}>{data?.pendingTasks || 0}</Text>
          <Text style={styles.statLabel}>Pending Tasks</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.statCard}
          onPress={() => router.push('/(tabs)/policies')}
        >
          <View style={[styles.iconBg, { backgroundColor: '#d1fae5' }]}>
            <Ionicons name="shield-checkmark" size={24} color="#059669" />
          </View>
          <Text style={styles.statValue}>{data?.activePolicies || 0}</Text>
          <Text style={styles.statLabel}>Active Policies</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.statCard, data?.upcomingRenewals && data.upcomingRenewals > 0 ? styles.alertCard : {}]}
          onPress={() => router.push('/(tabs)/policies')}
        >
          <View style={[styles.iconBg, { backgroundColor: data?.upcomingRenewals && data.upcomingRenewals > 0 ? '#fee2e2' : '#fef3c7' }]}>
            <Ionicons
              name="calendar"
              size={24}
              color={data?.upcomingRenewals && data.upcomingRenewals > 0 ? '#dc2626' : '#d97706'}
            />
          </View>
          <Text style={[styles.statValue, data?.upcomingRenewals && data.upcomingRenewals > 0 ? styles.alertValue : {}]}>
            {data?.upcomingRenewals || 0}
          </Text>
          <Text style={styles.statLabel}>Renewals (30d)</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.statCard}
          onPress={() => router.push('/(tabs)/tasks')}
        >
          <View style={[styles.iconBg, { backgroundColor: '#e0e7ff' }]}>
            <Ionicons name="list" size={24} color="#4f46e5" />
          </View>
          <Text style={styles.statValue}>{data?.totalTasks || 0}</Text>
          <Text style={styles.statLabel}>Total Tasks</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.quickActions}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.actionButton}>
            <Ionicons name="add-circle" size={20} color="#1e3a8a" />
            <Text style={styles.actionText}>New Task</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton}>
            <Ionicons name="scan" size={20} color="#1e3a8a" />
            <Text style={styles.actionText}>Scan Doc</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton}>
            <Ionicons name="call" size={20} color="#1e3a8a" />
            <Text style={styles.actionText}>Call Client</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    padding: 20,
    paddingTop: 16,
  },
  greeting: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  userName: {
    fontSize: 16,
    color: '#64748b',
    marginTop: 4,
    textTransform: 'capitalize',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    gap: 12,
  },
  statCard: {
    width: '47%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  alertCard: {
    backgroundColor: '#fef2f2',
  },
  iconBg: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 4,
  },
  alertValue: {
    color: '#dc2626',
  },
  statLabel: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
  },
  quickActions: {
    padding: 20,
    paddingTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 16,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  actionText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '500',
    color: '#1e293b',
  },
});
