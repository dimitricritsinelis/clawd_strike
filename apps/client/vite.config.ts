import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5174,
    strictPort: true
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three"],
        },
      },
    },
  },
});
