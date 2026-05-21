const http = require("node:http");
const fs = require("node:fs");

const BRIDGE_URL = process.env.FIGMA_BRIDGE_URL || 'http://localhost:3131';
const SHARED_SECRET = process.env.FIGMA_BRIDGE_SECRET || "";

function usage() {
  console.error(
    "Usage: node bridge/send-command.js <command.json | json-string>",
  );
  process.exit(1);
}

function loadInput(arg) {
  if (!arg) usage();
  const raw = fs.existsSync(arg) ? fs.readFileSync(arg, "utf8") : arg;
  return JSON.parse(raw);
}

function postJson(path, body) {
  const url = new URL(path, BRIDGE_URL);
  const payload = JSON.stringify(body);
  const headers = {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  };
  if (SHARED_SECRET) headers["x-figma-bridge-secret"] = SHARED_SECRET;

  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: "POST", headers }, (res) => {
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () =>
        resolve({ status: res.statusCode, body: raw ? JSON.parse(raw) : null }),
      );
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

postJson("/command", loadInput(process.argv[2]))
  .then((response) => {
    console.log(JSON.stringify(response.body, null, 2));
    process.exit(response.status >= 200 && response.status < 300 ? 0 : 1);
  })
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
