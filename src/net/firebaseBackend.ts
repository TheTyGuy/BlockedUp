/**
 * RoomBackend on Firebase Realtime Database.
 *
 * This file is the only one that imports the Firebase SDK, and it is loaded
 * with a dynamic import() so single-player never downloads it.
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import {
  connectDatabaseEmulator,
  get,
  getDatabase,
  onChildAdded,
  onDisconnect,
  onValue,
  push,
  ref,
  remove,
  serverTimestamp,
  set,
  type Database,
} from 'firebase/database';
import type { RoomBackend } from './backend';
import { firebaseConfig } from './firebaseConfig';

/** Wrap a Database connection (real or emulator) as a RoomBackend. */
export function createFirebaseBackend(db: Database, uid: string): RoomBackend {
  return {
    uid,
    async get(path) {
      return (await get(ref(db, path))).val();
    },
    set: (path, value) => set(ref(db, path), value),
    remove: (path) => remove(ref(db, path)),
    onValue: (path, cb) => onValue(ref(db, path), (snap) => cb(snap.val())),
    onChildAdded: (path, cb) =>
      onChildAdded(ref(db, path), (snap) => {
        if (snap.key !== null) cb(snap.key, snap.val());
      }),
    setOnDisconnect: (path, value) => onDisconnect(ref(db, path)).set(value),
    onConnection: (cb) => onValue(ref(db, '.info/connected'), (snap) => cb(snap.val() === true)),
    newKey: () => push(ref(db, 'keys')).key!,
    serverTime: () => serverTimestamp(),
  };
}

let cached: Promise<RoomBackend> | null = null;

/**
 * Local development only: opening the game on localhost with `?emulator` in
 * the URL uses the Realtime Database emulator (scripts/db-emulator.sh) instead
 * of the live project, with a made-up player id kept in this tab's storage.
 */
function emulatorBackend(): RoomBackend | null {
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (!local || !new URLSearchParams(location.search).has('emulator')) return null;
  let uid = sessionStorage.getItem('blockedup:emulator-uid');
  if (!uid) {
    uid = `dev-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem('blockedup:emulator-uid', uid);
  }
  const app = initializeApp({
    projectId: 'demo-blockedup',
    databaseURL: 'http://127.0.0.1:9000?ns=demo-blockedup',
  });
  const db = getDatabase(app);
  connectDatabaseEmulator(db, '127.0.0.1', 9000, { mockUserToken: { sub: uid } });
  return createFirebaseBackend(db, uid);
}

/** Connect to the live project and sign this device in anonymously (once). */
export function connectFirebase(): Promise<RoomBackend> {
  cached ??= (async () => {
    const emulator = emulatorBackend();
    if (emulator) return emulator;
    const app = initializeApp(firebaseConfig);
    const { user } = await signInAnonymously(getAuth(app));
    return createFirebaseBackend(getDatabase(app), user.uid);
  })();
  // Let a failed attempt (e.g. offline) be retried next time.
  cached.catch(() => (cached = null));
  return cached;
}
