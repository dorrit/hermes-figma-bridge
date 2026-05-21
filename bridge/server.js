const http = require("node:http");
const crypto = require("node:crypto");
const { WebSocketServer } = require("./ws.js");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const SHARED_SECRET = process.env.FIGMA_BRIDGE_SECRET || "";
const queue = [];
const inFlight = new Map();
const results = new Map();
const eventLog = [];
const EVENT_LOG_MAX = 200;
const COMMAND_LEASE_MS = Number(process.env.COMMAND_LEASE_MS || 8000);

const wss = new WebSocketServer();

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,x-figma-bridge-secret",
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 4 * 1024 * 1024) {
        reject(new Error("Body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function authorized(req) {
  if (!SHARED_SECRET) return true;
  const headerSecret = req.headers["x-figma-bridge-secret"];
  if (headerSecret === SHARED_SECRET) return true;
  // also allow ?secret= for WS upgrade convenience
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    return url.searchParams.get("secret") === SHARED_SECRET;
  } catch {
    return false;
  }
}

function normalizeCommand(input) {
  if (!input || typeof input !== "object") throw new Error("Command body must be an object");
  if (!input.type || typeof input.type !== "string") throw new Error("Command needs a string type");
  return {
    id: input.id || crypto.randomUUID(),
    type: input.type,
    payload: input.payload || {},
    createdAt: new Date().toISOString(),
  };
}

function recordEvent(event) {
  const stamped = { ...event, receivedAt: new Date().toISOString() };
  eventLog.push(stamped);
  if (eventLog.length > EVENT_LOG_MAX) eventLog.splice(0, eventLog.length - EVENT_LOG_MAX);
  wss.broadcast(JSON.stringify({ kind: "event", event: stamped }), (client) => client.meta.role === "subscriber");
  return stamped;
}

function requeueExpiredCommands() {
  const now = Date.now();
  for (const [id, entry] of inFlight.entries()) {
    if (now - entry.startedAt >= COMMAND_LEASE_MS) {
      inFlight.delete(id);
      queue.unshift(entry.command);
      recordEvent({ type: "commandLeaseExpired", commandId: id, commandType: entry.command.type });
      wss.broadcast(JSON.stringify({ kind: "wake", commandType: entry.command.type }), (client) => client.meta.role === "plugin");
    }
  }
}

function nextCommand() {
  requeueExpiredCommands();
  const command = queue.shift() || null;
  if (command) inFlight.set(command.id, { command, startedAt: Date.now() });
  return command;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return json(res, 200, { ok: true });
  if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized" });

  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method === "GET" && url.pathname === "/health") {
      return json(res, 200, {
        ok: true,
        queued: queue.length,
        inFlight: inFlight.size,
        results: results.size,
        events: eventLog.length,
        wsClients: wss.clients.size,
      });
    }

    if (req.method === "POST" && url.pathname === "/command") {
      const command = normalizeCommand(await readBody(req));
      queue.push(command);
      // notify plugin clients there's new work
      wss.broadcast(JSON.stringify({ kind: "wake", commandType: command.type }), (client) => client.meta.role === "plugin");
      return json(res, 202, { ok: true, command });
    }

    if (req.method === "GET" && url.pathname === "/commands/next") {
      const command = nextCommand();
      return json(res, 200, { ok: true, command });
    }

    if (req.method === "POST" && url.pathname === "/results") {
      const result = await readBody(req);
      if (!result.id) return json(res, 400, { ok: false, error: "Result needs command id" });
      const stamped = { ...result, receivedAt: new Date().toISOString() };
      inFlight.delete(result.id);
      results.set(result.id, stamped);
      // also push as an event so subscribers can react
      recordEvent({ type: "commandResult", commandId: result.id, ok: result.ok, output: result.output, error: result.error });
      return json(res, 200, { ok: true });
    }

    if (req.method === "POST" && url.pathname === "/events") {
      const event = await readBody(req);
      if (!event.type) return json(res, 400, { ok: false, error: "Event needs type" });
      recordEvent(event);
      return json(res, 200, { ok: true });
    }

    if (req.method === "GET" && url.pathname === "/events") {
      const since = Number(url.searchParams.get("since") || 0);
      const slice = since ? eventLog.slice(-since) : eventLog.slice();
      return json(res, 200, { ok: true, events: slice });
    }

    if (req.method === "GET" && url.pathname.startsWith("/results/")) {
      const id = decodeURIComponent(url.pathname.slice("/results/".length));
      return json(res, 200, { ok: true, result: results.get(id) || null });
    }

    return json(res, 404, { ok: false, error: "Not found" });
  } catch (error) {
    return json(res, 400, { ok: false, error: error.message });
  }
});

server.on("upgrade", (req, socket, head) => {
  if (!authorized(req)) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname !== "/ws") {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head);
  // attach role from query string after upgrade
  setImmediate(() => {
    const role = url.searchParams.get("role") || "subscriber";
    for (const client of wss.clients) {
      if (!client.meta.role && client.socket === socket) client.meta.role = role;
    }
  });
});

wss.on("connection", (client, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  client.meta.role = url.searchParams.get("role") || "subscriber";
  client.send(JSON.stringify({ kind: "hello", clientId: client.id, role: client.meta.role }));
});

wss.on("message", (client, message) => {
  try {
    const data = JSON.parse(message);
    if (data.kind === "event" && client.meta.role === "plugin") {
      recordEvent(data.event || data);
    } else if (data.kind === "ping") {
      client.send(JSON.stringify({ kind: "pong", at: Date.now() }));
    }
  } catch {
    // ignore
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Figma bridge ready at http://${HOST}:${PORT}`);
  console.log(`WebSocket events at ws://${HOST}:${PORT}/ws`);
  console.log("HTTP: POST /command, GET /commands/next, POST /results, POST /events");
  console.log("WS roles: ?role=plugin (push events), ?role=subscriber (receive events)");
});
