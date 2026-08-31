/**
 * Unit tests — deterministic only. Nothing here touches the database, the network, or the AI provider,
 * so the suite is free to run and safe in CI. End-to-end generation lives in test/jest-e2e.json.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/test/unit'],
  testRegex: '\.spec\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  clearMocks: true,
  transform: { '^.+\.ts$': ['ts-jest', { isolatedModules: true, diagnostics: false }] },
};
