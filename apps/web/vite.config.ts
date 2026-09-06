import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import packageJson from "../../package.json" with { type: "json" };

const buildIdentifier = process.env.GIT_SHA?.slice(0, 7) || "development";

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(`${packageJson.version}+${buildIdentifier}`),
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
