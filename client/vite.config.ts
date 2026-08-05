import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// /api istekleri dev'de worker API'sine (:3000) proxy'lenir.
//
// VITE_BASE: vitrin build'i portfolyonun altinda alt dizinde duruyor
// (ozanosio.com/rugradar/), o yuzden asset yollari koke degil o dizine
// gore uretilmeli. Verilmezse normal kok build.
export default defineConfig({
  base: process.env.VITE_BASE || "/",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
