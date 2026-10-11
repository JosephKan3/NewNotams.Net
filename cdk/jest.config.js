/**
 * Standalone jest config — this repo is no longer part of home-platform's
 * pnpm workspace/turbo setup, so this does not extend a shared preset the
 * way it did there. See home-platform's jest.preset.js for why maxWorkers
 * is capped: that repo's turbo runs 5+ packages' test tasks in parallel,
 * each spawning its own jest worker pool, which exhausted a GitHub-hosted
 * runner's memory. This repo only ever runs this one jest config at a time,
 * so that specific failure mode does not apply here — but a low cap is
 * still cheap insurance on a CI runner, so it stays.
 */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["<rootDir>/test/**/*.test.ts"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.json" }],
  },
  maxWorkers: 2,
  // The tsconfig uses NodeNext, which requires `.js` extensions on relative
  // imports. ts-jest emits CommonJS, whose resolver cannot resolve those
  // specifiers against the on-disk `.ts` files. Strip the extension so jest
  // can.
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
};
