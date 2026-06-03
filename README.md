# VocabFiction

[English](README.md) | [中文](README.zh-CN.md)

> A story-driven English vocabulary acquisition tool — read novels, learn words, no memorization required.

VocabFiction turns novels into interactive chat-fiction episodes where English vocabulary words appear naturally in context. Built with Expo and React Native for iOS and Android.

## Features

- **Chat-style reading** — tap to advance through dialogue and narration, like reading a messaging app
- **Built-in novel** — *Too Many Losing Heroines!* (败犬女主太多了！) comes pre-loaded with 3 episodes and an English chapter in traditional reading mode
- **Vocabulary in context** — target words appear bolded with inline definitions on first encounter; tap to review later
- **Two-level dictionary** — tap a word → quick definition card → tap again → full dictionary panel with phonetics, translations, and word forms
- **Offline dictionary** — 339,000-entry English-Chinese dictionary (ECDICT) built in, no network needed
- **End-of-episode panel** — review all vocabulary encountered, expandable/collapsible with drag gesture
- **Dual reading modes** — chat mode (對話體) or traditional paragraph mode (傳統)
- **Adjustable font size** — small, medium, large
- **Your own novels** — upload .txt files and word lists; uploaded novels are saved as UTF-8 source text, bound to a word list, and shown on the bookshelf (generation pipeline coming soon)

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Expo Go](https://expo.dev/go) app installed on your iPhone or Android device

### Run with Expo Go

1. **Clone the repository**

```bash
git clone https://github.com/Xu-Jiaqi/VocabFiction.git
cd VocabFiction
```

2. **Install dependencies**

```bash
npm install
```

3. **Start the development server**

```bash
npx expo start --tunnel
```

4. **Open on your phone**

- Open **Expo Go** on your iPhone or Android device
- Tap **"Enter URL manually"**
- Enter the URL shown in the terminal (e.g., `exp://abc123.ngrok.io:8081`)
- Or scan the QR code displayed in the terminal

The app will load and you'll see the bookshelf with the built-in novel. Tap it to start reading!

> **Note:** The `--tunnel` flag creates a public URL via ngrok, allowing your phone to connect even if it's on a different network. If your phone and computer are on the same Wi-Fi, you can use `npx expo start` instead.

### First Launch

On first launch, the app copies the offline dictionary (39MB) to your device. This may take a few seconds on the loading screen. Subsequent launches are instant.

## Project Structure

```
VocabFiction/
├── app/                          # Expo Router pages
│   ├── _layout.tsx               # Root layout + DB init
│   ├── index.tsx                 # Bookshelf (home)
│   ├── reader/[workId].tsx       # Reading interface
│   ├── settings.tsx              # Font size, reading mode
│   ├── api-settings.tsx          # API configuration
│   ├── work/[workId]/manage.tsx   # Uploaded work management
│   └── upload/
│       ├── novel.tsx             # Novel upload
│       └── wordlist.tsx          # Word list upload
├── src/
│   ├── db/                       # Database layer (expo-sqlite)
│   │   ├── init.ts               # SQLite init + ECDICT copy
│   │   ├── dictionary.ts         # ECDICT lookup + lemma resolution
│   │   ├── works.ts, word-lists.ts, progress.ts, settings.ts
│   ├── models/                   # TypeScript types
│   ├── components/               # UI components
│   │   ├── ChatBubble.tsx        # Dialogue bubble (left/right)
│   │   ├── Narration.tsx         # Narration bubble
│   │   ├── VocabText.tsx         # Inline vocabulary marking
│   │   ├── DictionaryPanel.tsx   # Full dictionary panel
│   │   ├── PlainTextReader.tsx   # Traditional reading mode
│   │   └── AnimatedMessage.tsx   # Message entrance animation
│   ├── services/                 # Business logic
│   │   ├── lemma.ts              # ECDICT exchange parser
│   │   ├── episode-loader.ts     # Episode JSON + chapter text
│   │   ├── user-content.ts       # Uploaded source storage
│   │   ├── text-file.ts          # Text file decoding to UTF-8 string
│   │   └── character-loader.ts   # Character avatar mapping
│   └── theme/colors.ts           # Warm paper color palette
├── novels/败犬女主太多了！/       # Built-in novel
│   ├── makeine/                  # Chat episodes (3 episodes)
│   ├── paras/                    # Traditional reading (1 chapter)
│   └── characters/               # Character avatars + mapping
├── assets/
│   └── ecdict_mobile.db          # Offline English-Chinese dictionary
├── documents/                    # Product specs and design docs
└── word_lists/                   # Vocabulary word lists
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Expo SDK 56 + React Native 0.85 |
| Navigation | Expo Router (file-based) |
| Database | expo-sqlite (SQLite) |
| Storage | expo-file-system, expo-secure-store |
| Animation | React Native Animated API |
| Dictionary | ECDICT (339K entries, lemma resolution via exchange field) |

## Implementation Status

### ✅ Implemented

| Feature | Description |
|---------|-------------|
| Built-in novel | *Too Many Losing Heroines!* — 3 chat episodes + 1 traditional chapter |
| Chat reading mode | Tap-to-advance, dialogue bubbles (left/right), narration, entrance animations |
| Traditional reading mode | Continuous paragraph layout, plain text chapter support |
| Bookshelf | Work list showing title + bound word list name |
| Reading progress persistence | Remembers current episode and message position across sessions |
| Episode navigation | Prev/next episode controls in status bar |
| Vocabulary inline display | `is_new`: bold + definition; review: bold only, tappable |
| Vocab popup card | Positioned near tapped word, tap to expand to dictionary |
| Dictionary panel | Phonetics, multi-sense translations, word forms (past, plural, etc.) |
| Offline ECDICT dictionary | 339K entries, lemma resolution via exchange field (`went` → `go`) |
| End-of-episode vocab panel | Full word list, draggable handle (pull to dismiss, tap to toggle) |
| Font size setting | Small / Medium / Large, applied to all text |
| Reading mode setting | Chat (對話體) / Traditional (傳統) |
| API settings page | URL, API Key (secure storage), model name, connection test |
| Split upload pages | File picker/paste support for word lists and novels; uploaded novels save only UTF-8 `plain.txt` + `meta.json` and bind `works.word_list_id` |
| Uploaded work management | User-uploaded works appear on the bookshelf; tap does nothing for now, long-press opens management for renaming, word-list changes, and deletion |
| Character avatars | Name → avatar image mapping, initial-letter fallback |
| Smooth scrolling | Custom ease-out scroll animation (500ms, cubic easing) |
| Reader entrance animation | Slide-in from right (250ms) |

### 🚧 In Progress / UI Placeholder

| Feature | Status |
|---------|--------|
| Auto-learn detection (M=3) | Deferred — vocabulary tracking state not yet implemented |
| Side stories (番外) | Deferred — depends on vocabulary coverage data |
| Generation pipeline | Source upload and word-list binding are implemented; LLM generation is not yet wired up |
| Paragraph reading for episodes | Plain text chapter reading is available via `PlainTextReader` in traditional mode |

### 📋 Planned

| Feature | Notes |
|---------|-------|
| More built-in novels | Expand content library |
| User-uploaded novel generation | Full pipeline: upload → LLM → episode JSON → bookshelf |
| Additional chapters in traditional mode | Expand `paras/` folder |
| Dark mode | Night reading support |

## Documentation

Detailed product and design documentation is in the `documents/` directory:

- `product-analysis.md` — Product analysis, user personas, design principles
- `format_spec_json.md` — Episode JSON format specification (v3)
- `ui-style-spec.md` — UI style guide (colors, typography, bubbles, animations)
- `user-stories.md` — User stories covering all core flows
- `information-architecture.md` — Page map, navigation, layouts
- `database-schema.md` — SQLite schema, ECDICT integration
- `pending-decisions.md` — Outstanding decisions and MVP scope
