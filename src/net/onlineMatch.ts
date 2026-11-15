/**
 * OnlineMatch: Garbage Attack between two phones, through a RoomBackend.
 *
 * How the two phones stay in sync
 * -------------------------------
 * A room holds a shared seed. Each player owns ONE append-only list of their
 * own actions (`moves/{uid}`). Because the engine is deterministic, a board is
 * fully described by "seed + that player's actions", so:
 *
 *  - I play on my own session and append every action I apply to my list.
 *  - I rebuild my opponent's board (the "mirror") by replaying their list.
 *  - Attacks go to the target's `inbox`. The TARGET turns each message into a
 *    `receiveGarbage` action in their own list, so every list has exactly one
 *    writer and the two phones can never disagree about ordering.
 *
 * Reloading or reconnecting just replays the lists, so a match survives a
 * dropped connection or a closed tab.
 *
 * Database layout (see database.rules.json):
 *   rooms/{code}/meta      host, guest, mode, seed, createdAt, status
 *   rooms/{code}/players   {uid}: { online, left }
 *   rooms/{code}/moves     {uid}/{m000000…}: actions in order
 *   rooms/{code}/inbox     {uid}/{msgId}: { type:'garbage', cells, from }
 */
import { createGame, type Action } from '../engine';
import { GARBAGE_ATTACK, garbageAttackConfig } from '../data/versus';
import { GameSession } from '../ui/game/session';
import type { RoomBackend, Unsubscribe } from './backend';
import type { PlayerIndex, VersusMatch } from './match';

/**
 * Bump the number when a change would make two phones on different builds
 * disagree (engine rules, piece set, versus tuning). Phones on different
 * versions are refused instead of silently desyncing.
 */
export const ROOM_MODE = 'garbage@1';

/** Letters and digits that are hard to confuse when read aloud or typed. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 4;

export function normalizeCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, CODE_LENGTH);
}

export function randomCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  }
  return code;
}

export type RoomErrorReason = 'not-found' | 'full' | 'version' | 'denied' | 'failed';

export class RoomError extends Error {
  constructor(
    readonly reason: RoomErrorReason,
    message: string,
  ) {
    super(message);
  }
}

/** Did the server's security rules refuse this (as opposed to a network problem)? */
function isDenied(e: unknown): boolean {
  const err = e as { code?: unknown; message?: unknown } | null;
  return /permission/i.test(`${String(err?.code ?? '')} ${String(err?.message ?? '')}`);
}

const DENIED_MESSAGE =
  "The game server refused the request. Online play isn't switched on yet: " +
  'the database rules need to be published in Firebase.';

interface RoomMeta {
  host: string;
  guest?: string;
  mode: string;
  seed: number;
}

const moveKey = (seq: number) => `m${String(seq).padStart(6, '0')}`;
const isInt = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x);

/** Turn a stored move record back into an engine action (null if malformed). */
function parseAction(v: unknown): Action | null {
  if (typeof v !== 'object' || v === null) return null;
  const r = v as Record<string, unknown>;
  if (r.type === 'place' && isInt(r.handIndex) && isInt(r.row) && isInt(r.col)) {
    return { type: 'place', handIndex: r.handIndex, row: r.row, col: r.col };
  }
  if (r.type === 'receiveGarbage' && isInt(r.cells)) {
    return { type: 'receiveGarbage', cells: r.cells };
  }
  return null;
}

export class OnlineMatch implements VersusMatch {
  readonly sessions: [GameSession, GameSession];
  readonly sent: [number, number] = [0, 0];
  readonly names: [string, string];
  readonly controls: [boolean, boolean];
  /** 0 = host, 1 = guest. */
  readonly me: PlayerIndex;
  phase: 'waiting' | 'playing' = 'waiting';

  private readonly room: string;
  private oppUid: string | null = null;
  private seq = 0;
  private replaying = false;
  private pendingMsg: string | null = null;
  private appliedMsgs = new Set<string>();
  private mirrorNext = 0;
  private mirrorBuffer = new Map<number, Action>();
  private oppOnline = true;
  private oppLeft = false;
  private iLeft = false;
  private connected = true;
  private error: string | null = null;
  private listeners = new Set<() => void>();
  private unsubs: Unsubscribe[] = [];
  private destroyed = false;

