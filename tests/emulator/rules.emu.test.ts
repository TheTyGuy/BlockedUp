/**
 * Integration tests against the Firebase Realtime Database EMULATOR, using the
 * real Firebase SDK adapter and the real database.rules.json.
 *
 *   npm run test:emulator
 *
 * (Not part of `npm test`; needs Java. See scripts/db-emulator.sh.)
 */
import { afterAll, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectDatabaseEmulator, getDatabase } from 'firebase/database';
import { createFirebaseBackend } from '../../src/net/firebaseBackend';
import { OnlineMatch } from '../../src/net/onlineMatch';
import type { RoomBackend } from '../../src/net/backend';
import { bestMove } from '../../scripts/bot';

const apps: FirebaseApp[] = [];
let n = 0;

/** A separate SDK connection signed in as `uid` (or signed out if null). */
function client(uid: string | null): RoomBackend {
  const app = initializeApp(
    { projectId: 'demo-blockedup', databaseURL: 'http://127.0.0.1:9000?ns=demo-blockedup' },
    `client-${n++}`,
  );
  apps.push(app);
  const db = getDatabase(app);
  connectDatabaseEmulator(db, '127.0.0.1', 9000, uid ? { mockUserToken: { sub: uid } } : undefined);
  return createFirebaseBackend(db, uid ?? 'nobody');
}

const wait = (ms = 150) => new Promise((r) => setTimeout(r, ms));
const until = async (cond: () => boolean, ms = 4000) => {
  const end = Date.now() + ms;
  while (!cond() && Date.now() < end) await wait(25);
  expect(cond()).toBe(true);
};
const uid = (name: string) => `${name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

afterAll(async () => {
  await Promise.all(apps.map((a) => deleteApp(a)));
});

describe('a real match through the emulator', () => {
  it('two phones create, join, attack and stay in sync', async () => {
    const hostB = client(uid('host'));
    const guestB = client(uid('guest'));
    const host = await OnlineMatch.create(hostB, 2024);
    expect(host.phase).toBe('waiting');
    const guest = await OnlineMatch.join(guestB, host.code);
    await until(() => host.phase === 'playing');

    for (let i = 0; i < 300 && host.winner() === null && guest.winner() === null; i++) {
      const m = i % 2 === 0 ? host : guest;
      const before = m.sessions[m.me].state.placements;
      m.sessions[m.me].dispatch(bestMove(m.sessions[m.me].state)!);
      const other = m === host ? guest : host;
      await until(() => other.sessions[m.me].state.placements > before);
    }
    await until(() => host.winner() !== null && guest.winner() !== null);
    await wait(300);
    expect(guest.winner()).toBe(host.winner());
    expect(host.sent[0] + host.sent[1]).toBeGreaterThan(0);
    expect(guest.sent).toEqual(host.sent);
    expect(guest.sessions[0].state).toEqual(host.sessions[0].state);
    expect(host.sessions[1].state).toEqual(guest.sessions[1].state);
    expect(host.notice()).toBeNull();
    expect(guest.notice()).toBeNull();

    // A reloaded phone rebuilds the finished match from the room.
    const again = await OnlineMatch.join(client(guestB.uid), host.code);
    await until(() => again.winner() !== null);
    expect(again.sessions[1].state).toEqual(guest.sessions[1].state);
    expect(again.sessions[0].state).toEqual(guest.sessions[0].state);
    for (const m of [host, guest, again]) m.destroy();
  }, 60000);
});

describe('security rules', () => {
  const denied = (p: Promise<unknown>) => expect(p).rejects.toThrow(/permission/i);

  async function room() {
    const hostB = client(uid('host'));
    const guestB = client(uid('guest'));
    const host = await OnlineMatch.create(hostB, 1);
    const guest = await OnlineMatch.join(guestB, host.code);
    await until(() => host.phase === 'playing');
    await wait();
    // Stop both matches so they don't react to the hand-written data below.
    host.destroy();
    guest.destroy();
    return { hostB, guestB, path: `rooms/${host.code}` };
  }

  it('signed-out devices can read and write nothing', async () => {
    const { path } = await room();
    const anon = client(null);
    await denied(anon.get(`${path}/meta`));
    await denied(anon.get(path));
    await denied(anon.set(`rooms/ANON/meta`, { host: 'nobody', mode: 'x', seed: 1, createdAt: 1 }));
  });

  it('outsiders can see a room exists but not its contents, and cannot join a full room', async () => {
    const { path } = await room();
    const eve = client(uid('eve'));
    expect(await eve.get(`${path}/meta`)).toMatchObject({ seed: 1 });
    await denied(eve.get(path));
    await denied(eve.get(`${path}/moves`));
    await denied(eve.set(`${path}/meta/guest`, eve.uid));
    await denied(eve.set(`${path}/moves/${eve.uid}/m000000`, { type: 'place' }));
    await denied(eve.set(`${path}/players/${eve.uid}/online`, true));
  });

  it('nobody can list all rooms', async () => {
    await denied(client(uid('eve')).get('rooms'));
  });

  it('a room cannot be overwritten, hijacked or given extra fields', async () => {
    const { path, hostB, guestB } = await room();
    await denied(hostB.set(`${path}/meta`, { host: hostB.uid, mode: 'x', seed: 9, createdAt: 1 }));
    await denied(guestB.set(`${path}/meta/host`, guestB.uid));
    await denied(hostB.set(`${path}/meta/seed`, 42));
    await denied(hostB.set(`${path}/meta/extra`, 'x'));
    const other = client(uid('other'));
    await denied(
      other.set('rooms/FAKE/meta', {
        host: 'someone-else',
        mode: 'garbage@1',
        seed: 1,
        createdAt: other.serverTime(),
      }),
    );
  });

  it("players can only append their own moves, never edit them or write the opponent's", async () => {
    const { path, hostB, guestB } = await room();
    await hostB.set(`${path}/moves/${hostB.uid}/m000000`, {
      type: 'place',
      handIndex: 0,
      row: 0,
      col: 0,
    });
    await denied(hostB.set(`${path}/moves/${hostB.uid}/m000000`, { type: 'place', handIndex: 1 }));
    await denied(hostB.remove(`${path}/moves/${hostB.uid}/m000000`));
    await denied(guestB.set(`${path}/moves/${hostB.uid}/m000001`, { type: 'place' }));
    await denied(hostB.set(`${path}/moves/${hostB.uid}/m000001`, { nonsense: true }));
  });

  it('attacks go only into the opponent inbox, and only the owner clears them', async () => {
    const { path, hostB, guestB } = await room();
    const msg = `${path}/inbox/${guestB.uid}/test1`;
    await hostB.set(msg, { type: 'garbage', cells: 2, from: hostB.uid });
    await denied(hostB.set(msg, { type: 'garbage', cells: 9, from: hostB.uid })); // no edits
    await denied(hostB.remove(msg)); // sender can't retract
    await denied(
      hostB.set(`${path}/inbox/${hostB.uid}/self`, { type: 'garbage', cells: 2, from: hostB.uid }),
    );
    await denied(
      hostB.set(`${path}/inbox/${guestB.uid}/spoof`, {
        type: 'garbage',
        cells: 2,
        from: guestB.uid,
      }),
    );
    await guestB.remove(msg); // owner clears
  });

  it('presence can only be written for yourself', async () => {
    const { path, hostB, guestB } = await room();
    await hostB.set(`${path}/players/${hostB.uid}/left`, true);
    await denied(hostB.set(`${path}/players/${guestB.uid}/left`, true));
  });
});
