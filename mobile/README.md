# InsureFlow Mobile App

React Native mobile app for InsureFlow, built with Expo.

## Features

- **Push Notifications**: Real-time notifications for tasks, renewals, leads, and messages
- **Offline-First**: Full functionality while offline with automatic sync when back online
- **Secure Storage**: Credentials stored using device secure storage (Keychain/Keystore)
- **Deep Linking**: Direct navigation from notifications to relevant screens

## Setup

### Prerequisites

- Node.js 18+
- Expo CLI: `npm install -g expo-cli`
- EAS CLI: `npm install -g eas-cli`
- Expo Go app on your device (for development)

### Installation

```bash
cd mobile
npm install
```

### Environment Variables

Create a `.env` file:

```env
EXPO_PUBLIC_SUPABASE_URL=https://lrqajzwcmdwahnjyidgv.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

### Development

```bash
# Start development server
npm start

# iOS
npm run ios

# Android
npm run android
```

## Project Structure

```
mobile/
├── app/                    # Expo Router screens
│   ├── (auth)/            # Authentication screens
│   ├── (tabs)/            # Main tab navigation
│   └── _layout.tsx        # Root layout
├── src/
│   ├── components/        # Reusable components
│   ├── hooks/             # Custom React hooks
│   ├── services/          # API and device services
│   │   ├── supabase.ts    # Supabase client
│   │   ├── pushNotifications.ts
│   │   └── offlineSync.ts
│   ├── types/             # TypeScript types
│   └── utils/             # Utility functions
├── assets/                # Images, fonts, sounds
├── app.json               # Expo configuration
└── package.json
```

## Building for Production

### iOS

```bash
# Configure EAS
eas build:configure

# Build for App Store
npm run build:ios

# Submit to App Store
npm run submit:ios
```

### Android

```bash
# Build for Play Store
npm run build:android

# Submit to Play Store
npm run submit:android
```

## Push Notifications

The app uses Expo Push Notifications with our `push-notifications` edge function:

1. Device registers on app launch
2. Backend queues notifications via `queue_push_notification()` function
3. Edge function processes queue and sends to Expo Push API
4. Notifications delivered to device

### Notification Categories

- `task`: Task assignments and reminders
- `lead`: New leads and lead updates
- `policy`: Policy changes and issues
- `renewal`: Upcoming renewals
- `document`: Document requests and uploads
- `message`: Client communications
- `goal`: Goal progress and achievements
- `system`: System notifications

## Offline Support

The app works fully offline:

1. Data cached locally using AsyncStorage
2. Changes queued in `offline_sync_queue`
3. Automatic sync when connectivity restored
4. Conflict resolution (server-wins by default)

### Tables Synced Offline

- Tasks
- Notifications
- Policies (read-only)
- Accounts (read-only)

## Security

- JWT tokens stored in device Keychain (iOS) / Keystore (Android)
- Automatic token refresh
- Secure WebSocket connections
- Certificate pinning (production)
