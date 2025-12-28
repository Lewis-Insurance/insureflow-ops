import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase, getCurrentUser, getSession } from '../../src/services/supabase';
import { unregisterDevice } from '../../src/services/pushNotifications';
import { clearAllCache, clearOfflineQueue } from '../../src/services/offlineSync';

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: string | null;
}

export default function SettingsScreen() {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['user-profile'],
    queryFn: async () => {
      const session = await getSession();
      if (!session?.user?.id) return null;

      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, role')
        .eq('id', session.user.id)
        .single();

      if (error) {
        console.error('Error fetching profile:', error);
        return null;
      }

      return data as UserProfile;
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await unregisterDevice();
      await clearAllCache();
      await clearOfflineQueue();
      await supabase.auth.signOut();
    },
    onSuccess: () => {
      router.replace('/(auth)/login');
    },
    onError: (error) => {
      Alert.alert('Error', 'Failed to sign out. Please try again.');
      console.error('Logout error:', error);
    },
  });

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: () => logoutMutation.mutate(),
        },
      ]
    );
  };

  const handleClearCache = () => {
    Alert.alert(
      'Clear Cache',
      'This will clear all locally cached data. You may need to reload data when online.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          onPress: async () => {
            await clearAllCache();
            Alert.alert('Success', 'Cache cleared successfully');
          },
        },
      ]
    );
  };

  const SettingsSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );

  const SettingsRow = ({
    icon,
    iconColor = '#64748b',
    label,
    value,
    onPress,
    isSwitch,
    switchValue,
    onSwitchChange,
    danger,
  }: {
    icon: string;
    iconColor?: string;
    label: string;
    value?: string;
    onPress?: () => void;
    isSwitch?: boolean;
    switchValue?: boolean;
    onSwitchChange?: (value: boolean) => void;
    danger?: boolean;
  }) => (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      disabled={isSwitch}
      activeOpacity={onPress ? 0.6 : 1}
    >
      <View style={[styles.iconWrapper, { backgroundColor: iconColor + '20' }]}>
        <Ionicons name={icon as any} size={20} color={iconColor} />
      </View>
      <View style={styles.rowContent}>
        <Text style={[styles.rowLabel, danger && styles.dangerText]}>{label}</Text>
        {value && <Text style={styles.rowValue}>{value}</Text>}
      </View>
      {isSwitch ? (
        <Switch
          value={switchValue}
          onValueChange={onSwitchChange}
          trackColor={{ false: '#e2e8f0', true: '#1e3a8a' }}
          thumbColor="#fff"
        />
      ) : onPress ? (
        <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
      ) : null}
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.container}>
      {/* Profile Section */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.full_name?.charAt(0) || user?.email?.charAt(0) || 'U'}
          </Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>
            {user?.full_name || 'User'}
          </Text>
          <Text style={styles.profileEmail}>{user?.email}</Text>
          {user?.role && (
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>{user.role}</Text>
            </View>
          )}
        </View>
      </View>

      <SettingsSection title="Preferences">
        <SettingsRow
          icon="notifications"
          iconColor="#3b82f6"
          label="Push Notifications"
          isSwitch
          switchValue={notificationsEnabled}
          onSwitchChange={setNotificationsEnabled}
        />
        <SettingsRow
          icon="moon"
          iconColor="#8b5cf6"
          label="Dark Mode"
          isSwitch
          switchValue={darkMode}
          onSwitchChange={setDarkMode}
        />
      </SettingsSection>

      <SettingsSection title="Data & Storage">
        <SettingsRow
          icon="cloud-offline"
          iconColor="#f97316"
          label="Clear Cache"
          onPress={handleClearCache}
        />
        <SettingsRow
          icon="sync"
          iconColor="#22c55e"
          label="Sync Status"
          value="All synced"
        />
      </SettingsSection>

      <SettingsSection title="Support">
        <SettingsRow
          icon="help-circle"
          iconColor="#06b6d4"
          label="Help & Support"
          onPress={() => {}}
        />
        <SettingsRow
          icon="document-text"
          iconColor="#64748b"
          label="Terms of Service"
          onPress={() => {}}
        />
        <SettingsRow
          icon="shield-checkmark"
          iconColor="#22c55e"
          label="Privacy Policy"
          onPress={() => {}}
        />
      </SettingsSection>

      <SettingsSection title="About">
        <SettingsRow
          icon="information-circle"
          iconColor="#3b82f6"
          label="Version"
          value="1.0.0"
        />
      </SettingsSection>

      {/* Logout Button */}
      <TouchableOpacity
        style={styles.logoutButton}
        onPress={handleLogout}
        disabled={logoutMutation.isPending}
      >
        <Ionicons name="log-out" size={20} color="#dc2626" />
        <Text style={styles.logoutText}>
          {logoutMutation.isPending ? 'Signing out...' : 'Sign Out'}
        </Text>
      </TouchableOpacity>

      <View style={styles.footer}>
        <Text style={styles.footerText}>InsureFlow Mobile</Text>
        <Text style={styles.footerSubtext}>Made with care for insurance professionals</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 16,
    padding: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#1e3a8a',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  avatarText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 8,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#e0e7ff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roleText: {
    fontSize: 12,
    color: '#4f46e5',
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: 16,
    marginBottom: 8,
  },
  sectionContent: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  iconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rowContent: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 15,
    color: '#1e293b',
    fontWeight: '500',
  },
  rowValue: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
  },
  dangerText: {
    color: '#dc2626',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fef2f2',
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  logoutText: {
    color: '#dc2626',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    padding: 32,
    paddingBottom: 48,
  },
  footerText: {
    fontSize: 14,
    color: '#94a3b8',
    fontWeight: '500',
  },
  footerSubtext: {
    fontSize: 12,
    color: '#cbd5e1',
    marginTop: 4,
  },
});
