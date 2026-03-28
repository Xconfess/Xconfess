module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        diagnostics: false,
      },
    ],
  },
  testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/test/**/*.spec.ts'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/xconfess-backend/',
    '<rootDir>/e2e/',
  ],
  watchPathIgnorePatterns: ['<rootDir>/xconfess-backend/'],
  modulePathIgnorePatterns: ['<rootDir>/xconfess-backend/'],
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1',
  },
};
