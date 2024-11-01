import { createDefaultPreset, type JestConfigWithTsJest } from 'ts-jest';

const transform = { ...createDefaultPreset().transform };
const jestConfig: JestConfigWithTsJest = {
  testEnvironment: 'node',
  coverageProvider: 'v8',
  collectCoverageFrom: [
    'src/**/*.ts',
    'migrations/*.ts',
  ],
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
      globalSetup: './tests/db/jest.setup.ts',
      globalTeardown: './tests/db/jest.teardown.ts',
    },
  ]
};

export default jestConfig;
