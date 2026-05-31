# Chat Fiction JSON Format Spec (v3)

The machine-readable format consumed by the app.

## Top-level Structure

```json
{
  "meta": { ... },
  "messages": [ ... ],
  "vocab": [ ... ]
}
```

## meta

| Field   | Type   | Description          |
| ------- | ------ | -------------------- |
| `ep`    | number | Episode number       |
| `title` | string | Episode title        |
| `kind`  | string | `"main"` or `"side"` |

Example:

```json
{
  "ep": 3,
  "title": "The Glass",
  "kind": "main"
}
```

## messages

An array of message objects. Each message has a `type` field.

### narration

Covers everything that is not spoken dialogue: action, description, internal thoughts. Rendered center-aligned, muted style.

```json
{
  "type": "narration",
  "text": "Footsteps approach. A shadow falls across my table.",
  "marks": [
    { "word": "footstep", "index": 0, "definition": "脚步", "is_new": true }
  ]
}
```

### dialogue

Spoken dialogue. `"right"` = protagonist side (right bubble, avatar + name). `"left"` = other characters (left bubble, avatar + name).

```json
{
  "type": "dialogue",
  "side": "left",
  "name": "Anna",
  "text": "Hey.",
  "marks": []
}
```

| Field   | Type   | Description                                |
| ------- | ------ | ------------------------------------------ |
| `side`  | string | `"left"` or `"right"`                      |
| `name`  | string | Character name                             |
| `text`  | string | The spoken line                            |
| `marks` | array  | Vocab marks in this message (can be empty) |

## marks

Each message has a `marks` array. Each mark anchors a vocabulary word to its exact position in the message text.

| Field        | Type    | Description                                                                  |
| ------------ | ------- | ---------------------------------------------------------------------------- |
| `word`       | string  | The word as it appears in `text`                                             |
| `index`      | number  | 0-based word position in `text` (split by whitespace)                        |
| `definition` | string  | Chinese definition matching the word's meaning here                          |
| `is_new`     | boolean | `true` = first occurrence of this (word, definition) pair in the entire work |

### Semantics

- Tracking is per **(word, definition) pair**, not per word alone. `bank=河岸` and `bank=银行` are two separate learning items, each with its own `is_new` lifecycle.
- `is_new: true` → definition shown inline after the word, in gray: **bank**（银行）
- `is_new: false` → word bolded only, no definition shown. Tappable to reveal.
- A word can appear multiple times in one message — each occurrence gets its own mark with the correct `index`.
- If a message has no vocab words, `marks` is an empty array `[]`.

### Same word, different senses — same message

When a word appears twice in one sentence with two different meanings, each gets its own mark:

```json
{
  "type": "narration",
  "text": "The bank said the bank of the river was eroding.",
  "marks": [
    { "word": "bank", "index": 1, "definition": "银行", "is_new": true },
    { "word": "bank", "index": 4, "definition": "河岸", "is_new": true }
  ]
}
```

Word indices (0-based):

```
The(0) bank(1) said(2) the(3) bank(4) of(5) the(6) river(7) was(8) eroding.(9)
```

Rendering: both show inline definitions since both are `is_new: true`:

> The **bank**（银行） said the **bank**（河岸） of the river was eroding.

### Same word, same sense — multiple occurrences

When the same (word, definition) pair reappears later:

```json
// Ep.1 — first occurrence
{ "word": "bank", "index": 3, "definition": "河岸", "is_new": true }

// Ep.3 — review occurrence
{ "word": "bank", "index": 7, "definition": "河岸", "is_new": false }
```

First time: **bank**（河岸）. Review: **bank** (bold only, tappable).

## Word form matching (lemmatization)

The same word may appear in different inflected forms across episodes: `consume`, `consumed`, `consuming`. These are treated as **the same vocabulary item** and share a single learning record.

