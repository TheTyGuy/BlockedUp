# Blocked Up

A bright, chunky, mobile-first block puzzle game. Drag pieces from your hand onto the board, fill rows and columns to blast them, and chain clears into combos.

**Phase 1** (this repo): single player, with **Endless** (4 difficulties) and **Missions** (a 20-level campaign).
**Phase 2** (planned): two-player modes on two phones. The engine is already built for it; see [Phase 2 notes](#phase-2-notes).

- Vite + TypeScript, vanilla DOM for menus, Canvas for the board
- Installable PWA with offline play
- Pure, deterministic, fully unit-tested game engine

**Play it:** https://thetyguy.github.io/BlockedUp/. On a phone, use "Add to Home Screen" (iOS Safari) or "Install app" (Android Chrome) to install it.

**What's next:** see [docs/ROADMAP.md](docs/ROADMAP.md) for planned worlds, open items and working agreements.

## Getting started

```bash
npm install
npm run dev        # dev server (also on your LAN: open the printed URL on your phone)
```

| Script                       | What it does                                                      |
| ---------------------------- | ----------------------------------------------------------------- |
| `npm run dev`                | Vite dev server with hot reload (`--host`, so phones can connect) |
| `npm run build`              | Type-check, then build to `dist/`                                 |
| `npm run preview`            | Serve the production build (service worker is active here)        |
| `npm test`                   | Run the Vitest unit tests once (`npm run test:watch` to watch)    |
| `npm run test:emulator`      | Multiplayer + security-rule tests against the Firebase emulator   |
| `npm run lint`               | ESLint                                                            |
| `npm run format`             | Prettier (`format:check` for CI)                                  |
| `npm run simulate [-- runs]` | A greedy bot plays every level and prints win rates and stars     |

## Deploying

Every push to `main` runs `.github/workflows/deploy.yml`: lint, test, build, then publish `dist/` to GitHub Pages. Installed copies of the app pick up the new version the next time they're opened online. To redeploy without a code change, use **Actions → Deploy to GitHub Pages → Run workflow**.

The build uses relative paths (`base: './'`), so `dist/` can be hosted from any static host or sub-path (GitHub Pages, Netlify, etc.). The service worker only registers in production builds, so `npm run dev` never serves stale cached files.

## How to play

- You hold **3 pieces**. Drag any of them onto the board, in any order. Once all 3 are placed, you get 3 new ones.
- Pieces **can't be rotated**.
- Filling a whole **row or column** clears it. Clearing several lines with one piece counts as a **multi-clear** and scores much more.
- Clearing lines on back-to-back placements builds a **combo** multiplier. A placement that clears nothing resets it.
- **Game over** when none of the pieces left in your hand fits anywhere. Pieces that can't fit are dimmed in the tray.
- **Missions** add goals, an optional move limit, obstacles (stone blocks that break when their line clears), and 1–3 star ratings.

## Project structure

```
src/
  engine/                PURE game logic (no DOM, no timers, no Math.random)
    types.ts             State, Action, Event, config types (all JSON-serializable)
    engine.ts            createGame(), apply(state, action) → { state, events }, queries
    board.ts             grid helpers: canPlace, findFullLines, clearLines, fitsAnywhere
    pieces.ts            piece catalog, drawn as ASCII art and expanded into orientations
    generator.ts         weighted, seeded hand dealing + optional "at least one fits" guarantee
    scoring.ts           points / combo multiplier
    rng.ts               seeded RNG (mulberry32) whose state lives in GameState
    missions/goals.ts    pluggable goal-type registry
    missions/tracker.ts  goal progress, win check, stars
    index.ts             public engine API
  data/
    difficulties.ts      Easy / Normal / Hard / Brutal presets (board size, piece weights, scoring)
    levels.ts            the mission campaign (20 levels)
  ui/
    app.ts               tiny screen router
    screens/             menus (home, difficulty, levels, settings), game, results
    game/session.ts      GameSession: the only place the UI calls engine.apply
    game/boardView.ts    canvas rendering, drag & drop, animations
    game/blocks.ts       bevelled block sprites (cached)
    fx/                  Web Audio sound effects, haptics
    storage.ts           localStorage: settings, bests, stars, unfinished Endless runs
    theme.ts             colours + colour-blind patterns
tests/                   Vitest tests (engine, missions, level data)
scripts/                 simulate.ts + bot.ts (difficulty check), make-icons.mjs
public/                  manifest, service worker, icons
```

## Architecture

```
 pointer events ──► BoardView ──(engine queries: previewPlacement, handFits)──► ghost / highlights
                       │
                       ▼ dispatch({type:'place', handIndex, row, col})
                  GameSession ──► engine.apply(state, action) ──► { state, events }
                       │                                              │
                       ▼                                              ▼
                  listeners: BoardView (animations, sound, haptics), HUD (score, goals), storage
```

- **The engine is a pure reducer.** `apply(state, action)` never mutates its input and gives the same output for the same input. Invalid actions return the unchanged state plus an `invalidAction` event.
- **State is plain JSON.** Board, hand, score, combo, mission progress and the RNG state can all be saved (Endless runs survive a closed tab) or sent over a network.
- **Events drive everything.** `piecePlaced`, `linesCleared` (rows, columns and every cleared cell with its colour), `comboChanged`, `scoreChanged`, `handDealt`, `goalProgress`, `gameWon` and `gameOver` feed both the UI effects and mission tracking.
- **Seeded RNG.** Piece generation uses an RNG whose state is stored in `GameState`. Two clients with the same seed that apply the same actions deal exactly the same pieces (this is tested).
- **No game rules in the UI.** The view asks the engine whether a placement is valid and which lines it would clear. ESLint blocks `window`, `document`, `Math.random` and `Date.now` inside `src/engine/`.

## Keeping player progress safe

Each player's progress (best scores, level stars, settings, an unfinished Endless run) is saved in their own browser's `localStorage` for the site's address. Deploying an update replaces the game's code and never touches that storage. To keep it that way:

- **Never rename or remove a level `id`.** Stars are saved by id. Reorder, retune, rename the `name` or insert levels freely: a level a player has already beaten stays unlocked even if a new level is placed before it. `tests/progress.test.ts` fails if a shipped id disappears. Add each new id to `SHIPPED_LEVEL_IDS` there.
- **Never change the storage key** (`STORAGE_KEY` in `src/ui/saveFormat.ts`). To change the save format, bump `SAVE_VERSION` and add a step to `MIGRATIONS` that upgrades old saves.
- **Engine changes are safe for scores and stars.** If an update makes a saved, unfinished Endless run unusable, only that run is dropped. Saves are validated entry by entry, so one bad value never wipes the rest.
- **Keep the same web address.** Browser storage belongs to the site's origin (`https://thetyguy.github.io`). Moving the game to a custom domain or a different GitHub account starts everyone from zero. Renaming the repo keeps the origin, but installed home-screen apps would point at the old path.
- **iPhone note:** Safari may clear data for a _website_ that hasn't been opened for 7 days. Home-screen apps are exempt, and the game asks the browser to keep its data, so encourage testers to install it.

## Tuning difficulty

Edit `src/data/difficulties.ts`. Each preset has:

- `boardSize`: Easy 10, Normal 8, Hard 7, Brutal 6.
- `generator.categoryWeights`: how often each kind of piece appears. A category's weight is shared across its orientations.
- `generator.guaranteeFitChance`: the chance that each new hand contains at least one piece that fits. It's `1` on Easy and lower on harder presets.
- `scoring`: points per cell, line-clear base points, combo step and the all-clear bonus.

To add a new piece shape, add one line of ASCII art to `BASE_SHAPES` in `src/engine/pieces.ts`.

## How to add a level

Levels live in `src/data/levels.ts`. Add an object to the `LEVELS` array:

```ts
{
  id: 'l21',                 // unique and stable: saved stars are keyed by it
  name: 'Stone Garden',
  hint: 'Optional one-line tip shown before the level starts.',
  size: 8,                   // board is size × size
  colors: ['red', 'blue', 'green'],   // colours pieces are dealt in
  pieces: 'normal',          // generator preset: easy | normal | hard | brutal
  layout: [                  // optional pre-filled board ('.' empty, '#' stone, r/o/y/g/c/b/p/k colours)
    '........',
    '..#..#..',
    '........',
    '...rr...',
    '...rr...',
    '........',
    '..#..#..',
    '........',
  ],
  goals: [                   // ALL must be completed
    { type: 'clearObstacles' },
    { type: 'blastColor', color: 'red', target: 10 },
  ],
  moveLimit: 40,             // optional
  stars: { two: { maxMoves: 30 }, three: { maxMoves: 22 } },  // each criterion: maxMoves OR minScore
}
```

Levels unlock in array order. Then:

1. Add the new id to `SHIPPED_LEVEL_IDS` in `tests/progress.test.ts`.
2. `npm test` validates every level: unique ids, layout dimensions, colour goals that can actually be met, and a playable start.
3. `npm run simulate` shows how a simple greedy bot does on it. A human who plans ahead does better, so treat the bot's win rate as a relative signal.

**Goal types:** `reveal` (photo levels, see below), `clearRows`, `clearCols`, `clearLines`, `blastColor` (+`color`), `score`, `combo` (streak length), `multiClear` (lines in one placement), `clearObstacles` (target = stones on the starting board), `survive` (pieces placed). All except `clearObstacles` take a `target`.

### Photo levels (World 2)

A photo level hides a picture under **cover tiles**. Clearing a line hits the tile under every cell of that line; a tile with 2 layers cracks first and breaks on the second hit. The level is won with the goal `{ type: 'reveal' }`, when every tile is broken. Winning adds the photo to the **Album** on the home screen.

```ts
{
  id: 'l31',
  world: 2,                    // which section of the level list (see WORLDS in levels.ts)
  name: 'Zoomies',
  size: 8,
  colors: ['red', 'blue', 'yellow', 'green'],
  pieces: 'easy',
  photo: 'zoomies',            // id from src/data/photos.ts
  cover: 2,                    // every cell needs 2 clears...
  // cover: ['11111111', '11222211', ...],  // ...or set layers per cell (cover every cell)
  goals: [{ type: 'reveal' }],
  moveLimit: 90,
  stars: { two: { maxMoves: 60 }, three: { maxMoves: 48 } },
}
```

To add a photo: save a square 640px JPEG as `public/photos/{id}.jpg` and add `{ id, title }` to `src/data/photos.ts`. The site is public, so crop out people and re-save the image (which drops location data) before adding it. Covers combine with everything else: layouts with stones, move limits and extra goals.

## How to add a mission goal type

Goal types are plugins. Each one turns the event stream into a number that counts up toward a target.

1. **Spec**: add a variant to the `GoalSpec` union in `src/engine/types.ts`:
   ```ts
   | { type: 'allClear'; target: number }
   ```
2. **Logic**: register it in `src/engine/missions/goals.ts`:
   ```ts
   registerGoal({
     type: 'allClear',
     target: (spec) => spec.target,
     reduce: (progress, event) => (event.type === 'boardCleared' ? progress + 1 : progress),
   });
   ```
   `reduce` gets each event plus the post-action state. Keep it pure and monotonic (progress never goes down).
3. **Text**: add a label and an icon in `src/ui/goalText.ts`. TypeScript's exhaustive `switch` will flag the missing case.
4. **Test**: add a case to `tests/missions.test.ts`.

If a goal needs information that no event carries yet, emit a new event from `engine.ts`. The UI and other goals will simply ignore it.

## Testing

- `npm test` covers placement validity, single and simultaneous row+column clears (the shared cell counts once), obstacles, scoring and combos, the all-clear bonus, dealing, game-over detection, Easy's fit guarantee, every mission goal type, move limits, star rating, level-data validation, seeded RNG determinism and JSON round-tripping.
- Add `?debug` to the URL to expose `window.__session`, `window.__engine` and `window.__view` for automated play-testing (e.g. with Playwright).

## Two-player (Phase 2, in progress)

**Garbage Attack** is playable two ways from **2 Players** on the home screen:

- **Online:** one player creates a room and shares the 4-character code or invite link (`…/?room=CODE`); the other joins. Each phone plays its own board and can peek at the opponent's.
- **Same device:** two people share one phone and switch sides.

Rules: clearing 2+ lines at once, or clearing on back-to-back placements, sends junk. Each piece of junk either lands as a stone in a random empty cell or smashes one of the receiver's coloured blocks. Junk never completes a line and never smashes stones. Tune it in `src/data/versus.ts`.

### How online play works

```
src/net/
  match.ts            VersusMatch: what the versus screen needs from any match
  localMatch.ts       same-device match
  onlineMatch.ts      room create / join / resume + move sync
  backend.ts          RoomBackend: the few realtime-database operations used
  firebaseBackend.ts  RoomBackend on Firebase (loaded on demand, only when going online)
  memoryBackend.ts    RoomBackend in memory, for unit tests
  firebaseConfig.ts   public web config for the Firebase project
```

- A room holds a shared **seed**. Each player owns one append-only list of their own actions. Because the engine is deterministic, "seed + a player's actions" fully describes their board, so each phone rebuilds the opponent's board by replaying their list.
- Attacks go to the target's **inbox**; the target turns each one into a `receiveGarbage` action in its own list. Every list has a single writer, so the phones can't disagree about ordering.
- A reload or dropped connection just replays the lists (the room code stays in the URL), so matches survive both.
- `ROOM_MODE` in `onlineMatch.ts` carries a rules version. Bump it whenever a change would make two phones on different builds disagree (engine rules, pieces, versus tuning); mismatched phones are refused instead of desyncing.

Database layout:

```
rooms/{code}/meta      host, guest, mode, seed, createdAt, status
rooms/{code}/players   {uid}: { online, left }
rooms/{code}/moves     {uid}/{m000000…}: that player's actions, in order (append-only)
rooms/{code}/inbox     {uid}/{msgId}: attacks sent TO that player (they delete after applying)
```

### Firebase setup

Project `blockedup`: **Realtime Database** + **Anonymous sign-in** (no accounts). Security rules live in `database.rules.json`: only a room's two players can read it, each player can only append their own moves and add to the opponent's inbox, and nothing can be edited afterwards. **Publish rule changes** by pasting the file into Firebase console → Realtime Database → Rules (or `npx firebase deploy --only database`).

Old rooms are not cleaned up automatically yet. They are tiny, but a scheduled cleanup (or a TTL rule) is worth adding before wide release.

### Testing multiplayer

- `npm test` covers the match logic with two simulated phones (`tests/onlineMatch.test.ts`): joining, attacks, full matches staying in sync, reloads, disconnects, forfeits.
- `npm run test:emulator` runs the real Firebase SDK and the real `database.rules.json` against the local Realtime Database emulator: a full match, plus checks that outsiders and cheats are refused. Needs Java; download the emulator once with `npx firebase setup:emulators:database`.
- To click through online play locally without touching the live project: `scripts/db-emulator.sh start`, `npm run dev`, then open `http://localhost:5173/?emulator` in two browser tabs.

Still to come: Gift Pieces, Combo Curses and the co-op modes (see below).

## Phase 2 notes

Phase 2 adds two-player modes on separate phones. Phase 1 was built so these slot in without reworking the engine:

**Shared foundations**

- **Deterministic lockstep.** Both phones start from the same `seed` and config. Because `apply` is pure and the RNG lives in state, each phone can run its opponent's board locally just by applying the opponent's actions in order. Only small actions need to cross the network, not whole boards. For a desync check, players can exchange a hash of `JSON.stringify(state)` every N moves.
- **Transport seam.** `GameSession` is the single point where actions turn into state. A `NetworkSession` with the same interface sends local actions to the peer or server (WebRTC data channel or WebSocket) and feeds remote actions through the same `apply → events` path. The UI doesn't change.
- **New actions, not new code paths.** Extend the `Action` union (e.g. `receiveGarbage`, `receiveGift`, `applyCurse`) and handle each in `apply`'s `switch`. Existing actions and tests stay untouched.

**Modes**

- **Garbage Attack**: on `linesCleared`, the sender turns `lines`/`combo` into a garbage amount and sends it. The receiver applies `{ type: 'receiveGarbage', rows, seed }`, which pushes rows of obstacle cells (`kind: 'obstacle'` already exists) up from the bottom with a gap picked by the seeded RNG. Obstacles already clear with lines and are counted by `clearObstacles`.
- **Gift Pieces**: add a `receiveGift` action that writes chosen `HandPiece`s into the opponent's hand, or queues them for the next deal. The hand is just data, and `handDealt` events already animate new pieces in.
- **Shared-board co-op**: one authoritative `GameState` (host or server) with turn order or slot ownership on the hand. Actions gain a `player` field, and events already identify which hand slot was used.
- **Split-board co-op**: the board has independent `width` and `height`, so a wide board can be split into halves with per-player placement bounds (a check in `canPlace`'s caller), or each player can own a separate board that clears linked lines across both.
- **Combo Curses**: `comboChanged` already fires with the streak length. When it crosses a threshold, send `{ type: 'applyCurse', curse: 'flip' | 'invisible' | 'goose' }`. Purely visual curses (flip the screen, a goose waddling across) live only in the receiver's UI. Curses that touch rules (e.g. invisible blocks) become a state flag the renderer reads. The engine stays the source of truth.
