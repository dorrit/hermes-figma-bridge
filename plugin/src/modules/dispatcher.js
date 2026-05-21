// Module: dispatcher. Maps command type -> handler. Handlers come from other modules.

const HANDLERS = {
  inspectSelection,
  inspectNode,
  getColorVariables: async () => ({ variables: await getColorVariables() }),
  createFromSpec,
  createPromoFrame,
  createFrame: createFrameSimple,
  cloneAndModify,
  patchNode,
  moveNode,
  resizeNode,
  setText,
  deleteNode,
  exportNodes,
};

async function applyCommand(command) {
  const handler = HANDLERS[command.type];
  if (!handler) throw new Error(`Unknown command type: ${command.type}`);
  return handler(command.payload || {});
}

async function postResult(result) {
  if (!state.bridgeUrl) return;
  await fetch(`${state.bridgeUrl}/results`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(result),
  });
}

async function executeCommand(command) {
  log(`running ${command.type} (${command.id})`);
  try {
    const output = await applyCommand(command);
    await postResult({ id: command.id, ok: true, output });
    log(`done ${command.id}`);
    figma.ui.postMessage({
      type: "event",
      event: { type: "commandExecuted", commandId: command.id, commandType: command.type, ok: true },
    });
  } catch (error) {
    await postResult({ id: command.id, ok: false, error: error.message });
    log(`error ${command.id}: ${error.message}`);
    figma.ui.postMessage({
      type: "event",
      event: { type: "commandExecuted", commandId: command.id, commandType: command.type, ok: false, error: error.message },
    });
  }
}
