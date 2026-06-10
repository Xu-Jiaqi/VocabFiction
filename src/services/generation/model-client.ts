import * as SecureStore from 'expo-secure-store';
import { getSetting } from '@/src/db/settings';
import { generationLog, messageStats, textStats } from './debug-log';

const API_URL_KEY = 'api_url';
const API_MODEL_KEY = 'api_model';
const API_KEY_STORE = 'api_key';

const DEFAULT_API_URL = 'https://api.deepseek.com';
const DEFAULT_MODEL = 'deepseek-v4-pro';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export class ModelApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ModelApiError';
    this.status = status;
  }
}

async function getModelConfig(): Promise<{
  baseUrl: string;
  model: string;
  apiKey: string;
}> {
  const [storedUrl, storedModel, apiKey] = await Promise.all([
    getSetting(API_URL_KEY),
    getSetting(API_MODEL_KEY),
    SecureStore.getItemAsync(API_KEY_STORE),
  ]);

  return {
    baseUrl: (storedUrl || DEFAULT_API_URL).trim().replace(/\/+$/, ''),
    model: (storedModel || DEFAULT_MODEL).trim(),
    apiKey: apiKey || '',
  };
}

function extractJsonObject(raw: string, requestId: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch (directError) {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      try {
        return JSON.parse(fenced[1].trim());
      } catch (fencedError) {
        generationLog.error('model.json_parse_failed.fenced', {
          requestId,
          error: (fencedError as Error).message,
          raw: textStats(raw),
        });
        throw fencedError;
      }
    }

    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const sliced = trimmed.slice(start, end + 1);
      try {
        return JSON.parse(sliced);
      } catch (slicedError) {
        generationLog.error('model.json_parse_failed.sliced', {
          requestId,
          error: (slicedError as Error).message,
          raw: textStats(raw),
          sliced: textStats(sliced),
        });
        throw slicedError;
      }
    }
    generationLog.error('model.json_missing', {
      requestId,
      error: (directError as Error).message,
      raw: textStats(raw),
    });
    throw new Error('Model response did not contain valid JSON');
  }
}

async function parseError(response: Response): Promise<string> {
  const raw = await response.text();
  if (!raw) return `HTTP ${response.status}`;

  try {
    const data = JSON.parse(raw) as {
      error?: { message?: string };
      message?: string;
      detail?: string;
    };
    return data.error?.message || data.message || data.detail || raw;
  } catch {
    return raw;
  }
}

export async function chatJson<T>(
  messages: ChatMessage[],
  options: { maxTokens?: number; temperature?: number; timeoutMs?: number } = {},
): Promise<T> {
  const requestId = `chat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const { baseUrl, model, apiKey } = await getModelConfig();
  if (!apiKey) {
    throw new ModelApiError('请先在 API 设置中填写模型 API Key');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 120_000,
  );

  try {
    generationLog.debug('model.request.start', {
      requestId,
      baseUrl,
      model,
      maxTokens: options.maxTokens,
      temperature: options.temperature ?? 0.4,
      timeoutMs: options.timeoutMs ?? 120_000,
      messages: messageStats(messages),
    });

    const request = (useJsonMode: boolean) => fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature ?? 0.4,
        max_tokens: options.maxTokens,
        ...(useJsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: controller.signal,
    });

    let response = await request(true);
    generationLog.debug('model.response.http', {
      requestId,
      jsonMode: true,
      status: response.status,
      ok: response.ok,
    });
    if (response.status === 400) {
      const detail = await parseError(response);
      if (/response_format|json_object|json mode/i.test(detail)) {
        generationLog.warn('model.json_mode_fallback', {
          requestId,
          status: response.status,
          detail,
        });
        response = await request(false);
        generationLog.debug('model.response.http', {
          requestId,
          jsonMode: false,
          status: response.status,
          ok: response.ok,
        });
      } else {
        generationLog.error('model.response.error', {
          requestId,
          status: response.status,
          detail,
        });
        throw new ModelApiError(detail, response.status);
      }
    }

    if (!response.ok) {
      const detail = await parseError(response);
      generationLog.error('model.response.error', {
        requestId,
        status: response.status,
        detail,
      });
      throw new ModelApiError(detail, response.status);
    }

    const data = await response.json() as {
      choices?: Array<{
        finish_reason?: string | null;
        message?: { content?: string | null };
      }>;
      usage?: unknown;
      model?: string;
      id?: string;
    };
    const choice = data.choices?.[0];
    generationLog.debug('model.response.body', {
      requestId,
      responseId: data.id,
      responseModel: data.model,
      choiceCount: data.choices?.length ?? 0,
      finishReason: choice?.finish_reason,
      usage: data.usage,
      content: textStats(choice?.message?.content ?? ''),
    });

    if (choice?.finish_reason === 'length') {
      generationLog.warn('model.response.truncated', {
        requestId,
        maxTokens: options.maxTokens,
        content: textStats(choice.message?.content ?? ''),
        usage: data.usage,
      });
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      generationLog.error('model.response.empty_content', {
        requestId,
        choiceCount: data.choices?.length ?? 0,
        firstChoice: choice,
        usage: data.usage,
      });
      throw new ModelApiError('模型没有返回内容');
    }

    return extractJsonObject(content, requestId) as T;
  } catch (err) {
    if (err instanceof ModelApiError) throw err;
    const e = err as Error;
    if (e.name === 'AbortError') {
      generationLog.error('model.request.timeout', { requestId });
      throw new ModelApiError('模型请求超时');
    }
    generationLog.error('model.request.failed', {
      requestId,
      name: e.name,
      message: e.message,
    });
    throw new ModelApiError(`模型请求失败：${e.message}`);
  } finally {
    clearTimeout(timeoutId);
  }
}
