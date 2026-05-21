// WebSocket subscriber for testing. Connects to bridge and prints events.
// Usage: node bridge/subscribe.js [bridgeUrl]
//        FIGMA_BRIDGE_SECRET=... node bridge/subscribe.js

const url = (process.argv[2] || process.env.FIGMA_BRIDGE_URL || "http://localhost:3131").replace(/^http/, "ws");
const secret = process.env.FIGMA_BRIDGE_SECRET || "";
const wsUrl = url + "/ws?role=subscriber" + (secret ? "&secret=" + encodeURIComponent(secret) : "");

console.log("Connecting to", wsUrl);
const ws = new WebSocket(wsUrl);

ws.addEventListener("open", () => console.log("[open] subscribed"));
ws.addEventListener("message", (e) => {
  try {
    const msg = JSON.parse(e.data);
    console.log(JSON.stringify(msg, null, 2));
  } catch {
    console.log(e.data);
  }
});
ws.addEventListener("close", () => {
  console.log("[close]");
  process.exit(0);
});
ws.addEventListener("error", (e) => console.error("[error]", e.message || e));
