import { defineConfig } from 'vitest/config';

// Integration tests that need the Realtime Database emulator (npm run test:emulator).
export default defineConfig({
  test: { include: ['tests/emulator/**/*.emu.test.ts'], environment: 'node', testTimeout: 20000 },
});
