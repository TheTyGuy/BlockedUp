import { describe, expect, it } from 'vitest';
import { MemoryServer } from '../src/net/memoryBackend';
import { OnlineMatch, RoomError, normalizeCode, randomCode } from '../src/net/onlineMatch';
import { bestMove } from '../scripts/bot';

/** Let queued "network" callbacks run. */
const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

/** Stand-in for the parts of database.rules.json these tests rely on. */
function withRules(server: MemoryServer): MemoryServer {
  server.rule = (_uid, path, oldValue, newValue) => {
    if (/\/meta$/.test(path) && oldValue !== null) return false; // rooms are create-only
    if (/\/meta\/guest$/.test(path) && oldValue !== null) return false; // one guest
    if (/\/moves\/[^/]+\/[^/]+$/.test(path) && oldValue !== null) return false; // append-only
    return newValue !== undefined;
  };
  return server;
}

async function startMatch(seed = 12345) {
  const server = withRules(new MemoryServer());
  const host = await OnlineMatch.create(server.client('host-uid'), seed);
  const guest = await OnlineMatch.join(server.client('guest-uid'), host.code);
  await flush();
  return { server, host, guest };
}

/** Each phone's own board must equal the other phone's mirror of it. */
function expectInSync(host: OnlineMatch, guest: OnlineMatch) {
  expect(guest.sessions[0].state).toEqual(host.sessions[0].state);
  expect(host.sessions[1].state).toEqual(guest.sessions[1].state);
}

/** Both players make bot moves in turn until `stop` or the match ends. */
async function play(host: OnlineMatch, guest: OnlineMatch, stop: () => boolean, max = 400) {
  for (let i = 0; i < max && !stop(); i++) {
    const m = i % 2 === 0 ? host : guest;
    if (m.winner() !== null) break;
    const move = bestMove(m.sessions[m.me].state);
    if (!move) break;
    m.sessions[m.me].dispatch(move);
    await flush();
  }
}

describe('room codes', () => {
  it('normalises typed codes', () => {
    expect(normalizeCode(' k7-qd ')).toBe('K7QD');
    expect(normalizeCode('abcdefg')).toBe('ABCD');
  });
  it('generates 4 unambiguous characters', () => {
    for (let i = 0; i < 50; i++) expect(randomCode()).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
  });
});

describe('creating and joining', () => {
  it('host waits, then both phones start with the same pieces', async () => {
    const server = withRules(new MemoryServer());
    const host = await OnlineMatch.create(server.client('host-uid'), 7);
    await flush();
    expect(host.phase).toBe('waiting');
    expect(host.notice()).toMatch(/Waiting/);

    const guest = await OnlineMatch.join(server.client('guest-uid'), host.code.toLowerCase());
    await flush();
    expect(host.phase).toBe('playing');
    expect(guest.phase).toBe('playing');
    expect(host.me).toBe(0);
    expect(guest.me).toBe(1);
    expect(host.controls).toEqual([true, false]);
    expect(guest.controls).toEqual([false, true]);
    expect(host.sessions[0].state.hand).toEqual(guest.sessions[1].state.hand);
    expect(host.notice()).toBeNull();
  });

  it('refuses unknown codes, full rooms and mismatched versions', async () => {
    const { server, host } = await startMatch();
    await expect(OnlineMatch.join(server.client('x'), 'ZZZZ')).rejects.toMatchObject({
      reason: 'not-found',
    });
    await expect(OnlineMatch.join(server.client('third'), host.code)).rejects.toMatchObject({
      reason: 'full',
    });
    server.rule = () => true;
    server.write('admin', 'rooms/OLD1/meta', { host: 'h', mode: 'garbage@0', seed: 1 });
    const err = await OnlineMatch.join(server.client('x'), 'OLD1').catch((e) => e);
    expect(err).toBeInstanceOf(RoomError);
    expect(err.reason).toBe('version');
  });

  it('says so when the server rules refuse everything (rules not published)', async () => {
    const server = new MemoryServer();
    server.rule = () => false;
    await expect(OnlineMatch.create(server.client('a'), 1)).rejects.toMatchObject({
      reason: 'denied',
    });
  });

  it('picks another code when the first is taken', async () => {
    const server = withRules(new MemoryServer());
    const a = await OnlineMatch.create(server.client('a'), 1);
    const b = await OnlineMatch.create(server.client('b'), 2);
    expect(a.code).not.toBe(b.code);
  });
});

