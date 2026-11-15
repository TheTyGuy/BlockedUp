/**
 * RoomBackend: the handful of realtime-database operations multiplayer needs.
 *
 * OnlineMatch talks only to this interface, so the match logic can be tested
 * with the in-memory backend (memoryBackend.ts) and run for real on Firebase
 * (firebaseBackend.ts). Paths are slash-separated from the database root.
 */
export type Unsubscribe = () => void;

export interface RoomBackend {
  /** This device's player id (Firebase anonymous-auth uid). */
  readonly uid: string;
  /** Read once. Resolves to null if nothing is there. Rejects if not permitted. */
  get(path: string): Promise<unknown>;
  /** Write (replace). Rejects if the security rules refuse it. */
  set(path: string, value: unknown): Promise<void>;
  remove(path: string): Promise<void>;
  /** Fires with the current value, then again on every change. */
  onValue(path: string, cb: (value: unknown) => void): Unsubscribe;
  /** Fires for each existing child in key order, then for each new child. */
  onChildAdded(path: string, cb: (key: string, value: unknown) => void): Unsubscribe;
  /** Have the server write `value` at `path` if this device drops offline. */
  setOnDisconnect(path: string, value: unknown): Promise<void>;
  /** Whether this device currently has a live connection to the server. */
  onConnection(cb: (connected: boolean) => void): Unsubscribe;
  /** A new unique, time-ordered child key. */
  newKey(): string;
  /** Placeholder the server replaces with its clock time. */
  serverTime(): unknown;
}
