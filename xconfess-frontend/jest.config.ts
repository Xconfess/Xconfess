/** @type {import('jest').Config} */
const config = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  testEnvironmentOptions: {
    customExportConditions: [""],
  },
  rootDir: ".",
  testMatch: [
    "**/app/**/__tests__/**/*.test.ts",
    "**/app/**/__tests__/**/*.test.tsx",
    "**/tests/**/*.spec.ts",
    "**/tests/**/*.spec.tsx",
  ],
  testPathIgnorePatterns: [
    "<rootDir>/node_modules/",
    "<rootDir>/tests/e2e/",
    "<rootDir>/tests/mobile/",
  ],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    "^server-only$": "<rootDir>/tests/mocks/server-only.js",
    "^rettime$": "<rootDir>/tests/mocks/__rettime-stub.js",
    "^@open-draft/deferred-promise$": "<rootDir>/tests/mocks/__deferred-promise-stub.js",
    "^react$": "<rootDir>/../node_modules/react",
    "^react-dom$": "<rootDir>/../node_modules/react-dom",
    "^react-dom/(.*)$": "<rootDir>/../node_modules/react-dom/$1",
  },
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  transform: {
    "^.+\\.m?[tj]sx?$": [
      "ts-jest",
      {
        diagnostics: false,
        tsconfig: {
          jsx: "react-jsx",
          allowJs: true,
          esModuleInterop: true,
        },
      },
    ],
  },
  transformIgnorePatterns: [],
};
module.exports = config;
