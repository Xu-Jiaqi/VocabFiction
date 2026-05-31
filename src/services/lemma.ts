/**
 * Parse ECDICT exchange field to extract the lemma (base form).
 *
 * Exchange format: <type>:<form>/<type>:<form>/...
 * Type codes:
 *   0: lemma (base form)
 *   p: past tense
 *   d: past participle
 *   i: present participle / -ing form
 *   s: plural / 3rd person singular
 *   3: 3rd person singular present
 *   1: inflection type marker for the current entry
 *
 * Examples:
 *   "0:go/1:p"         → lemma "go" (current word is past tense)
 *   "0:consume/1:i/s:consumings" → lemma "consume"
 *   "s:episodes"       → no 0: prefix, so no lemma override
 *   "" (empty)         → no lemma override
 */
export function extractLemma(exchange: string): string | null {
  if (!exchange) return null;

  const parts = exchange.split('/');
  for (const part of parts) {
    const [type, ...formParts] = part.split(':');
    const form = formParts.join(':'); // handle cases like "0:go:extra" (just in case)
    if (type === '0' && form) {
      // Strip leading apostrophe (ECDICT uses ' to mark abbreviations, e.g. 'cept → cept)
      return form.replace(/^'+/, '').toLowerCase();
    }
  }

  return null;
}

/**
 * Get the lemma for a word from ECDICT.
 * If the word itself is the base form (no exchange or no 0:), returns the word itself.
 */
export function getLemma(word: string, exchange: string): string {
  const lemma = extractLemma(exchange);
  return lemma ?? word.toLowerCase();
}
