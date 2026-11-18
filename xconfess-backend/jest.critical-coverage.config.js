const baseConfig = require('./jest.config.js');

module.exports = {
  ...baseConfig,
  testMatch: [
    '<rootDir>/src/auth/auth.service.spec.ts',
    '<rootDir>/src/moderation/moderation-state-machine.spec.ts',
    '<rootDir>/src/data-export/data-export.service.spec.ts',
    '<rootDir>/src/tipping/tipping.service.spec.ts',
  ],
  collectCoverageFrom: [
    '<rootDir>/src/auth/auth.service.ts',
    '<rootDir>/src/moderation/moderation-state-machine.ts',
    '<rootDir>/src/data-export/data-export.service.ts',
    '<rootDir>/src/tipping/tipping.service.ts',
  ],
  coverageDirectory: '<rootDir>/coverage/critical-modules',
  coverageReporters: ['text'],
  coverageThreshold: {
    './src/auth/auth.service.ts': {
      branches: 35,
      functions: 50,
      lines: 55,
      statements: 55,
    },
    './src/moderation/moderation-state-machine.ts': {
      branches: 50,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    './src/data-export/data-export.service.ts': {
      branches: 30,
      functions: 50,
      lines: 55,
      statements: 55,
    },
    './src/tipping/tipping.service.ts': {
      branches: 30,
      functions: 50,
      lines: 55,
      statements: 55,
    },
  },
};
