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
  testRegex: 'src/.*\\.spec\\.ts$',
  testPathIgnorePatterns: [
    '/node_modules/',
    '/e2e/',
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
