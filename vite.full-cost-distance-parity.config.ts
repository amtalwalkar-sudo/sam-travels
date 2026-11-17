import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "es2022",
    lib: {
      entry: "packages/application/src/full-cost-breakeven-work-distance.ts",
      name: "FullCostWorkDistanceParity",
      formats: ["iife"],
      fileName: () => "full-cost-work-distance-projection.js",
    },
    outDir: "android/app/src/androidTest/assets",
    emptyOutDir: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
