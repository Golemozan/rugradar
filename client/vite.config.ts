import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// /api istekleri dev'de worker API'sine (:3000) proxy'lenir.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
