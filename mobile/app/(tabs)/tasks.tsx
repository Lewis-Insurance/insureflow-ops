import { useState } from 'react';
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
import { supabase } from '../../src/services/supabase';

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date: string | null;
  created_at: string;
}

type FilterType = 'pending' | 'completed' | 'all';

export default function TasksScreen() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterType>('pending');

  const { data: tasks, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['tasks', filter],
    queryFn: async () => {
      let query = supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false });

      if (filter === 'pending') {
        query = query.in('status', ['pending', 'in_progress']);
      } else if (filter === 'completed') {
        query = query.eq('status', 'completed');
      }

      const { data, error } = await query.limit(50);
      if (error) throw error;
      return data as Task[];
    },
  });

  const toggleComplete = useMutation({
    mutationFn: async (task: Task) => {
      const newStatus = task.status === 'completed' ? 'pending' : 'completed';
      const { error } = await supabase
        .from('tasks')
        .update({
          status: newStatus,
          completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
        })
        .eq('id', task.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
  });

  const getPriorityColor = (priority: Task['priority']) => {
    switch (priority) {
      case 'urgent': return '#dc2626';
      case 'high': return '#f97316';
      case 'medium': return '#eab308';
      case 'low': return '#22c55e';
      default: return '#64748b';
    }
  };

  const formatDueDate = (date: string | null) => {
    if (!date) return null;
    const dueDate = new Date(date);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (dueDate.toDateString() === today.toDateString()) {
      return 'Today';
    }
    if (dueDate.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    }
    if (dueDate < today) {
      return 'Overdue';
    }
    return dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const isOverdue = (date: string | null) => {
    if (!date) return false;
    return new Date(date) < new Date();
  };

  const renderTask = ({ item }: { item: Task }) => (
    <TouchableOpacity
      style={styles.taskCard}
      onPress={() => toggleComplete.mutate(item)}
      activeOpacity={0.7}
    >
      <View style={styles.taskCheckbox}>
        <Ionicons
          name={item.status === 'completed' ? 'checkbox' : 'square-outline'}
          size={26}
          color={item.status === 'completed' ? '#22c55e' : '#94a3b8'}
        />
      </View>
      <View style={styles.taskContent}>
        <Text
          style={[
            styles.taskTitle,
            item.status === 'completed' && styles.taskCompleted,
          ]}
          numberOfLines={2}
        >
          {item.title}
        </Text>
        {item.due_date && (
          <View style={styles.dueDateContainer}>
            <Ionicons
              name="calendar-outline"
              size={12}
              color={isOverdue(item.due_date) ? '#dc2626' : '#64748b'}
            />
            <Text
              style={[
                styles.taskDueDate,
                isOverdue(item.due_date) && styles.overdue,
              ]}
            >
              {formatDueDate(item.due_date)}
            </Text>
          </View>
        )}
      </View>
      <View
        style={[
          styles.priorityBadge,
          { backgroundColor: getPriorityColor(item.priority) },
        ]}
      >
        <Text style={styles.priorityText}>
          {item.priority.charAt(0).toUpperCase()}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Filter Tabs */}
      <View style={styles.filterTabs}>
        {(['pending', 'completed', 'all'] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterTab, filter === f && styles.filterTabActive]}
            onPress={() => setFilter(f)}
          >
            <Text
              style={[
                styles.filterTabText,
                filter === f && styles.filterTabTextActive,
              ]}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Task List */}
      <FlatList
        data={tasks}
        keyExtractor={(item) => item.id}
        renderItem={renderTask}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="checkbox-outline" size={48} color="#94a3b8" />
            </View>
            <Text style={styles.emptyTitle}>No tasks found</Text>
            <Text style={styles.emptyText}>
              {filter === 'pending'
                ? "You're all caught up!"
                : filter === 'completed'
                ? 'No completed tasks yet'
                : 'No tasks to display'}
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
  filterTabs: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
  },
  filterTabActive: {
    backgroundColor: '#1e3a8a',
  },
  filterTabText: {
    color: '#64748b',
    fontWeight: '500',
    fontSize: 14,
  },
  filterTabTextActive: {
    color: '#fff',
  },
  list: {
    padding: 16,
  },
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  taskCheckbox: {
    marginRight: 12,
  },
  taskContent: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1e293b',
    lineHeight: 22,
  },
  taskCompleted: {
    textDecorationLine: 'line-through',
    color: '#94a3b8',
  },
  dueDateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 4,
  },
  taskDueDate: {
    fontSize: 12,
    color: '#64748b',
  },
  overdue: {
    color: '#dc2626',
    fontWeight: '600',
  },
  priorityBadge: {
    width: 28,
    height: 28,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  priorityText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
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
  },
});
