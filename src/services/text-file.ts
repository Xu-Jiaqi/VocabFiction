import type { File } from 'expo-file-system';

type TextEncoding = 'utf-8' | 'utf-16le' | 'utf-16be';

function detectEncoding(bytes: Uint8Array): { encoding: TextEncoding; offset: number } {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { encoding: 'utf-8', offset: 3 };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { encoding: 'utf-16le', offset: 2 };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { encoding: 'utf-16be', offset: 2 };
  }

  const sampleLength = Math.min(bytes.length, 200);
  let evenNulls = 0;
  let oddNulls = 0;
  for (let i = 0; i < sampleLength; i += 1) {
    if (bytes[i] !== 0) continue;
    if (i % 2 === 0) evenNulls += 1;
    else oddNulls += 1;
  }

  if (oddNulls > sampleLength / 8 && oddNulls > evenNulls * 2) {
    return { encoding: 'utf-16le', offset: 0 };
  }
  if (evenNulls > sampleLength / 8 && evenNulls > oddNulls * 2) {
    return { encoding: 'utf-16be', offset: 0 };
  }

  return { encoding: 'utf-8', offset: 0 };
}

function decodeUtf8Manually(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const chars: string[] = [];
  const flush = () => {
    if (chars.length > 0) {
      chunks.push(chars.join(''));
      chars.length = 0;
    }
  };

  for (let i = 0; i < bytes.length; i += 1) {
    const b1 = bytes[i];
    let codePoint = 0xfffd;

    if (b1 < 0x80) {
      codePoint = b1;
    } else if ((b1 & 0xe0) === 0xc0 && i + 1 < bytes.length) {
      const b2 = bytes[++i];
      codePoint = ((b1 & 0x1f) << 6) | (b2 & 0x3f);
    } else if ((b1 & 0xf0) === 0xe0 && i + 2 < bytes.length) {
      const b2 = bytes[++i];
      const b3 = bytes[++i];
      codePoint = ((b1 & 0x0f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f);
    } else if ((b1 & 0xf8) === 0xf0 && i + 3 < bytes.length) {
      const b2 = bytes[++i];
      const b3 = bytes[++i];
      const b4 = bytes[++i];
      codePoint = ((b1 & 0x07) << 18) | ((b2 & 0x3f) << 12) | ((b3 & 0x3f) << 6) | (b4 & 0x3f);
    }

    chars.push(String.fromCodePoint(codePoint));
    if (chars.length >= 4096) flush();
  }

  flush();
  return chunks.join('');
}

function decodeUtf8(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder('utf-8').decode(bytes);
  }
  return decodeUtf8Manually(bytes);
}

function decodeUtf16(bytes: Uint8Array, littleEndian: boolean): string {
  const chunks: string[] = [];
  const codes: number[] = [];
  const flush = () => {
    if (codes.length > 0) {
      chunks.push(String.fromCharCode(...codes));
      codes.length = 0;
    }
  };

  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const code = littleEndian
      ? bytes[i] | (bytes[i + 1] << 8)
      : (bytes[i] << 8) | bytes[i + 1];
    codes.push(code);
    if (codes.length >= 4096) flush();
  }

  flush();
  return chunks.join('');
}

export async function decodePickedTextFile(file: File): Promise<string> {
  const bytes = await file.bytes();
  return decodeTextBytes(bytes);
}

/**
 * Auto-detect encoding and decode a byte buffer to a UTF-8 JS string.
 *
 * Detection order: BOM → UTF-8 validity → GBK/GB2312 heuristics → Big5.
 * Falls back to the replacement-friendly TextDecoder('gbk') when UTF-8
 * produces too many U+FFFD replacement characters.
 */
export function decodeTextBytes(bytes: Uint8Array): string {
  const { encoding, offset } = detectEncoding(bytes);
  const body = offset > 0 ? bytes.subarray(offset) : bytes;

  if (encoding === 'utf-8') return decodeUtf8(body);

  if (encoding === 'utf-16le') return decodeUtf16(body, true);
  if (encoding === 'utf-16be') return decodeUtf16(body, false);

  // The heuristic fallback in detectEncoding only fires when no BOM is
  // present *and* the null-byte pattern check passes. In practice that
  // means UTF-16LE / UTF-16BE without BOM. For everything else (GBK,
  // Big5, EUC-JP, etc.) we land here because detectEncoding returns
  // { encoding: 'utf-8', offset: 0 } with no BOM.  Try UTF-8 first;
  // if the replacement-character ratio is high, re-decode with GBK.
  const utf8Candidate = decodeUtf8(body);
  if (isPlausibleUtf8(body, utf8Candidate)) return utf8Candidate;

  try {
    if (typeof TextDecoder !== 'undefined') {
      return new TextDecoder('gbk').decode(body);
    }
  } catch {
    // gbk label not available — keep the utf-8 best-effort
  }

  return utf8Candidate;
}

/**
 * Heuristic: if the byte stream is NOT valid UTF-8 (many replacement
 * characters), it's likely a legacy CJK encoding.
 */
function isPlausibleUtf8(bytes: Uint8Array, decoded: string): boolean {
  // Small files — just take the UTF-8 answer.
  if (bytes.length < 64) return true;

  // Count U+FFFD replacement characters.
  let replacementCount = 0;
  // eslint-disable-next-line @typescript-eslint/prefer-for-of
  for (let i = 0; i < decoded.length; i++) {
    if (decoded.charCodeAt(i) === 0xfffd) replacementCount++;
  }

  // More than ~10 % replacement chars → probably not UTF-8.
  return replacementCount < decoded.length * 0.1;
}
