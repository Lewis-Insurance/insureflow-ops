# InsureFlow Mobile App - Complete Setup Guide

This guide covers everything needed to set up, develop, and deploy the InsureFlow mobile app.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Initial Setup](#initial-setup)
3. [Environment Configuration](#environment-configuration)
4. [Running the Development Server](#running-the-development-server)
5. [Creating App Screens](#creating-app-screens)
6. [Navigation Setup](#navigation-setup)
7. [Connecting to Backend](#connecting-to-backend)
8. [Push Notifications Setup](#push-notifications-setup)
9. [Building for Production](#building-for-production)
10. [App Store Submission](#app-store-submission)
11. [Troubleshooting](#troubleshooting)

---

## 1. Prerequisites

### Required Software

```bash
# Node.js 18+ (LTS recommended)
node --version  # Should be 18.x or higher

# Install Expo CLI globally
npm install -g expo-cli

# Install EAS CLI for builds
npm install -g eas-cli

# Watchman (macOS only, recommended for faster builds)
brew install watchman
```

### Required Accounts

1. **Expo Account**: Create at https://expo.dev/signup
2. **Apple Developer Account**: $99/year at https://developer.apple.com
3. **Google Play Developer Account**: $25 one-time at https://play.google.com/console

### Physical Devices for Testing

- **iOS**: Install "Expo Go" from App Store
- **Android**: Install "Expo Go" from Play Store

---

## 2. Initial Setup

### Step 2.1: Navigate to Mobile Directory

```bash
cd /Users/brianlewis/insureflow-ops/mobile
```

### Step 2.2: Install Dependencies

```bash
npm install
```

### Step 2.3: Login to Expo

```bash
# Login to your Expo account
expo login

# Verify login
expo whoami
```

### Step 2.4: Initialize EAS

```bash
# Configure EAS for this project
eas build:configure

# This will:
# 1. Create eas.json configuration file
# 2. Link project to your Expo account
# 3. Set up build profiles (development, preview, production)
```

---

## 3. Environment Configuration

### Step 3.1: Create Environment File

Create `.env` in the mobile directory:

```bash
# mobile/.env
EXPO_PUBLIC_SUPABASE_URL=https://lrqajzwcmdwahnjyidgv.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
EXPO_PUBLIC_APP_NAME=InsureFlow
EXPO_PUBLIC_APP_VERSION=1.0.0
```

### Step 3.2: Update app.json

Update `mobile/app.json` with your actual values:

```json
{
  "expo": {
    "name": "InsureFlow",
    "slug": "insureflow",
    "extra": {
      "eas": {
        "projectId": "your-expo-project-id"
      }
    }
  }
}
```

Get your project ID from https://expo.dev after running `eas build:configure`.

---

## 4. Running the Development Server

### Step 4.1: Start Development Server

```bash
# Start with Expo Go
npm start

# Or start for specific platform
npm run ios      # iOS Simulator or device
npm run android  # Android Emulator or device
```

### Step 4.2: Connect Your Device

1. Open Expo Go app on your phone
2. Scan the QR code shown in terminal
3. App will load on your device

### Step 4.3: Development Mode Features

- **Hot Reload**: Changes appear instantly
- **Shake to Open Menu**: Access developer menu
- **Console Logs**: View in terminal or Expo Dev Tools

---

## 5. Creating App Screens

### Step 5.1: Create App Directory Structure

Expo Router uses file-based routing. Create the following structure:

```bash
mkdir -p mobile/app
mkdir -p mobile/app/\(auth\)
mkdir -p mobile/app/\(tabs\)
```

### Step 5.2: Create Root Layout

Create `mobile/app/_layout.tsx`:

```tsx
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useColorScheme } from 'react-native';
import {
  registerDeviceForPush,
  setupNotificationListeners
} from '@/services/pushNotifications';
import { initNetworkListener } from '@/services/offlineSync';
import { supabase } from '@/services/supabase';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      cacheTime: 1000 * 60 * 5, // 5 minutes
    },
  },
});

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    // Initialize network listener for offline sync
    const unsubscribeNetwork = initNetworkListener();

    // Setup push notification listeners
    const unsubscribePush = setupNotificationListeners(
      (notification) => {
        console.log('Notification received:', notification);
      },
      (response) => {
        console.log('Notification tapped:', response);
        // Handle deep linking here
      }
    );

    // Register device for push when authenticated
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        registerDeviceForPush();
      }
    });

    return () => {
      unsubscribeNetwork();
      unsubscribePush();
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </QueryClientProvider>
  );
}
```

### Step 5.3: Create Authentication Screens

Create `mobile/app/(auth)/_layout.tsx`:

```tsx
import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="forgot-password" />
    </Stack>
  );
}
```

Create `mobile/app/(auth)/login.tsx`:

```tsx
import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/services/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        Alert.alert('Login Failed', error.message);
      } else {
        router.replace('/(tabs)');
      }
    } catch (error) {
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <Text style={styles.title}>InsureFlow</Text>
        <Text style={styles.subtitle}>Sign in to your account</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Signing in...' : 'Sign In'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => router.push('/(auth)/forgot-password')}
        >
          <Text style={styles.linkText}>Forgot password?</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1e3a8a',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 32,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 16,
    marginBottom: 16,
    fontSize: 16,
  },
  button: {
    height: 50,
    backgroundColor: '#1e3a8a',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  linkButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  linkText: {
    color: '#1e3a8a',
    fontSize: 14,
  },
});
```

### Step 5.4: Create Tab Navigation

Create `mobile/app/(tabs)/_layout.tsx`:

```tsx
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#1e3a8a',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: '#e2e8f0',
        },
        headerStyle: {
          backgroundColor: '#1e3a8a',
        },
        headerTintColor: '#fff',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: 'Tasks',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="checkbox" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="policies"
        options={{
          title: 'Policies',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="document-text" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Notifications',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="notifications" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
```

### Step 5.5: Create Dashboard Screen

Create `mobile/app/(tabs)/index.tsx`:

```tsx
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/supabase';

interface DashboardStats {
  totalTasks: number;
  pendingTasks: number;
  activePolicies: number;
  upcomingRenewals: number;
}

export default function DashboardScreen() {
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
        .eq('status', 'pending');

      // Fetch policies count
      const { count: activePolicies } = await supabase
        .from('policies')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');

      // Fetch upcoming renewals (next 30 days)
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      const { count: upcomingRenewals } = await supabase
        .from('policies')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .lte('expiration_date', thirtyDaysFromNow.toISOString())
        .gte('expiration_date', new Date().toISOString());

      return {
        totalTasks: totalTasks || 0,
        pendingTasks: pendingTasks || 0,
        activePolicies: activePolicies || 0,
        upcomingRenewals: upcomingRenewals || 0,
      };
    },
  });

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
      }
    >
      <Text style={styles.greeting}>Good morning!</Text>

      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{data?.pendingTasks || 0}</Text>
          <Text style={styles.statLabel}>Pending Tasks</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statValue}>{data?.activePolicies || 0}</Text>
          <Text style={styles.statLabel}>Active Policies</Text>
        </View>

        <View style={[styles.statCard, styles.alertCard]}>
          <Text style={[styles.statValue, styles.alertValue]}>
            {data?.upcomingRenewals || 0}
          </Text>
          <Text style={styles.statLabel}>Renewals (30d)</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statValue}>{data?.totalTasks || 0}</Text>
          <Text style={styles.statLabel}>Total Tasks</Text>
        </View>
      </View>

      {/* Add more dashboard content here */}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: 16,
  },
  greeting: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 24,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  alertCard: {
    backgroundColor: '#fef2f2',
  },
  statValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1e3a8a',
    marginBottom: 4,
  },
  alertValue: {
    color: '#dc2626',
  },
  statLabel: {
    fontSize: 14,
    color: '#64748b',
  },
});
```

### Step 5.6: Create Tasks Screen

Create `mobile/app/(tabs)/tasks.tsx`:

```tsx
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
import { supabase } from '@/services/supabase';

interface Task {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date: string | null;
}

export default function TasksScreen() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('pending');

  const { data: tasks, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['tasks', filter],
    queryFn: async () => {
      let query = supabase.from('tasks').select('*').order('created_at', { ascending: false });

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
        .update({ status: newStatus })
        .eq('id', task.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
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

  const renderTask = ({ item }: { item: Task }) => (
    <TouchableOpacity
      style={styles.taskCard}
      onPress={() => toggleComplete.mutate(item)}
    >
      <View style={styles.taskCheckbox}>
        <Ionicons
          name={item.status === 'completed' ? 'checkbox' : 'square-outline'}
          size={24}
          color={item.status === 'completed' ? '#22c55e' : '#94a3b8'}
        />
      </View>
      <View style={styles.taskContent}>
        <Text
          style={[
            styles.taskTitle,
            item.status === 'completed' && styles.taskCompleted,
          ]}
        >
          {item.title}
        </Text>
        {item.due_date && (
          <Text style={styles.taskDueDate}>
            Due: {new Date(item.due_date).toLocaleDateString()}
          </Text>
        )}
      </View>
      <View
        style={[
          styles.priorityBadge,
          { backgroundColor: getPriorityColor(item.priority) },
        ]}
      >
        <Text style={styles.priorityText}>{item.priority}</Text>
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
            <Ionicons name="checkbox-outline" size={48} color="#94a3b8" />
            <Text style={styles.emptyText}>No tasks found</Text>
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
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#e2e8f0',
  },
  filterTabActive: {
    backgroundColor: '#1e3a8a',
  },
  filterTabText: {
    color: '#64748b',
    fontWeight: '500',
  },
  filterTabTextActive: {
    color: '#fff',
  },
  list: {
    padding: 16,
    paddingTop: 0,
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
  },
  taskCompleted: {
    textDecorationLine: 'line-through',
    color: '#94a3b8',
  },
  taskDueDate: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  priorityText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  emptyState: {
    alignItems: 'center',
    padding: 48,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 16,
    color: '#64748b',
  },
});
```

### Step 5.7: Create Notifications Screen

Create `mobile/app/(tabs)/notifications.tsx`:

```tsx
import { View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { supabase, getSession } from '@/services/supabase';
import { formatDistanceToNow } from 'date-fns';

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

      const response = await supabase.functions.invoke('push-notifications', {
        body: { action: 'get_notifications', limit: 50 },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      return response.data;
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

  const getCategoryIcon = (category: string) => {
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

  const renderNotification = ({ item }: { item: Notification }) => (
    <TouchableOpacity
      style={[styles.notificationCard, !item.is_read && styles.unread]}
      onPress={() => markAsRead.mutate(item.id)}
    >
      <View style={styles.iconContainer}>
        <Ionicons
          name={getCategoryIcon(item.category) as any}
          size={24}
          color="#1e3a8a"
        />
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.body} numberOfLines={2}>{item.body}</Text>
        <Text style={styles.time}>
          {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
        </Text>
      </View>
      {!item.is_read && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {data?.unread_count > 0 && (
        <TouchableOpacity
          style={styles.markAllButton}
          onPress={() => markAllAsRead.mutate()}
        >
          <Text style={styles.markAllText}>Mark all as read</Text>
        </TouchableOpacity>
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
            <Ionicons name="notifications-outline" size={48} color="#94a3b8" />
            <Text style={styles.emptyText}>No notifications yet</Text>
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
  markAllButton: {
    padding: 12,
    alignItems: 'flex-end',
  },
  markAllText: {
    color: '#1e3a8a',
    fontWeight: '500',
  },
  list: {
    padding: 16,
    paddingTop: 0,
  },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
  unread: {
    backgroundColor: '#eff6ff',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e0e7ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  body: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 4,
  },
  time: {
    fontSize: 12,
    color: '#94a3b8',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#1e3a8a',
  },
  emptyState: {
    alignItems: 'center',
    padding: 48,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 16,
    color: '#64748b',
  },
});
```

---

## 6. Navigation Setup

Navigation is handled by Expo Router with file-based routing:

```
mobile/app/
├── _layout.tsx           # Root layout with providers
├── (auth)/               # Auth group (not in tab bar)
│   ├── _layout.tsx       # Stack navigation
│   ├── login.tsx
│   ├── register.tsx
│   └── forgot-password.tsx
└── (tabs)/               # Tab group (main app)
    ├── _layout.tsx       # Tab navigation
    ├── index.tsx         # Dashboard (home tab)
    ├── tasks.tsx
    ├── policies.tsx
    ├── notifications.tsx
    └── settings.tsx
```

---

## 7. Connecting to Backend

### Using React Query with Supabase

```tsx
// In any component:
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/services/supabase';

// Fetch data
const { data, isLoading, error } = useQuery({
  queryKey: ['policies'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('policies')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },
});

// Mutate data
const mutation = useMutation({
  mutationFn: async (newTask) => {
    const { data, error } = await supabase
      .from('tasks')
      .insert(newTask)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
});
```

---

## 8. Push Notifications Setup

### iOS Setup

1. **Create Apple Push Notification Certificate**:
   - Go to https://developer.apple.com
   - Certificates, Identifiers & Profiles → Keys
   - Create a new key with "Apple Push Notifications service (APNs)"
   - Download the .p8 file

2. **Add to Expo**:
   ```bash
   eas credentials
   # Select iOS → Push Notifications → Upload APNs key
   ```

### Android Setup

1. **Create Firebase Project**:
   - Go to https://console.firebase.google.com
   - Create new project
   - Add Android app with your package name
   - Download `google-services.json`

2. **Place in project**:
   ```bash
   cp google-services.json mobile/google-services.json
   ```

---

## 9. Building for Production

### Development Build (for testing on device)

```bash
# Build for iOS
eas build --profile development --platform ios

# Build for Android
eas build --profile development --platform android
```

### Preview Build (for TestFlight/Internal testing)

```bash
# Build for both platforms
eas build --profile preview --platform all
```

### Production Build (for App Store/Play Store)

```bash
# Build for App Store
eas build --profile production --platform ios

# Build for Play Store
eas build --profile production --platform android
```

---

## 10. App Store Submission

### iOS (App Store Connect)

```bash
# Submit to App Store Connect
eas submit --platform ios

# Follow prompts to:
# 1. Select the build
# 2. Enter App Store Connect API Key (or login)
# 3. Submit for review
```

### Android (Play Store)

```bash
# Submit to Play Store
eas submit --platform android

# Follow prompts to:
# 1. Select the build
# 2. Enter service account JSON
# 3. Select track (internal/alpha/beta/production)
```

---

## 11. Troubleshooting

### Common Issues

**"Metro bundler failed to start"**
```bash
# Clear cache and restart
expo start --clear
```

**"Unable to resolve module"**
```bash
# Reinstall dependencies
rm -rf node_modules
npm install
```

**"Push notifications not working"**
- Ensure physical device (not simulator)
- Check Expo Go is up to date
- Verify push token is being registered

**"Build failed"**
```bash
# Check EAS logs
eas build:view

# Run diagnostics
npx expo-doctor
```

**"Supabase connection failed"**
- Check environment variables are set
- Verify `.env` file is in mobile directory
- Restart Metro bundler after env changes

---

## Quick Reference

```bash
# Start development
cd mobile && npm start

# Build for testing
eas build --profile development --platform all

# Build for production
eas build --profile production --platform all

# Submit to stores
eas submit --platform ios
eas submit --platform android

# View build status
eas build:list
```

---

*Guide created: December 27, 2025*
*For InsureFlow Mobile App v1.0.0*
