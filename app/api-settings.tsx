import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Colors } from '@/src/theme/colors';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { getSetting, setSetting } from '@/src/db/settings';

const API_URL_KEY = 'api_url';
const API_MODEL_KEY = 'api_model';
const API_KEY_STORE = 'api_key';

type TestResult = { kind: 'success' } | { kind: 'error'; reason: string; detail?: string };

export default function ApiSettingsScreen() {
  const [apiUrl, setApiUrl] = useState('https://api.deepseek.com');
  const [apiKey, setApiKey] = useState('');
  const [apiModel, setApiModel] = useState('deepseek-v4-pro');
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const url = await getSetting(API_URL_KEY);
      const model = await getSetting(API_MODEL_KEY);
      const key = await SecureStore.getItemAsync(API_KEY_STORE);
      if (url) setApiUrl(url);
      if (model) setApiModel(model);
      if (key) setApiKey(key);
    })();
  }, []);

  const handleUrlChange = async (value: string) => {
    setApiUrl(value);
    setUrlError(null);
    await setSetting(API_URL_KEY, value);
  };

  const handleUrlBlur = () => {
    const trimmed = apiUrl.trim();
    if (trimmed && !/^https?:\/\//i.test(trimmed)) {
      setUrlError('URL 必须以 http:// 或 https:// 开头');
    }
  };

  const handleModelChange = async (value: string) => {
    setApiModel(value);
    await setSetting(API_MODEL_KEY, value);
  };

  const handleKeyChange = async (value: string) => {
    setApiKey(value);
    await SecureStore.setItemAsync(API_KEY_STORE, value);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15_000);
      const response = await fetch(`${apiUrl.replace(/\/$/, '')}/models`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (response.ok) {
        setTestResult({ kind: 'success' });
      } else if (response.status === 401 || response.status === 403) {
        setTestResult({
          kind: 'error',
          reason: '认证失败 — API Key 无效或未授权',
          detail: `HTTP ${response.status}`,
        });
      } else {
        setTestResult({
          kind: 'error',
          reason: `请求失败 (HTTP ${response.status})`,
        });
      }
    } catch (err) {
      const e = err as Error;
      if (e.name === 'AbortError') {
        setTestResult({ kind: 'error', reason: '连接超时（15 秒）' });
      } else if (/network|fetch failed/i.test(e.message ?? '')) {
        setTestResult({
          kind: 'error',
          reason: '网络错误 — 检查地址与网络连接',
          detail: e.message,
        });
      } else {
        setTestResult({ kind: 'error', reason: '未知错误', detail: e.message });
      }
    } finally {
      setTesting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* API URL */}
          <Text style={styles.label}>API 地址</Text>
          <TextInput
            style={[styles.input, urlError && styles.inputError]}
            value={apiUrl}
            onChangeText={handleUrlChange}
            onBlur={handleUrlBlur}
            placeholder="https://api.deepseek.com"
            placeholderTextColor={Colors.secondary}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="url"
            keyboardType="url"
            textContentType="URL"
          />
          {urlError ? <Text style={styles.fieldError}>{urlError}</Text> : null}
          <Text style={styles.hint}>支持 OpenAI 兼容接口</Text>

          {/* API Key */}
          <Text style={[styles.label, { marginTop: 24 }]}>API Key</Text>
          <View style={styles.keyRow}>
            <TextInput
              style={[styles.input, styles.keyInput, styles.monoInput]}
              value={apiKey}
              onChangeText={handleKeyChange}
              placeholder="输入你的 API Key"
              placeholderTextColor={Colors.secondary}
              secureTextEntry={!showKey}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="password"
              textContentType="password"
            />
            <Pressable
              style={({ pressed }) => [
                styles.showKeyButton,
                pressed && { backgroundColor: Colors.pressedOverlay },
              ]}
              onPress={() => setShowKey(!showKey)}
            >
              <Text style={styles.showKeyText}>{showKey ? '隐藏' : '显示'}</Text>
            </Pressable>
          </View>
          <Text style={styles.hint}>密钥仅存储在本地设备</Text>

          {/* Model */}
          <Text style={[styles.label, { marginTop: 24 }]}>模型名称</Text>
          <TextInput
            style={[styles.input, styles.monoInput]}
            value={apiModel}
            onChangeText={handleModelChange}
            placeholder="deepseek-v4-pro"
            placeholderTextColor={Colors.secondary}
            autoCapitalize="none"
            autoCorrect={false}
          />

          {/* Test connection */}
          <Pressable
            style={({ pressed }) => [
              styles.testButton,
              (testing || !apiKey) && styles.testButtonDisabled,
              pressed && !testing && apiKey && { backgroundColor: Colors.pressedOverlay },
            ]}
            onPress={handleTestConnection}
            disabled={testing || !apiKey}
          >
            {testing ? (
              <ActivityIndicator size="small" color={Colors.secondary} />
            ) : (
              <Text style={[
                styles.testButtonText,
                !apiKey && styles.testButtonTextDisabled,
              ]}>
                测试连接
              </Text>
            )}
          </Pressable>

          {testResult?.kind === 'success' && (
            <Text style={styles.resultSuccess}>连接成功 ✓</Text>
          )}
          {testResult?.kind === 'error' && (
            <View style={styles.errorBlock}>
              <Text style={styles.resultError}>{testResult.reason}</Text>
              {testResult.detail ? (
                <Text style={styles.resultDetail}>{testResult.detail}</Text>
              ) : null}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.mainBg,
  },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 80 },
  label: {
    fontSize: 14,
    color: Colors.bodyText,
    marginBottom: 8,
  },
  input: {
    fontSize: 15,
    color: Colors.bodyText,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    paddingVertical: 8,
  },
  inputError: {
    borderBottomColor: Colors.destructive,
  },
  fieldError: {
    fontSize: 12,
    color: Colors.destructive,
    marginTop: 4,
  },
  // 等宽字体适合显示 API key / 模型名（不强制 iOS 才有 monospace）
  monoInput: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  keyRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  keyInput: {
    flex: 1,
  },
  showKeyButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: 8,
    marginLeft: 4,
  },
  showKeyText: {
    fontSize: 13,
    color: Colors.secondary,
  },
  hint: {
    fontSize: 12,
    color: Colors.secondary,
    marginTop: 4,
  },
  testButton: {
    marginTop: 32,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
    borderRadius: 8,
  },
  testButtonDisabled: {
    opacity: 0.4,
  },
  testButtonText: {
    fontSize: 15,
    color: Colors.bodyText,
  },
  testButtonTextDisabled: {
    color: Colors.secondary,
  },
  resultSuccess: {
    marginTop: 12,
    fontSize: 13,
    color: Colors.success,
    textAlign: 'center',
  },
  errorBlock: {
    marginTop: 12,
    alignItems: 'center',
  },
  resultError: {
    fontSize: 13,
    color: Colors.destructive,
    textAlign: 'center',
  },
  resultDetail: {
    fontSize: 11,
    color: Colors.secondary,
    textAlign: 'center',
    marginTop: 4,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
});
