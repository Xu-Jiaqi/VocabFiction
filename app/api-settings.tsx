import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Colors } from '@/src/theme/colors';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { getSetting, setSetting } from '@/src/db/settings';

const API_URL_KEY = 'api_url';
const API_MODEL_KEY = 'api_model';
const API_KEY_STORE = 'api_key';

export default function ApiSettingsScreen() {
  const [apiUrl, setApiUrl] = useState('https://api.deepseek.com');
  const [apiKey, setApiKey] = useState('');
  const [apiModel, setApiModel] = useState('deepseek-v4-pro');
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

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
    await setSetting(API_URL_KEY, value);
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
      const response = await fetch(`${apiUrl}/models`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });
      if (response.ok) {
        setTestResult('success');
      } else {
        setTestResult('error');
      }
    } catch {
      setTestResult('error');
    } finally {
      setTesting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* API URL */}
        <Text style={styles.label}>API 地址</Text>
        <TextInput
          style={styles.input}
          value={apiUrl}
          onChangeText={handleUrlChange}
          placeholder="https://api.deepseek.com"
          placeholderTextColor={Colors.secondary}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.hint}>支持 OpenAI 兼容接口</Text>

        {/* API Key */}
        <Text style={[styles.label, { marginTop: 24 }]}>API Key</Text>
        <View style={styles.keyRow}>
          <TextInput
            style={[styles.input, styles.keyInput]}
            value={apiKey}
            onChangeText={handleKeyChange}
            placeholder="输入你的 API Key"
            placeholderTextColor={Colors.secondary}
            secureTextEntry={!showKey}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={styles.showKeyButton}
            onPress={() => setShowKey(!showKey)}
          >
            <Text style={styles.showKeyText}>{showKey ? '隐藏' : '显示'}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.hint}>密钥仅存储在本地设备</Text>

        {/* Model */}
        <Text style={[styles.label, { marginTop: 24 }]}>模型名称</Text>
        <TextInput
          style={styles.input}
          value={apiModel}
          onChangeText={handleModelChange}
          placeholder="deepseek-v4-pro"
          placeholderTextColor={Colors.secondary}
          autoCapitalize="none"
          autoCorrect={false}
        />

        {/* Test connection */}
        <TouchableOpacity
          style={styles.testButton}
          onPress={handleTestConnection}
          disabled={testing || !apiKey}
        >
          {testing ? (
            <ActivityIndicator size="small" color={Colors.secondary} />
          ) : (
            <Text style={[styles.testButtonText, !apiKey && styles.testButtonDisabled]}>
              测试连接
            </Text>
          )}
        </TouchableOpacity>

        {testResult === 'success' && (
          <Text style={styles.resultSuccess}>连接成功 ✓</Text>
        )}
        {testResult === 'error' && (
          <Text style={styles.resultError}>连接失败，请检查 API 地址和密钥</Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.mainBg,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
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
  keyRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  keyInput: {
    flex: 1,
  },
  showKeyButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
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
    paddingVertical: 12,
    alignItems: 'center',
  },
  testButtonText: {
    fontSize: 15,
    color: Colors.bodyText,
  },
  testButtonDisabled: {
    color: Colors.divider,
  },
  resultSuccess: {
    marginTop: 12,
    fontSize: 13,
    color: '#4A8C5C',
    textAlign: 'center',
  },
  resultError: {
    marginTop: 12,
    fontSize: 13,
    color: '#B84444',
    textAlign: 'center',
  },
});