- **Approach**: Lemmatization — reduce each inflected form to its dictionary base form (lemma).
- **When**: During LLM generation. The generation pipeline normalizes all target words to lemma form, ensuring `consumed` and `consuming` both map to `consume`.
- **`word` field**: Contains the **surface form** — the word as it actually appears in the message text. This is what the user sees and what gets bolded.
- **Tracking**: Client maintains a lemma → {surface forms} mapping. The learning state (is_new, M counter) is per **lemma**, not per surface form. When the client encounters `consumed` in a message, it looks up the lemma `consume` to determine is_new and M count.
- **Dictionary lookup**: When a user taps a surface form (e.g. `went`), the client looks it up in ECDICT. If the entry has an `exchange` field containing `0:<lemma>` (e.g. `0:go`), the client uses the lemma to fetch the full dictionary entry (phonetic, translations, etc.). If `exchange` is empty or absent, the surface form itself is the lemma. This uses the built-in `ecdict_mobile.db` — no external lemmatizer library needed.

Example — same lemma, different surface forms:

```json
// Ep.1 — first encounter, surface form "consuming"
{ "word": "consuming", "index": 3, "definition": "消耗", "is_new": true }

// Ep.4 — review, surface form "consumed"
{ "word": "consumed", "index": 5, "definition": "消耗", "is_new": false }
```

Both map to lemma `consume`. `is_new: false` in Ep.4 because the lemma has already been encountered.

## vocab

Top-level array summarizing all unique (word, definition) pairs in this episode. Used by the end-of-episode panel. Derivable from all `marks` across all messages — provided as a convenience.

```json
{ "word": "bank", "definition": "河岸", "is_new": true }
```

| Field        | Type    | Description                                                 |
| ------------ | ------- | ----------------------------------------------------------- |
| `word`       | string  | The vocabulary word                                         |
| `definition` | string  | Chinese definition                                          |
| `is_new`     | boolean | Whether this (word, definition) pair is new in this episode |

## Full Example

```json
{
  "meta": {
    "ep": 3,
    "title": "The Glass",
    "kind": "main"
  },
  "messages": [
    {
      "type": "narration",
      "text": "Footsteps approach. A shadow falls across my table.",
      "marks": [
        { "word": "footstep", "index": 0, "definition": "脚步", "is_new": false }
      ]
    },
    {
      "type": "dialogue",
      "side": "left",
      "name": "Anna",
      "text": "Hey.",
      "marks": []
    },
    {
      "type": "dialogue",
      "side": "left",
      "name": "Anna",
      "text": "You're Nukumizu, right? Class C?",
      "marks": []
    },
    {
      "type": "narration",
      "text": "This is the moment my quiet invisible life ends.",
      "marks": [
        { "word": "invisible", "index": 6, "definition": "隐形的", "is_new": true }
      ]
    },
    {
      "type": "dialogue",
      "side": "right",
      "name": "Kazuhiko",
      "text": "...Nukumizu who?",
      "marks": []
    }
  ],
  "vocab": [
    { "word": "footstep", "definition": "脚步", "is_new": false },
    { "word": "invisible", "definition": "隐形的", "is_new": true }
  ]
}
```

### Same word, two senses — across messages

```json
{
  "meta": { "ep": 5, "title": "The River", "kind": "main" },
  "messages": [
    {
      "type": "narration",
      "text": "I sat down on the bank and watched the water.",
      "marks": [
        { "word": "bank", "index": 5, "definition": "河岸", "is_new": true }
      ]
    },
    {
      "type": "dialogue",
      "side": "right",
      "name": "Kazuhiko",
      "text": "The bank called. They want to talk about my loan.",
      "marks": [
        { "word": "bank", "index": 1, "definition": "银行", "is_new": true }
      ]
    }
  ],
  "vocab": [
    { "word": "bank", "definition": "河岸", "is_new": true },
    { "word": "bank", "definition": "银行", "is_new": true }
  ]
}
```

Both are `is_new: true` — different senses, different learning items. Each renders with its own inline definition.
