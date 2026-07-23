module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.setup.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        diagnostics: false,
      },
    ],
  },
  // Jest 30 ships nested ESM-only packages (ansi-styles v6, chalk v5, etc.)
  // that must be transformed by ts-jest/babel rather than executed as-is.
  transformIgnorePatterns: [
    '/node_modules/(?!(ansi-styles|chalk|strip-ansi|ansi-regex|@jest/console|@jest/reporters|@jest/core|jest-circus|jest-config|jest-each|jest-cli|jest-message-util|jest-diff|jest-matcher-utils|jest-snapshot|@jest/expect)/)',
  ],
  testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/test/**/*.spec.ts'],
  transformIgnorePatterns: ['/node_modules/(?!(ansi-styles)/)'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/xconfess-backend/',
    '<rootDir>/e2e/',
  ],
  watchPathIgnorePatterns: ['<rootDir>/xconfess-backend/'],
  modulePathIgnorePatterns: ['<rootDir>/xconfess-backend/'],
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1',
    '^@nestjs/bull$': '@nestjs/bullmq',
    '^bull$': 'bullmq',
    '^bcrypt$': 'bcryptjs',
    '^@faker-js/faker$': '<rootDir>/test/utils/faker-stub.ts',
    '^@faker-js/faker/\\.$': '<rootDir>/test/utils/faker-stub.ts',
  },
};

