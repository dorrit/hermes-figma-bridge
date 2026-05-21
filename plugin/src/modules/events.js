// Module: events. Watches selection/page changes and forwards to UI for WS push.

function emitEvent(event) {
  figma.ui.postMessage({ type: "event", event });
}

function safeOn(eventName, handler) {
  try {
    figma.on(eventName, handler);
    log(`event listener enabled: ${eventName}`);
  } catch (error) {
    log(`event listener skipped: ${eventName} (${error.message})`);
  }
}

function setupEventForwarding() {
  safeOn("selectionchange", () => {
    const summaries = figma.currentPage.selection.map((node) => ({
      id: node.id,
      name: node.name,
      type: node.type,
      width: "width" in node ? node.width : null,
      height: "height" in node ? node.height : null,
    }));
    emitEvent({ type: "selectionChanged", selection: summaries, page: figma.currentPage.name });
  });

  safeOn("currentpagechange", () => {
    emitEvent({ type: "pageChanged", page: figma.currentPage.name, pageId: figma.currentPage.id });
  });

  safeOn("documentchange", (e) => {
    const counts = { CREATE: 0, DELETE: 0, PROPERTY_CHANGE: 0, STYLE_CREATE: 0, STYLE_DELETE: 0, STYLE_PROPERTY_CHANGE: 0 };
    const changes = e && Array.isArray(e.documentChanges) ? e.documentChanges : [];
    for (const change of changes) {
      if (counts[change.type] !== undefined) counts[change.type] += 1;
    }
    emitEvent({ type: "documentChanged", counts });
  });
}
