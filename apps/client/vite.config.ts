import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  // Never expose server-side env vars to the client: only VITE_-prefixed vars reach the bundle.
  envPrefix: "VITE_",
});
