async function exportNodes(payload) {
  const ids = payload.nodeIds && payload.nodeIds.length ? payload.nodeIds : (payload.nodeId ? [payload.nodeId] : []);
  if (!ids.length) throw new Error("exportNodes needs nodeId or nodeIds");
  const settings = payload.settings || { format: "PNG", constraint: { type: "SCALE", value: 1 } };
  const exports = [];
  for (const id of ids) {
    const node = findNode(id);
    if (typeof node.exportAsync !== "function") throw new Error(`Node not exportable: ${id}`);
    const bytes = await node.exportAsync(settings);
    let base64 = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      base64 += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    exports.push({ nodeId: id, name: node.name, format: settings.format, base64: btoa(base64) });
  }
  return { exports };
}

function moveNode(payload) {
  const node = findNode(payload.nodeId);
  if (typeof payload.x === "number") node.x = payload.x;
  if (typeof payload.y === "number") node.y = payload.y;
  return { nodeId: node.id, x: node.x, y: node.y };
}

function resizeNode(payload) {
  const node = findNode(payload.nodeId);
  if (!("resize" in node)) throw new Error("Node is not resizable");
  node.resize(payload.width, payload.height);
  return { nodeId: node.id, width: node.width, height: node.height };
}

async function setText(payload) {
  const node = payload.nodeId ? findNode(payload.nodeId) : figma.createText();
  if (node.type !== "TEXT") throw new Error("Node is not text");
  node.fontName = await loadFont(payload.fontName || node.fontName);
  node.characters = payload.characters || "";
  if (!payload.nodeId) figma.currentPage.appendChild(node);
  return { nodeId: node.id };
}

function deleteNode(payload) {
  const node = findNode(payload.nodeId);
  node.remove();
  return { nodeId: payload.nodeId };
}
