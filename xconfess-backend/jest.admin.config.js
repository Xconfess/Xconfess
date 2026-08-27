module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.setup.ts'],
  testMatch: ['<rootDir>/src/admin/**/*.spec.ts'],
  collectCoverageFrom: [
    '<rootDir>/src/admin/**/*.ts',
    '!<rootDir>/src/admin/**/*.spec.ts',
  ],
  coverageThreshold: {
    global: {
      // "90% coverage" enforced on statements/lines (most common CI metric).
      // Branch/function thresholds are lower to avoid over-penalizing guard-style branching.
      branches: 50,
      functions: 80,
      lines: 90,
      statements: 90,
    },
  },
};

