/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^expo-crypto$': '<rootDir>/src/__tests__/expo-crypto-mock.ts',
    '^expo-secure-store$': '<rootDir>/src/__tests__/expo-secure-store-mock.ts',
  },
  clearMocks: true,
};
