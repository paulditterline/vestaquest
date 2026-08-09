import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      include: [
        'apps/server/src/**/*.ts',
        'packages/board/src/**/*.ts',
        'packages/contracts/src/**/*.ts',
        'packages/game/src/**/*.ts',
      ],
      provider: 'v8',
      reporter: ['text', 'html'],
    },
    include: ['apps/**/test/**/*.test.ts', 'packages/**/test/**/*.test.ts'],
  },
});
