module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.spec.ts'],
  // Seed required env vars before any test modules are loaded
  setupFiles: ['./test/jest-setup.js'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        // Disable type-checking during tests — type correctness is enforced
        // separately by `tsc`. This prevents pre-existing TS errors in
        // unrelated files from blocking the test suite from running.
        diagnostics: false,
      },
    ],
  },
};