describe('playing', () => {
  it("mirrors the opponent's moves", async () => {
    const { host, guest } = await startMatch();
    await play(host, guest, () => false, 6);
    expect(host.sessions[0].state.placements).toBe(3);
    expect(guest.sessions[1].state.placements).toBe(3);
    expectInSync(host, guest);
  });

  it('delivers attacks and stays in sync through a whole match', async () => {
    const { server, host, guest } = await startMatch(2024);
    await play(host, guest, () => host.sent[0] + guest.sent[1] > 0);
    const attacker = host.sent[0] > 0 ? host : guest;
    const victim = attacker === host ? guest : host;
    expect(attacker.sent[attacker.me]).toBeGreaterThan(0);
    // The victim's phone saw the attack too, and its inbox has been emptied.
    expect(victim.sent[attacker.me]).toBe(attacker.sent[attacker.me]);
    expect(server.read(`rooms/${host.code}/inbox`)).toBeNull();
    expectInSync(host, guest);

    await play(host, guest, () => false);
    expect(host.winner()).not.toBeNull();
    expect(guest.winner()).toBe(host.winner());
    expect(host.sent).toEqual(guest.sent);
    expectInSync(host, guest);
  });

  it('the opponent cannot be played from this phone, and invalid moves are not sent', async () => {
    const { server, host } = await startMatch();
    host.sessions[0].dispatch({ type: 'place', handIndex: 0, row: -5, col: 0 });
    await flush();
    expect(server.read(`rooms/${host.code}/moves`)).toBeNull();
  });
});

describe('reconnecting', () => {
  it('a reloaded phone rebuilds both boards from the room', async () => {
    const { server, host, guest } = await startMatch(99);
    await play(host, guest, () => host.sent[0] + guest.sent[1] > 0);
    await play(host, guest, () => false, 4);
    const before = JSON.stringify(guest.sessions.map((s) => s.state));
    const sent = [...guest.sent];

    guest.destroy();
    const again = await OnlineMatch.join(server.client('guest-uid'), host.code);
    await flush();
    expect(again.me).toBe(1);
    expect(JSON.stringify(again.sessions.map((s) => s.state))).toBe(before);
    expect(again.sent).toEqual(sent);

    // ...and can carry on playing.
    await play(host, again, () => false, 4);
    expectInSync(host, again);
  });

  it('the host can reload while still waiting, or mid-match', async () => {
    const server = withRules(new MemoryServer());
    const host = await OnlineMatch.create(server.client('host-uid'), 5);
    host.destroy();
    const host2 = await OnlineMatch.join(server.client('host-uid'), host.code);
    expect(host2.me).toBe(0);
    expect(host2.phase).toBe('waiting');
    const guest = await OnlineMatch.join(server.client('guest-uid'), host.code);
    await flush();
    expect(host2.phase).toBe('playing');
    await play(host2, guest, () => false, 4);
    expectInSync(host2, guest);
  });

  it('shows when the opponent drops offline', async () => {
    const server = withRules(new MemoryServer());
    const host = await OnlineMatch.create(server.client('host-uid'), 5);
    const guestClient = server.client('guest-uid');
    await OnlineMatch.join(guestClient, host.code);
    await flush();
    expect(host.notice()).toBeNull();
    guestClient.disconnect();
    await flush();
    expect(host.notice()).toMatch(/disconnected/);
    expect(host.winner()).toBeNull();
  });
});

describe('leaving', () => {
  it('the player who leaves forfeits', async () => {
    const { host, guest } = await startMatch();
    guest.leave();
    await flush();
    expect(guest.winner()).toBe(0);
    expect(host.winner()).toBe(0);
  });
});
