const PREVIEW_LIMIT = 800;

type DebugData = Record<string, unknown>;

function sanitize(value: unknown): unknown {
  if (typeof value === 'string') {
    if (value.length <= PREVIEW_LIMIT) return value;
    return `${value.slice(0, PREVIEW_LIMIT)}... [truncated ${value.length - PREVIEW_LIMIT} chars]`;
  }
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        /api.?key|authorization|token|secret/i.test(key) ? '[redacted]' : sanitize(item),
      ]),
    );
  }
  return value;
}

function write(level: 'debug' | 'warn' | 'error', event: string, data?: DebugData) {
  const payload = data ? sanitize(data) : undefined;
  const prefix = `[LocalGeneration][${event}]`;
  if (level === 'error') {
    console.error(prefix, payload ?? '');
  } else if (level === 'warn') {
    console.warn(prefix, payload ?? '');
  } else {
    console.debug(prefix, payload ?? '');
  }
}

export const generationLog = {
  debug: (event: string, data?: DebugData) => write('debug', event, data),
  warn: (event: string, data?: DebugData) => write('warn', event, data),
  error: (event: string, data?: DebugData) => write('error', event, data),
};

export function textStats(text: string) {
  return {
    chars: text.length,
    lines: text.split(/\r?\n/).length,
    preview: text,
  };
}

export function messageStats(messages: Array<{ role: string; content: string }>) {
  return {
    count: messages.length,
    totalChars: messages.reduce((sum, message) => sum + message.content.length, 0),
    byRole: messages.map((message, index) => ({
      index,
      role: message.role,
      chars: message.content.length,
      preview: message.content,
    })),
  };
}
