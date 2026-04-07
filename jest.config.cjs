const { createDefaultPreset } = require('ts-jest');

const transform = {
  ...createDefaultPreset({
    tsconfig: '<rootDir>/tsconfig.tests.json',
  }).transform,
};

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  coverageProvider: 'v8',
  collectCoverageFrom: ['src/**/*.ts', 'migrations/*.ts'],
  testTimeout: 600000,
  projects: [
    {
      transform,
      displayName: 'unit-tests',
      testMatch: ['**/tests/unit/**/*.test.ts'],
    },
    {
      transform,
      displayName: 'db-tests',
      testMatch: ['**/tests/db/**/*.test.ts'],
      globalSetup: './tests/db/jest-global-setup.ts',
      globalTeardown: './tests/db/jest-global-teardown.ts',
      setupFilesAfterEnv: ['./tests/db/jest-setup.ts'],
    },
  ],
};
