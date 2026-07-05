import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: "src/renderer",
  base: "./",
  build: {
    outDir: "../../dist/renderer",
    emptyOutDir: true
  },
  resolve: {
    alias: {
      "@renderer": resolve(__dirname, "src/renderer"),
      "@types": resolve(__dirname, "src/types")
    }
  },
  server: {
    port: 5173,
    strictPort: false
  }
});
