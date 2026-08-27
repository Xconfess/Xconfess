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
    '^.+\\.m?js$': [
      'babel-jest',
      {
        presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
      },
    ],
  },
  // Jest 30 ships nested ESM-only packages (ansi-styles v6, chalk v5, etc.)
  // that must be transformed by ts-jest/babel rather than executed as-is.
  testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/test/**/*.spec.ts'],
  transformIgnorePatterns: [
    '/node_modules/(?!(ansi-styles|sanitize-html|htmlparser2|domhandler|domutils|dom-serializer|domelementtype|entities)/)',
  ],
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
  // Some specs intentionally exercise queues, sockets, and failed transports.
  // Disable Jest's one-second open-handle warning while the suite tears down.
  openHandlesTimeout: 0,
};
