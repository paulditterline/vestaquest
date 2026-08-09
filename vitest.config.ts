import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      include: ['packages/board/src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'html'],
    },
    include: ['packages/**/test/**/*.test.ts'],
  },
});
