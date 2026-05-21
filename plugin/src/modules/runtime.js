// Module: runtime. Main plugin owns HTTP command polling; UI owns WebSocket events.

figma.showUI(__html__, { width: 360, height: 460 });

try {
  setupEventForwarding();
} catch (error) {
  log(`event forwarding disabled: ${error.message}`);
}

async function fetchNextCommand() {
  try {
    const response = await fetch(`${state.bridgeUrl}/commands/next`, { headers: headers() });
    const data = await response.json();
    if (!data.command) return;
    await executeCommand(data.command);
  } catch (error) {
    log(`command poll error: ${error.message}`);
  }
}

function startCommandPolling() {
  if (state.timer) clearInterval(state.timer);
  state.timer = setInterval(fetchNextCommand, 1200);
  fetchNextCommand();
  log("HTTP command polling started");
}

function stopCommandPolling() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
  log("HTTP command polling stopped");
}

figma.ui.onmessage = async (msg) => {
  if (!msg || !msg.type) return;
  if (msg.type === "configure") {
    state.bridgeUrl = msg.bridgeUrl || state.bridgeUrl;
    state.secret = msg.secret || "";
    log("configured: " + state.bridgeUrl);
    return;
  }
  if (msg.type === "startPolling") {
    state.bridgeUrl = msg.bridgeUrl || state.bridgeUrl;
    state.secret = msg.secret || "";
    startCommandPolling();
    return;
  }
  if (msg.type === "stopPolling") {
    stopCommandPolling();
    return;
  }
  if (msg.type === "pollNow") {
    await fetchNextCommand();
    return;
  }
  if (msg.type === "stop") {
    log("stopped");
    return;
  }
  if (msg.type === "command" && msg.command) {
    if (msg.bridgeUrl) state.bridgeUrl = msg.bridgeUrl;
    if (msg.secret !== undefined) state.secret = msg.secret;
    await executeCommand(msg.command);
    return;
  }
};
