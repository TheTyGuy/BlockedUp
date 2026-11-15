/**
 * Firebase web config for the BlockedUp project.
 *
 * These values are public identifiers, meant to ship inside the web app.
 * Access is controlled by database.rules.json (deployed to Realtime Database)
 * and anonymous sign-in, not by keeping this file secret.
 *
 * Only Realtime Database + Authentication are used. `measurementId` belongs to
 * Google Analytics, which the game does not load.
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyDIdU8GkjtFrKKAH26R_RW6sn23pfklnZY',
  authDomain: 'blockedup.firebaseapp.com',
  databaseURL: 'https://blockedup-default-rtdb.firebaseio.com',
  projectId: 'blockedup',
  storageBucket: 'blockedup.firebasestorage.app',
  messagingSenderId: '763618239652',
  appId: '1:763618239652:web:a3b44624a1d29b9336b231',
} as const;
