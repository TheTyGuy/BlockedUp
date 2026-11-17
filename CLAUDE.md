# Blocked Up

A mobile-first block puzzle game (Vite + TypeScript, canvas board, vanilla DOM menus), published to GitHub Pages from `main`.

**Start here:** read `docs/ROADMAP.md` for what is live, what is planned next, and the agreements with the owner. `README.md` covers architecture, adding levels and goal types, and keeping saved progress safe.

## Commands

- `npm run dev` / `npm run build` / `npm run preview`
- `npm test` (unit tests), `npm run lint`, `npm run format`
- `npm run simulate [-- runs]`: a bot plays every level; use it to tune difficulty
- `npm run test:emulator`: multiplayer and security-rule tests against the Firebase emulator (needs Java)
- `node scripts/make-preview.mjs <dir> --unlock <n>`: shareable preview build

## Rules

- `src/engine/` is pure: no DOM, timers, `Math.random` or `Date.now` (lint enforces it). Game rules live there, never in `src/ui/`.
- Never rename or remove a shipped level id, and never change the storage key. See "Keeping player progress safe" in the README.
- The repo and site are public: no names of pets or people, no photos with people's faces, only owner-approved photos.
- Branch from `origin/main` (the GitHub default branch is a stale working branch). Merge to `main` only when the owner asks; it deploys to a game people are playing.
- Explain changes to the owner in plain language and offer a preview before merging.
