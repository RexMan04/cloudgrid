import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Web Bluetooth requires a secure context; http://localhost qualifies.
export default defineConfig({
  plugins: [react()],
  // Bind localhost only — not exposed to the LAN or internet. WSL2 forwards
  // localhost to Windows, so http://localhost:5173 still works from a Windows
  // browser. (localhost is also a valid secure context for Web Bluetooth.)
  server: { port: 5173, host: "127.0.0.1" },
});
