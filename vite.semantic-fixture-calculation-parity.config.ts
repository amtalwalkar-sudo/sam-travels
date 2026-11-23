import { defineConfig } from "vite";
export default defineConfig({
  build: {
    lib: {
      entry: "tests/helpers/semantic-fixture-calculation-parity.ts",
      name: "SemanticFixtureCalculationParityBundle",
      formats: ["iife"],
      fileName: () => "semantic-fixture-calculation-parity.js",
    },
    outDir: "android/app/src/androidTest/assets/generated",
    emptyOutDir: false,
    sourcemap: false,
  },
});
