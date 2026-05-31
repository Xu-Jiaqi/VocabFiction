import { useEffect, useState } from 'react';
import { Stack, Link } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '@/src/theme/colors';
import { initDatabase } from '@/src/db/init';

export default function RootLayout() {
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    initDatabase()
      .then(() => setDbReady(true))
      .catch((err) => {
        console.error('[App] DB init failed:', err);
        setDbError(err.message ?? 'Database init failed');
      });
  }, []);

  if (dbError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>启动失败</Text>
        <Text style={styles.errorDetail}>{dbError}</Text>
      </View>
    );
  }

  if (!dbReady) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="small" color={Colors.secondary} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: Colors.mainBg },
          headerTintColor: Colors.bodyText,
          headerTitleStyle: {
            fontFamily: 'System',
            fontWeight: '500',
            fontSize: 16,
          },
          contentStyle: { backgroundColor: Colors.mainBg },
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            title: 'VocabFiction',
            headerTitleStyle: { fontSize: 14, color: Colors.secondary },
            headerRight: () => (
              <Link href="/settings" style={{ paddingHorizontal: 8 }}>
                <Text style={{ fontSize: 14, color: Colors.secondary }}>⚙</Text>
              </Link>
            ),
          }}
        />
        <Stack.Screen
          name="reader/[workId]"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="upload"
          options={{ title: '上传作品' }}
        />
        <Stack.Screen
          name="settings"
          options={{ title: '设置', presentation: 'modal' }}
        />
        <Stack.Screen
          name="api-settings"
          options={{ title: 'API 设置' }}
        />
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.mainBg,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: Colors.secondary,
  },
  errorText: {
    fontSize: 16,
    color: Colors.bodyText,
  },
  errorDetail: {
    marginTop: 8,
    fontSize: 12,
    color: Colors.secondary,
    paddingHorizontal: 32,
    textAlign: 'center',
  },
});
