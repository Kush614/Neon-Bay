import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  // Never expose server-side env vars to the client: only VITE_-prefixed vars reach the bundle.
  envPrefix: "VITE_",
  // Two pages: the game and the About page.
  build: {
    rollupOptions: {
      input: { main: fileURLToPath(new URL("index.html", import.meta.url)), about: fileURLToPath(new URL("about.html", import.meta.url)) },
    },
  },
});
