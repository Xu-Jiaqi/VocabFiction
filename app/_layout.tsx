import { useEffect, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Colors } from '@/src/theme/colors';
import { Ionicons } from '@expo/vector-icons';
import { initDatabase } from '@/src/db/init';

export default function RootLayout() {
  const router = useRouter();
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
            headerRight: () => (
              <TouchableOpacity
                onPress={() => router.push('/settings')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ padding: 4 }}
              >
                <Ionicons name="settings-outline" size={22} color={Colors.secondary} />
              </TouchableOpacity>
            ),
          }}
        />
        <Stack.Screen
          name="reader/[workId]"
          options={{ headerShown: false }}
        />
        <Stack.Screen name="upload/novel" options={{ title: '上传小说' }} />
        <Stack.Screen name="upload/wordlist" options={{ title: '上传词表' }} />
        <Stack.Screen name="work/[workId]/manage" options={{ title: '管理作品' }} />
        <Stack.Screen
          name="settings"
          options={{ title: '设置', presentation: 'modal' }}
        />
        <Stack.Screen name="api-settings" options={{ title: 'API 设置' }} />
        <Stack.Screen name="settings/word-lists" options={{ title: '词表管理' }} />
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