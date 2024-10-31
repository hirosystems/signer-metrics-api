import { createDefaultPreset, type JestConfigWithTsJest } from 'ts-jest';

const jestConfig: JestConfigWithTsJest = {
  testEnvironment: 'node',
  transform: {
    ...createDefaultPreset().transform,
  },

  testMatch: ['**/tests/unit/**/*.test.ts'],

  collectCoverageFrom: [
    'src/**/*.ts',
    'migrations/*.ts',
  ],
  collectCoverage: true,
  coverageProvider: 'v8',
};

export default jestConfig;
