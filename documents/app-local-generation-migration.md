# App Local Generation Migration

## Goal

Move the runtime generation path into the Android app while keeping `ELBackend` as the reference implementation.

## Migrated Into App

- `NovelPreprocessor`: regex chapter splitting, model-assisted splitting fallback, metadata extraction with fallback.
- `VocabularyPreprocessor`: word-list parsing, bundled `word_sense_mobile.db` sense expansion, initial FSRS card creation.
- `ArcPlanner`: episode slicing, overlap, side-episode trigger rules.
- `VocabularyScheduler`: unseen/review pools, pending overlay, scoring formula, main/side allocation.
- `StoryRewriter`: OpenAI-compatible chat/completions JSON generation.
- `VocabularyAnnotator`: surface matching, ECDICT lemma fallback, `item_id` marks.
- `EpisodeFormatter`: message validation and vocab derivation.
- `ReadingTracker`/`MasteryEvaluator`: local reading-log submission and FSRS updates through `ts-fsrs`.
- `ArcGenerationManager` runtime path: per-work `generation-checkpoint.json`, generated episode persistence, and management-page continuation for incomplete user works.

## Remaining Equivalence Gaps

- Backend uses Python `instructor` + Pydantic validation. The app uses JSON-mode chat completions plus runtime validation and normalization; bad model JSON is rejected, but error messages are not identical.
- Backend retry/backoff behavior is still the reference. The App checkpoint can continue from completed local artifacts, but it does not yet mirror every retry counter detail.
- Android device smoke testing is still required for large novel generation, bundled SQLite asset copying, and long-running foreground behavior.

## Runtime Path

The user flow no longer calls `ELBackend`:

1. Upload word list: save text locally.
2. Upload novel: decode text, create a `works` row with `total_eps = 0`, run `generateEpisodesInApp()`, and checkpoint progress to `generation-checkpoint.json`.
3. Reader completion: build an episode reading log and update local `vocabulary.json`.
4. Incomplete works remain on the bookshelf as "未生成分集"; the management page can continue generation from the saved checkpoint.
