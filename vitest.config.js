import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Environment
    environment: 'jsdom',

    // Global test APIs
    globals: true,

    // Test files pattern
    include: ['tests/**/*.test.js', 'src/**/*.test.js'],

    // Setup files
    setupFiles: ['./tests/setup.js'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.js'],
      exclude: [
        'src/**/*.test.js',
        'node_modules/**'
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60
      }
    },

    // Timeouts
    testTimeout: 10000,
    hookTimeout: 10000,

    // Reporter
    reporters: ['verbose'],

    // Mock configuration
    mockReset: true,
    restoreMocks: true,

    // Dependency optimization
    deps: {
      inline: [/firebase/]
    }
  }
});
