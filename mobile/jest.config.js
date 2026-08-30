/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts?(x)'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  moduleNameMapper: {
    '^react-native$': '<rootDir>/src/__tests__/react-native-mock.ts',
    '^expo-crypto$': '<rootDir>/src/__tests__/expo-crypto-mock.ts',
    '^expo-secure-store$': '<rootDir>/src/__tests__/expo-secure-store-mock.ts',
  },
  clearMocks: true,
};
