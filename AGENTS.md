# Repository Guidelines

## Project Structure & Module Organization

This repository contains an Expo/React Native app at the root and a FastAPI backend in `ELBackend/`.

- `app/`: Expo Router screens and layouts, including bookshelf, reader, settings, upload, and work management routes.
- `src/components/`, `src/services/`, `src/db/`, `src/models/`, `src/theme/`: reusable UI, business logic, SQLite access, TypeScript types, and shared colors.
- `assets/`, `word_lists/`, `novels/`: bundled dictionary, vocabulary lists, and built-in reading content.
- `documents/`: product, schema, UI, and architecture notes.
- `ELBackend/app/` and `ELBackend/tests/`: backend implementation and pytest suite. See `ELBackend/AGENTS.md` for backend-specific constraints.

## Build, Test, and Development Commands

Install root dependencies with `npm install`.

- `npm run start`: start Expo dev server.
- `npx expo start --tunnel`: start Expo with a tunnel for physical devices on other networks.
- `npm run android`, `npm run ios`, `npm run web`: launch the corresponding Expo target.
- `npx tsc --noEmit`: run TypeScript checks; there is no root lint or test script currently.

Backend work is done from `ELBackend/` with Python 3.10 after activating its virtual environment:

- `uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`: run the API locally.
- `pytest tests/ -v`: run backend tests.
- `ruff check app/ tests/` and `ruff format app/ tests/`: lint and format backend Python.

## Coding Style & Naming Conventions

Use TypeScript with `strict` mode and the `@/*` path alias. Follow the existing React Native style: two-space indentation, single quotes, functional components, `StyleSheet.create`, and named exports for shared helpers. Screens should remain in `app/`; cross-screen logic belongs in `src/services/` or `src/db/`. Use PascalCase for components and types, camelCase for functions and variables, and kebab-case for route folder names where Expo Router paths require it.

## Testing Guidelines

No frontend test framework is configured yet. For frontend changes, run `npx tsc --noEmit` and manually verify the affected Expo route. Backend tests live under `ELBackend/tests/` and mirror `ELBackend/app/`; name files `test_*.py` and keep fixtures in `ELBackend/tests/fixtures/`.

## Commit & Pull Request Guidelines

Recent history uses Conventional Commit-style prefixes such as `feat:`, `refactor:`, and `docs:` with concise descriptions. Keep commits scoped and describe user-visible behavior when relevant. Pull requests should include a short summary, test results, linked issues if any, and screenshots or recordings for UI changes.

## Security & Configuration Tips

Do not commit local `.env` files, API keys, generated backend `data/`, or temporary device artifacts. Keep bundled assets intentional; the offline dictionary is large, so avoid duplicate copies.
