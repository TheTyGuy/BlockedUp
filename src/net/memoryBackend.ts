/**
 * In-memory RoomBackend for tests (and for trying the online flow without a
 * network). One MemoryServer holds the data; each client gets its own uid.
 * Callbacks are delivered asynchronously, like a real network.
 */
import type { RoomBackend, Unsubscribe } from './backend';

type Tree = { [key: string]: Tree | string | number | boolean };
type Value = Tree | string | number | boolean | null;

const SERVER_TIME = { '.sv': 'timestamp' };
const isTree = (v: unknown): v is Tree => typeof v === 'object' && v !== null;
const parts = (path: string) => path.split('/').filter(Boolean);
const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

/** Return false to refuse a write (stands in for the security rules). */
export type WriteRule = (
  uid: string,
  path: string,
  oldValue: unknown,
  newValue: unknown,
) => boolean;

interface Listener {
  path: string;
  kind: 'value' | 'child';
  cb: (a: never, b?: never) => void;
  seen: Set<string>;
  last?: string;
}

export class MemoryServer {
  private root: Tree = {};
  private listeners = new Set<Listener>();
  private clock = 1_700_000_000_000;
  private keyCounter = 0;
  rule: WriteRule = () => true;

  read(path: string): Value {
    let node: Value = this.root;
    for (const p of parts(path)) {
      if (!isTree(node) || !(p in node)) return null;
      node = node[p];
    }
    return clone(node);
  }

  write(uid: string, path: string, value: unknown): void {
    const resolved = this.resolve(value);
    if (!this.rule(uid, path, this.read(path), resolved)) {
      throw new Error(`PERMISSION_DENIED: ${path}`);
    }
    const keys = parts(path);
    if (resolved === null || resolved === undefined) {
      this.deleteAt(keys);
    } else {
      let node = this.root;
      keys.slice(0, -1).forEach((k) => {
        if (!isTree(node[k])) node[k] = {};
        node = node[k] as Tree;
      });
      node[keys[keys.length - 1]] = clone(resolved) as Tree;
    }
    this.notify();
  }

  private deleteAt(keys: string[]): void {
    const chain: Tree[] = [this.root];
    for (const k of keys.slice(0, -1)) {
      const next = chain[chain.length - 1][k];
      if (!isTree(next)) return;
      chain.push(next);
    }
    delete chain[chain.length - 1][keys[keys.length - 1]];
    // Like Firebase, empty objects don't exist.
    for (let i = chain.length - 1; i > 0; i--) {
      if (Object.keys(chain[i]).length === 0) delete chain[i - 1][keys[i - 1]];
    }
  }

  private resolve(value: unknown): unknown {
    if (isTree(value)) {
      if ((value as Tree)['.sv'] === 'timestamp') return this.clock++;
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, this.resolve(v)]));
    }
    return value;
  }

  newKey(): string {
    return `-k${String(this.keyCounter++).padStart(8, '0')}`;
  }

  listen(l: Listener): Unsubscribe {
    this.listeners.add(l);
    queueMicrotask(() => this.fire(l));
    return () => this.listeners.delete(l);
  }

  private notify(): void {
    for (const l of [...this.listeners]) queueMicrotask(() => this.fire(l));
  }

  private fire(l: Listener): void {
    if (!this.listeners.has(l)) return;
    const value = this.read(l.path);
    if (l.kind === 'value') {
      const json = JSON.stringify(value);
      if (json === l.last) return;
      l.last = json;
      (l.cb as (v: unknown) => void)(value);
      return;
    }
    if (!isTree(value)) return;
    for (const key of Object.keys(value).sort()) {
      if (l.seen.has(key)) continue;
      l.seen.add(key);
      (l.cb as (k: string, v: unknown) => void)(key, value[key]);
    }
  }

  /** Create a client. Call `disconnect()` on it to simulate dropping offline. */
  client(uid: string): MemoryBackend {
    return new MemoryBackend(this, uid);
  }
}

export class MemoryBackend implements RoomBackend {
  private onDisconnect: { path: string; value: unknown }[] = [];
  private connectionCbs = new Set<(c: boolean) => void>();
  private connected = true;

  constructor(
    private server: MemoryServer,
    readonly uid: string,
  ) {}

  async get(path: string): Promise<unknown> {
    return this.server.read(path);
  }
  async set(path: string, value: unknown): Promise<void> {
    this.server.write(this.uid, path, value);
  }
  async remove(path: string): Promise<void> {
    this.server.write(this.uid, path, null);
  }
  onValue(path: string, cb: (value: unknown) => void): Unsubscribe {
    return this.server.listen({ path, kind: 'value', cb: cb as never, seen: new Set() });
  }
  onChildAdded(path: string, cb: (key: string, value: unknown) => void): Unsubscribe {
    return this.server.listen({ path, kind: 'child', cb: cb as never, seen: new Set() });
  }
  async setOnDisconnect(path: string, value: unknown): Promise<void> {
    this.onDisconnect.push({ path, value });
  }
  onConnection(cb: (connected: boolean) => void): Unsubscribe {
    this.connectionCbs.add(cb);
    queueMicrotask(() => cb(this.connected));
    return () => this.connectionCbs.delete(cb);
  }
  newKey(): string {
    return this.server.newKey();
  }
  serverTime(): unknown {
    return SERVER_TIME;
  }

  /** Test helper: drop this client offline (runs its onDisconnect writes). */
  disconnect(): void {
    this.connected = false;
    for (const { path, value } of this.onDisconnect) this.server.write(this.uid, path, value);
    this.onDisconnect = [];
    for (const cb of this.connectionCbs) cb(false);
  }
}
