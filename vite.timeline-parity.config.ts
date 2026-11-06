import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "es2022",
    lib: {
      entry: "packages/domain/src/timeline.ts",
      name: "TimelineParity",
      formats: ["iife"],
      fileName: () => "timeline-projection.js",
    },
    outDir: "android/app/src/androidTest/assets",
    emptyOutDir: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
