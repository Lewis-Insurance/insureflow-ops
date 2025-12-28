import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useColorScheme } from 'react-native';
import { Session } from '@supabase/supabase-js';
import {
  registerDeviceForPush,
  setupNotificationListeners
} from '../src/services/pushNotifications';
import { initNetworkListener } from '../src/services/offlineSync';
import { supabase } from '../src/services/supabase';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      gcTime: 1000 * 60 * 5, // 5 minutes (formerly cacheTime)
    },
  },
});

function useProtectedRoute(session: Session | null) {
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      // Redirect to login if not authenticated
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      // Redirect to main app if authenticated
      router.replace('/(tabs)');
    }
  }, [session, segments]);
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useProtectedRoute(session);

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        registerDeviceForPush();
      }
    });

    // Initialize network listener for offline sync
    const unsubscribeNetwork = initNetworkListener();

    // Setup push notification listeners
    const unsubscribePush = setupNotificationListeners(
      (notification) => {
        console.log('Notification received:', notification);
      },
      (response) => {
        console.log('Notification tapped:', response);
        // Handle deep linking here based on notification data
        const data = response.notification.request.content.data;
        if (data?.type === 'task' && data?.task_id) {
          // Navigate to task detail
        }
      }
    );

    return () => {
      subscription.unsubscribe();
      unsubscribeNetwork();
      unsubscribePush();
    };
  }, []);

  if (isLoading) {
    return null; // Or a splash screen
  }

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
