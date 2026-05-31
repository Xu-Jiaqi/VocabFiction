# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

`vocab-novel-app` — A pipeline that turns novels into English chat-fiction episodes for Chinese learners of English. Users upload their favorite novels and target word lists; the app rewrites content into a chat-style format (快点阅读式对话体小说), where vocabulary words appear naturally in context during reading.

## Repository structure

```
repos/
├── documents/               ← Product docs, format spec, UI spec, DB schema
│   ├── product-analysis.md
│   ├── format_spec_json.md
│   ├── format_spec_json_cn.md
│   ├── ui-style-spec.md
│   ├── user-stories.md
│   ├── information-architecture.md
│   ├── database-schema.md
│   └── pending-decisions.md
├── assets/                  ← Static assets bundled with the app
│   └── ecdict_mobile.db     ← ECDICT offline dictionary (38MB, 339K entries)
├── word_lists/              ← Vocabulary word lists (one word per line .txt)
│   └── NJU词汇表AB类汇总.txt
├── novels/                  ← Novel source material and generated episodes
│   └── 败犬女主太多了！/      ← One directory per novel
│       ├── 败犬女主太多了！ 第一卷 utf-8.txt   ← Source text
│       ├── characters/       ← Character name → avatar file mapping + images
│       │   ├── characters.json
│       │   ├── Nukumizu.png
│       │   ├── Sousuke.png
│       │   └── Yanami.png
│       └── makeine/          ← Generated episodes (subdir = work_id)
│           ├── ep01_a_quiet_afternoon.json
│           ├── ep02_the_argument.json
│           └── ep03_the_glass.json
├── vocab-novel-app-deprecated/  ← Old project, deprecated
└── CLAUDE.md
```

The old `vocab-novel-app/` has been renamed to `vocab-novel-app-deprecated/` and is no longer the active project. The new project (code yet to be built) will live at the repo root alongside the documents.

## Key documents

- `documents/product-analysis.md` — Full product analysis: target user, pain points, design principles, core loop, feature list, content generation strategy, UI analysis
- `documents/format_spec_json.md` — JSON format spec for chat fiction episodes (machine-readable, consumed by web app)
- `documents/ui-style-spec.md` — UI style guide: colors, typography, bubbles, vocab interaction, panels, animation
- `documents/user-stories.md` — User stories covering all core flows
- `documents/information-architecture.md` — Page map, navigation flow, page layouts, state transitions
- `documents/pending-decisions.md` — Outstanding decisions needed to finalize PRD

## Design principles (priority order)

1. **不给用户制造压力** — No red dots, no review counts, no reminders. Stats are assets, not bills.
2. **使用门槛降到最低** — Open and read. One tap per message. No interruptions.
3. **读完即正反馈** — End-of-episode vocab panel is presentation, not a test.
4. **读就是学** — No separate learning mode. Reading is the only activity.
5. **重复对目标词的回忆** — First occurrence shows definition; review occurrences hide it (tappable); auto-detects when learned.

## Format (v3)

- **Pipeline**: LLM generates episodes directly in JSON format (no intermediate markup).
- **JSON format**: Spec at `documents/format_spec_json.md`. Top-level `{ meta, messages, vocab }`.
- Message types: `narration` (center), `dialogue` with `side: "left"|"right"` and character `name`.
- Vocab marking: each message has a `marks` array. Each mark has `word`, `index` (0-based word position in text), `definition`, `is_new`.
- Tracking is per **(word, definition) pair**, not per word. Same word with different definitions = separate learning items.
- `is_new: true` = first occurrence of this (word, definition) pair; definition shown inline. `is_new: false` = review, bold only, tappable.
- Episode kinds: `main` (regular), `side` (AI-generated filler for hard-to-embed words).
- Word lists: one word per line `.txt` file.

## Tech stack

- **Framework**: React Native / Expo (TypeScript)
- **Platforms**: iOS + Android
- **Local storage**: expo-sqlite (structured data, offline dictionary, reading progress), expo-secure-store (API Key)
- **Animation**: Reanimated + Gesture Handler
- **Architecture**: Pure client-side. No backend server. User provides own LLM API key. All content stored locally as JSON.

## UI style

- Warm paper aesthetic: cream background (`#FAF8F3`), ink-brown text (`#2C2416`).
- Serif body text (Charter/Georgia), sans-serif UI elements.
- Chat bubbles: asymmetric border-radius, no shadows.
- Vocabulary: bold only, no color. Two-level lookup: tap word → small definition card; tap card → dictionary panel.
- No emoji. No cool tones. No progress percentage.
- Full spec: `documents/ui-style-spec.md`.
