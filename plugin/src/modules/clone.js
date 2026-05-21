async function applyPatchToNode(node, patch = {}) {
  if (!patch || typeof patch !== "object") return;
  if (typeof patch.name === "string") node.name = patch.name;
  if (typeof patch.x === "number") node.x = patch.x;
  if (typeof patch.y === "number") node.y = patch.y;
  if ("resize" in node && (patch.width || patch.height)) node.resize(patch.width || node.width, patch.height || node.height);
  if ("fills" in node && (patch.fill || patch.fills || patch.background)) node.fills = makePaints(patch.fills || patch.fill || patch.background);
  if ("strokes" in node && (patch.stroke || patch.strokes)) node.strokes = makePaints(patch.strokes || patch.stroke);
  if ("strokeWeight" in node && typeof patch.strokeWeight === "number") node.strokeWeight = patch.strokeWeight;
  if ("effects" in node && Array.isArray(patch.effects)) node.effects = patch.effects;
  if ("cornerRadius" in node && typeof patch.cornerRadius === "number") node.cornerRadius = patch.cornerRadius;
  if (node.type === "TEXT") {
    if (patch.fontName) node.fontName = await loadFont(patch.fontName);
    else await loadFont(node.fontName);
    if (typeof patch.text === "string" || typeof patch.characters === "string") node.characters = typeof patch.text === "string" ? patch.text : patch.characters;
    if (typeof patch.fontSize === "number") node.fontSize = patch.fontSize;
    if (patch.lineHeight) node.lineHeight = patch.lineHeight;
    if (patch.letterSpacing) node.letterSpacing = patch.letterSpacing;
    if (patch.textAlignHorizontal) node.textAlignHorizontal = patch.textAlignHorizontal;
    if (patch.textAlignVertical) node.textAlignVertical = patch.textAlignVertical;
  }
  if (patch.variableBindings) applyVariableBinding(node, { variableBindings: patch.variableBindings });
}

function findChildByName(parent, name) {
  if (!("children" in parent)) return null;
  for (const child of parent.children) {
    if (child.name === name) return child;
    if ("children" in child) {
      const nested = findChildByName(child, name);
      if (nested) return nested;
    }
  }
  return null;
}

function resolveTarget(root, target) {
  if (!target) return root;
  if (target.nodeId) return findNode(target.nodeId);
  if (target.byName) {
    const node = findChildByName(root, target.byName);
    if (!node) throw new Error(`Child not found by name: ${target.byName}`);
    return node;
  }
  return root;
}

async function cloneAndModify(payload) {
  await loadDefaultFonts();
  const source = findNode(payload.sourceNodeId);
  if (!("clone" in source)) throw new Error("Source node cannot be cloned");
  const clone = source.clone();
  if (typeof payload.name === "string") clone.name = payload.name;
  if (typeof payload.x === "number") clone.x = payload.x;
  if (typeof payload.y === "number") clone.y = payload.y;
  if (source.parent) source.parent.appendChild(clone);
  else figma.currentPage.appendChild(clone);

  for (const change of payload.changes || []) {
    const target = resolveTarget(clone, change.target);
    await applyPatchToNode(target, change.patch);
  }
  figma.viewport.scrollAndZoomIntoView([clone]);
  return { nodeId: clone.id, name: clone.name };
}

async function patchNode(payload) {
  const node = findNode(payload.nodeId);
  await applyPatchToNode(node, payload.patch || {});
  return { nodeId: node.id };
}
