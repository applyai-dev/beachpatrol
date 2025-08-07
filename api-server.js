import http from "http";
import { exec, spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

const port = 3000;
const profileName = Date.now().toString();

// --- Socket Path Definition ---
const HOME_DIR = os.homedir();
const DATA_DIR = process.env.XDG_DATA_HOME || path.join(HOME_DIR, ".local/share");
const SOCKET_PATH = `${DATA_DIR}/beachpatrol/beachpatrol.sock`;

// --- Wait for Socket Function ---
function waitForSocket(socketPath, timeout = 45000) {
  // Increased timeout for browser startup
  return new Promise((resolve, reject) => {
    console.log(`Waiting for socket at ${socketPath}...`);
    const startTime = Date.now();
    const interval = setInterval(() => {
      if (fs.existsSync(socketPath)) {
        clearInterval(interval);
        console.log("Socket found!");
        resolve();
      } else if (Date.now() - startTime > timeout) {
        clearInterval(interval);
        reject(new Error(`Socket not found after ${timeout / 1000} seconds.`));
      }
    }, 500); // Check every 500ms
  });
}

// --- Main Application Logic ---
async function main() {
  // Start beachpatrol in the background
  const beachpatrol = spawn("node", ["beachpatrol.js", "--profile", profileName, "--headless"], {
    detached: true,
    stdio: "inherit", // Use inherit to see logs from beachpatrol during startup
  });
  beachpatrol.unref();
  console.log(`beachpatrol process started with profile: ${profileName}`);

  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/visit/") && req.method === "GET") {
      let urlToVisit = req.url.substring("/visit/".length);

      if (!urlToVisit) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "URL is missing from path" }));
        return;
      }

      if (!/^https?:\/\//i.test(urlToVisit)) {
        urlToVisit = "https://" + urlToVisit;
      }

      exec(`node beachmsg.js visit "${urlToVisit}"`, (error, stdout, stderr) => {
        if (error) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: stderr }));
          return;
        }

        const trimmedstdout = stdout.trim();
        if (!trimmedstdout) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Received an empty response from beachmsg", details: stderr }));
          return;
        }

        try {
          const jsonData = JSON.parse(trimmedstdout);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(jsonData));
        } catch (e) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Failed to parse beachmsg output", details: e.message, raw_output: stdout }));
        }
      });
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not Found. Use /visit/<url>" }));
    }
  });

  try {
    await waitForSocket(SOCKET_PATH);
    server.listen(port, () => {
      console.log(`API Server listening on http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Failed to start API server:", error.message);
    // Ensure the orphaned beachpatrol process is killed
    if (beachpatrol.pid) {
      process.kill(beachpatrol.pid, "SIGTERM");
    }
    process.exit(1);
  }

  process.on("SIGINT", () => {
    console.log("\nGracefully shutting down...");
    server.close(() => {
      exec(`pgrep -f "beachpatrol.js --profile ${profileName}"`, (err, stdout, stderr) => {
        if (stdout) {
          const pid = stdout.trim();
          console.log(`Killing beachpatrol process with PID: ${pid}`);
          process.kill(pid, "SIGTERM");
        }
        process.exit(0);
      });
    });
  });
}

main();
