import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    // Use jsdom for DOM testing
    environment: 'jsdom',

    // Global test APIs (describe, it, expect, etc.)
    globals: true,

    // Setup file for test configuration
    setupFiles: ['./src/test/setup.ts'],

    // Test file patterns
    include: [
      'src/**/*.test.{ts,tsx}',
      'src/__tests__/**/*.{ts,tsx}',
    ],

    // Exclude patterns
    exclude: [
      'node_modules',
      'dist',
      'supabase/functions/**',
    ],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.test.{ts,tsx}',
        '**/types/**',
      ],
      thresholds: {
        // Start with low thresholds, increase as tests are added
        statements: 20,
        branches: 20,
        functions: 20,
        lines: 20,
      },
    },

    // Reporter options
    reporters: ['default'],

    // Timeout for tests
    testTimeout: 10000,

    // Watch mode exclusions
    watchExclude: ['node_modules', 'dist'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
