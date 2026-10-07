import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";
import { spawn, execSync, type ChildProcess } from "child_process";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "api-server-runner",
      async configureServer(server) {
        const distFile = path.resolve(import.meta.dirname, "../api-server/dist/index.mjs");
        const apiServerDir = path.resolve(import.meta.dirname, "../api-server");

        // Ensure api-server bundle exists
        if (!fs.existsSync(distFile)) {
          console.log("[api-server-runner] Compiling API server...");
          try {
            execSync("node ./build.mjs", {
              cwd: apiServerDir,
              stdio: "inherit",
            });
          } catch (err) {
            console.error("[api-server-runner] Failed to build API server:", err);
          }
        }

        // Check if API server is already running on port 5000
        const isAlreadyRunning = await fetch("http://127.0.0.1:5000/api/health")
          .then((res) => res.ok)
          .catch(() => false);

        let apiProcess: ChildProcess | null = null;

        if (!isAlreadyRunning) {
          const startServer = () => {
            if (!fs.existsSync(distFile)) return;
            apiProcess = spawn(
              "node",
              ["--enable-source-maps", distFile],
              {
                cwd: path.resolve(import.meta.dirname, "../.."),
                env: {
                  ...process.env,
                  PORT: "5000",
                  TABLELINE_DB_PATH: path.resolve(
                    import.meta.dirname,
                    "../../data/tableline_production_db.json"
                  ),
                },
                stdio: "inherit",
              }
            );

            apiProcess.on("exit", (code, signal) => {
              console.warn(`[api-server-runner] Process exited (code: ${code}, signal: ${signal})`);
              // Auto-restart if server.httpServer is still open and exit was unexpected
              if (code !== 0 && server.httpServer?.listening) {
                setTimeout(() => {
                  startServer();
                }, 1000);
              }
            });

            apiProcess.on("error", (err) => {
              console.error("[api-server-runner] Failed to spawn API process:", err);
            });
          };

          startServer();

          server.httpServer?.on("close", () => {
            try {
              apiProcess?.kill();
            } catch {}
          });

          // Wait up to 5 seconds for the API server to be healthy before handling requests
          for (let i = 0; i < 50; i++) {
            try {
              const res = await fetch("http://127.0.0.1:5000/api/health");
              if (res.ok) {
                console.log("[api-server-runner] API server ready on http://127.0.0.1:5000");
                break;
              }
            } catch {
              await new Promise((resolve) => setTimeout(resolve, 100));
            }
          }
        }
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  server: {
    port: 3000,
    host: "0.0.0.0",
    allowedHosts: true,
    hmr: false,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true,
        ws: true,
        timeout: 120000,
        proxyTimeout: 120000,
        configure: (proxy) => {
          proxy.on("error", (err, _req, res) => {
            console.warn("[vite proxy warning]:", err.message);
            if (res && "writeHead" in res && !res.headersSent) {
              res.writeHead(503, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  error: "Service initializing. Please retry shortly.",
                  code: "SERVICE_UNAVAILABLE",
                })
              );
            }
          });
        },
      },
    },
  },
  preview: {
    port: 3000,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
