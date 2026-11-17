# Blocked Up roadmap

What is live, what comes next, and the decisions already made with the owner. Read this before starting a new piece of work. Update it when plans change or a world ships.

## What is live

Published at https://thetyguy.github.io/BlockedUp/ (deploys from `main`).

- **Endless:** Easy 10×10, Normal 8×8, Hard 7×7, Brutal 6×6.
- **World 1 · Block Basics:** levels `l01`–`l20`.
- **World 2 · Tile Breaker:** levels `l21`–`l40`. Cover tiles hide a photo; clearing lines breaks them. Winning adds the photo to the Album (hidden until the first photo is won).
- **2 Players · Garbage Attack:** same device, and online rooms through Firebase.

## Next worlds

The owner's plan: introduce **one new mechanic per world**, then start **layering** it with earlier ones, until later worlds combine everything. Photo reveals continue as a reward in every world, so the Album keeps growing.

| World | Mechanic                                                            | Theme                                              | Status                                  |
| ----- | ------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------- |
| 3     | **Ice blocks**                                                      | Frozen Peaks: cool blues, frosted blocks, cracking | Next                                    |
| 4     | **Shaped boards** (holes, cut corners: cross, ring, heart)          | Any; the silhouette is the hook                    | Planned                                 |
| 5     | **Countdown bombs**                                                 | Volcano: dark reds, embers                         | Planned                                 |
| later | **Puzzle levels** (fixed pieces, "clear it in N moves")             | Blueprint                                          | Idea, could be sprinkled into any world |
| later | **Gems** inside pre-filled blocks, collected by clearing their line | Mine / treasure                                    | Idea                                    |

Ask the owner how many levels each world should have. World 2 was first proposed at 10–12 and they asked for 20.

### World 3: ice blocks (agreed direction, details open)

- Frozen blocks need **two clears**: the first cracks them, the second removes them. Rewards planning the same line twice.
- Mix in some **photo-reveal levels** (cover tiles) so the two mechanics start layering.
- Suggested engine shape, not yet built: an `ice` cell kind (or a hit-point field on `Cell`). When a line clears, an ice cell loses a layer and **stays on the board** instead of being removed, so it keeps occupying space until its last layer goes. Emit an event for cracked / broken ice, and add a goal such as `clearIce` (target = ice cells at the start), mirroring `clearObstacles`.
- Open questions to settle with the owner: do pieces placed next to ice interact with it; can incoming versus junk smash ice; should ice appear in dealt pieces or only in level layouts.
- **Per-world visual themes are not built yet.** Today every world shares one background and block style. World 3 is the natural place to add a theme option to `WORLDS` (background gradient, tile/block accents).

### World 4: shaped boards

- Cells that are not part of the board (holes). A row or column counts as full when every real cell in it is filled.
- Touches `canPlace`, `findFullLines`, the piece generator's fit checks, the bot, cover parsing and board drawing. Worth doing as its own world for that reason.

## How World 2 was built (reuse this pattern)

- **Data first:** levels in `src/data/levels.ts`, photos in `src/data/photos.ts`, worlds in `WORLDS`.
- **Difficulty by bot:** `npm run simulate` plays every level. Targets that worked: bot win rate about 90% at the start of a world, falling to about 50% at the end. Stars: 2★ at roughly `1.08 ×` the bot's average winning moves, 3★ at `0.86 ×`. Move limit about `1.65 ×` the average. The bot does not plan ahead, so goals that need setup (3 lines at once) look harder than they are for a person.
- **Every photo level must start fully covered** and tiles must be opaque, so the photo is a surprise. A test enforces the first.
- **New level ids** go into `SHIPPED_LEVEL_IDS` in `tests/progress.test.ts`. Never rename or remove a shipped id (saved stars are keyed by it).

## Photos

- The repo and site are **public**. Only add photos the owner has approved for public use.
- **No names** of the dogs (or people) in the game, code, file names or commit messages. Photos get playful titles instead.
- **No people's faces.** Crop tight around the dog's face, square, 640px JPEG, re-saved so location data is dropped.
- **Held back:** four black-and-white studio portraits. They look like a professional photographer's work; add them only if the owner confirms they may be posted publicly.
- **Balance:** one dog appears in about half of World 2's photos. The owner was asked for more face shots of the other three; swap some repeats when they arrive.
- **Spare approved crops** not yet used are in `assets/photo-spares/` (not deployed). Other photos must be re-sent by the owner in the new conversation; uploads do not carry over.

## Two-player status

- Built and merged: Garbage Attack, same device and online. Junk either lands as a stone or smashes a coloured block (`smashChance`).
- **Waiting on the owner:** publish `database.rules.json` in Firebase console → Realtime Database → Rules, and confirm Anonymous sign-in is enabled. Until then "Create online room" reports that online play isn't switched on.
- Not tested against the live Firebase project or on two real phones yet.
- Known gaps: old rooms are never cleaned up; no one-tap rematch.
- Later modes (see README "Phase 2 notes"): Gift Pieces, Combo Curses, shared-board and split-board co-op.

## Working agreements with the owner

- Explain things in plain language; the owner is not reading the code.
- **Preview before merge.** Build on a branch, publish a private preview, and merge to `main` only when the owner says so. Merging publishes to the live game a tester is actively playing.
- Previews: `npm run build && node scripts/make-preview.mjs <dir> --unlock <n>` makes a single page plus photos. Previews keep separate save data and cannot reach the network (so no online play there).
- After merging, check that the "Deploy to GitHub Pages" run succeeded.
- **Never lose saved progress.** Follow "Keeping player progress safe" in the README.
- When engine rules, pieces or versus tuning change, bump `ROOM_MODE` in `src/net/onlineMatch.ts` so phones on different versions are refused instead of desyncing.

## Repo quirks

- The GitHub **default branch is not `main`** (it is an early working branch the owner could not change). Deploys run from `main`. Branch new work from `origin/main`.
- The Pages environment allows deployments from `main` and the default branch.
- Firebase emulator tests: `npm run test:emulator` (needs Java; `scripts/db-emulator.sh` runs the emulator jar directly because the Firebase CLI can fail behind a network proxy).