  /** Host: create a new room and wait for someone to join. */
  static async create(backend: RoomBackend, seed: number): Promise<OnlineMatch> {
    const attempts = 6;
    let denials = 0;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const code = randomCode();
      const meta = {
        host: backend.uid,
        mode: ROOM_MODE,
        seed: seed >>> 0,
        createdAt: backend.serverTime(),
        status: 'waiting',
      };
      try {
        // The rules only allow creating a room that doesn't exist yet, so a
        // code that's already taken is refused and we try another.
        await backend.set(`rooms/${code}/meta`, meta);
      } catch (e) {
        if (isDenied(e)) denials++;
        continue;
      }
      const match = new OnlineMatch(backend, code, { ...meta, seed: seed >>> 0 }, 0);
      await match.start(false);
      return match;
    }
    // One refusal can be a code that's already taken; every attempt refused
    // means the rules themselves don't allow creating rooms.
    if (denials === attempts) throw new RoomError('denied', DENIED_MESSAGE);
    throw new RoomError('failed', "Couldn't create a room. Check your connection and try again.");
  }

  /** Join a room by code, or pick a match back up after a reload. */
  static async join(backend: RoomBackend, rawCode: string): Promise<OnlineMatch> {
    const code = normalizeCode(rawCode);
    if (code.length !== CODE_LENGTH) throw new RoomError('not-found', 'That code is not valid.');
    let meta: RoomMeta | null;
    try {
      meta = (await backend.get(`rooms/${code}/meta`)) as RoomMeta | null;
    } catch (e) {
      if (isDenied(e)) throw new RoomError('denied', DENIED_MESSAGE);
      throw new RoomError('failed', "Couldn't reach the game server. Check your connection.");
    }
    if (!meta) throw new RoomError('not-found', `No room with code ${code}.`);
    if (meta.mode !== ROOM_MODE) {
      throw new RoomError(
        'version',
        'This room was made with a different version of the game. Both players should reload.',
      );
    }

    if (meta.host === backend.uid || meta.guest === backend.uid) {
      const match = new OnlineMatch(backend, code, meta, meta.host === backend.uid ? 0 : 1);
      await match.start(true);
      return match;
    }
    if (meta.guest) throw new RoomError('full', 'That room already has two players.');
    try {
      await backend.set(`rooms/${code}/meta/guest`, backend.uid);
    } catch {
      throw new RoomError('full', 'That room already has two players.');
    }
    const match = new OnlineMatch(backend, code, { ...meta, guest: backend.uid }, 1);
    await match.start(false);
    return match;
  }

  private constructor(
    private backend: RoomBackend,
    readonly code: string,
    private meta: RoomMeta,
    me: PlayerIndex,
  ) {
    this.me = me;
    this.room = `rooms/${code}`;
    const make = (player: PlayerIndex) =>
      new GameSession(createGame(garbageAttackConfig(), meta.seed), { kind: 'versus', player });
    this.sessions = [make(0), make(1)];
    this.names = me === 0 ? ['You', 'Opponent'] : ['Opponent', 'You'];
    this.controls = me === 0 ? [true, false] : [false, true];
  }

  private get opp(): PlayerIndex {
    return (1 - this.me) as PlayerIndex;
  }
  private get local(): GameSession {
    return this.sessions[this.me];
  }
  private get mirror(): GameSession {
    return this.sessions[this.opp];
  }

  private async start(resume: boolean): Promise<void> {
    const { backend } = this;
    const mine = `${this.room}/players/${backend.uid}`;

    // Everything I apply to my own board is appended to my move list.
    this.unsubs.push(
      this.local.subscribe((events, _state, action) => {
        if (events[0]?.type === 'invalidAction') return;
        for (const e of events) {
          if (e.type !== 'garbageSent') continue;
          this.sent[this.me] += e.cells;
          if (!this.replaying) this.sendAttack(e.cells);
        }
        if (!this.replaying) {
          const record: Record<string, unknown> = { ...action };
          if (action.type === 'receiveGarbage' && this.pendingMsg) record.msg = this.pendingMsg;
          this.write(`${this.room}/moves/${backend.uid}/${moveKey(this.seq)}`, record);
        }
        this.seq++;
        this.emit();
      }),
      this.mirror.subscribe((events) => {
        for (const e of events) if (e.type === 'garbageSent') this.sent[this.opp] += e.cells;
        this.emit();
      }),
    );

    if (resume) {
      // Rebuild my board from the moves I had already made.
      const [moves, me] = await Promise.all([
        backend.get(`${this.room}/moves/${backend.uid}`),
        backend.get(mine),
      ]);
      this.iLeft = (me as { left?: boolean } | null)?.left === true;
      const entries = Object.entries((moves ?? {}) as Record<string, unknown>).sort(([a], [b]) =>
        a < b ? -1 : 1,
      );
      this.replaying = true;
      for (const [, value] of entries) {
        const action = parseAction(value);
        if (!action) break;
        const msg = (value as { msg?: unknown }).msg;
        if (typeof msg === 'string') this.appliedMsgs.add(msg);
        this.local.dispatch(action);
      }
      this.replaying = false;
    }

    // Presence: mark me online now and on every reconnect; the server flips it
    // to offline if this phone drops.
    this.unsubs.push(
      backend.onConnection((connected) => {
        this.connected = connected;
        if (connected) {
          void backend.setOnDisconnect(`${mine}/online`, false).catch(() => {});
          this.write(`${mine}/online`, true);
        }
        this.emit();
      }),
    );

    if (this.me === 1) {
      this.begin(this.meta.host);
    } else if (this.meta.guest) {
      this.begin(this.meta.guest);
    } else {
      // Host: wait for a guest to appear in the room.
      this.unsubs.push(
        backend.onValue(`${this.room}/meta/guest`, (guest) => {
          if (typeof guest === 'string' && !this.oppUid) this.begin(guest);
        }),
      );
    }
  }

  /** Both players are known: start exchanging moves. */
  private begin(oppUid: string): void {
    if (this.oppUid || this.destroyed) return;
    this.oppUid = oppUid;
    this.phase = 'playing';
    const { backend } = this;

    this.unsubs.push(
      // The opponent's actions, replayed in order onto the mirror.
      backend.onChildAdded(`${this.room}/moves/${oppUid}`, (key, value) => {
        const n = Number.parseInt(key.slice(1), 10);
        const action = parseAction(value);
        if (!Number.isInteger(n) || !action) return this.fail('Lost sync with your opponent.');
        this.mirrorBuffer.set(n, action);
        while (this.mirrorBuffer.has(this.mirrorNext)) {
          const next = this.mirrorBuffer.get(this.mirrorNext)!;
          this.mirrorBuffer.delete(this.mirrorNext++);
          if (this.mirror.dispatch(next)[0]?.type === 'invalidAction') {
            return this.fail('Lost sync with your opponent.');
          }
        }
      }),
      // Attacks aimed at me.
      backend.onChildAdded(`${this.room}/inbox/${backend.uid}`, (key, value) => {
        const cells = (value as { cells?: unknown } | null)?.cells;
        const fresh = !this.appliedMsgs.has(key);
        if (fresh && isInt(cells) && cells > 0 && this.winner() === null) {
          this.pendingMsg = key;
          this.local.dispatch({
            type: 'receiveGarbage',
            cells: Math.min(cells, GARBAGE_ATTACK.maxPerAttack),
          });
          this.pendingMsg = null;
          this.appliedMsgs.add(key);
        }
        void backend.remove(`${this.room}/inbox/${backend.uid}/${key}`).catch(() => {});
      }),
      backend.onValue(`${this.room}/players/${oppUid}`, (v) => {
        const p = v as { online?: boolean; left?: boolean } | null;
        this.oppOnline = p?.online !== false;
        this.oppLeft = p?.left === true;
        this.emit();
      }),
    );
    this.emit();
  }

  private sendAttack(cells: number): void {
    if (!this.oppUid) return;
    this.write(`${this.room}/inbox/${this.oppUid}/${this.backend.newKey()}`, {
      type: 'garbage',
      cells,
      from: this.backend.uid,
    });
  }

  private write(path: string, value: unknown): void {
    this.backend
      .set(path, value)
      .catch(() => this.fail('Connection problem. Your move may not have sent.'));
  }

  private fail(message: string): void {
    this.error = message;
    this.emit();
  }

  private emit(): void {
    if (this.destroyed) return;
    for (const l of [...this.listeners]) l();
  }

  // --- VersusMatch -------------------------------------------------------------

  winner(): PlayerIndex | null {
    // A finished board decides it first, so quitting after losing changes nothing.
    if (this.sessions[0].state.status === 'lost') return 1;
    if (this.sessions[1].state.status === 'lost') return 0;
    if (this.iLeft) return this.opp;
    if (this.oppLeft) return this.me;
    return null;
  }

  notice(): string | null {
    if (this.error) return this.error;
    if (!this.connected) return 'Reconnecting…';
    if (this.phase === 'waiting') return 'Waiting for your opponent to join…';
    if (this.winner() === null && !this.oppOnline)
      return 'Opponent disconnected. Waiting for them…';
    return null;
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  leave(): void {
    if (this.phase !== 'playing' || this.winner() !== null) return;
    this.iLeft = true;
    this.write(`${this.room}/players/${this.backend.uid}/left`, true);
    this.emit();
  }

  destroy(): void {
    this.destroyed = true;
    for (const u of this.unsubs) u();
    this.listeners.clear();
  }
}
