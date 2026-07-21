import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(currentDirectory, "../..");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDirectory, "");

  return {
    envDir: rootDirectory,
    server: {
      port: Number(env.WEB_PORT ?? 5173),
    },
    plugins: [tanstackStart(), viteReact(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(currentDirectory, "src"),
      },
    },
  };
});
