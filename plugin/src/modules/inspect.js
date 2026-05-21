function firstSolidHex(node, property) {
  const paints = node[property];
  if (!Array.isArray(paints)) return null;
  const solidPaint = paints.find((paint) => paint.type === "SOLID");
  return toHex(solidPaint);
}

function summarizeVariableBindings(node) {
  const boundVariables = node.boundVariables || {};
  const output = {};
  for (const key of Object.keys(boundVariables)) {
    const value = boundVariables[key];
    output[key] = Array.isArray(value)
      ? value.map((entry) => ({ id: entry.id, type: entry.type }))
      : { id: value.id, type: value.type };
  }
  return output;
}

function summarizeNode(node, depth = 0, maxDepth = 3) {
  const summary = { id: node.id, name: node.name, type: node.type };

  if ("x" in node) summary.x = node.x;
  if ("y" in node) summary.y = node.y;
  if ("width" in node) summary.width = node.width;
  if ("height" in node) summary.height = node.height;
  if ("opacity" in node) summary.opacity = node.opacity;
  if ("rotation" in node) summary.rotation = node.rotation;
  if ("fills" in node) summary.fill = firstSolidHex(node, "fills");
  if ("strokes" in node) summary.stroke = firstSolidHex(node, "strokes");
  if ("effects" in node) summary.effects = node.effects;
  if ("cornerRadius" in node && typeof node.cornerRadius === "number") summary.cornerRadius = node.cornerRadius;
  if (node.boundVariables) summary.boundVariables = summarizeVariableBindings(node);
  if ("layoutMode" in node) {
    summary.autoLayout = {
      layoutMode: node.layoutMode,
      primaryAxisSizingMode: node.primaryAxisSizingMode,
      counterAxisSizingMode: node.counterAxisSizingMode,
      primaryAxisAlignItems: node.primaryAxisAlignItems,
      counterAxisAlignItems: node.counterAxisAlignItems,
      itemSpacing: node.itemSpacing,
      paddingTop: node.paddingTop,
      paddingRight: node.paddingRight,
      paddingBottom: node.paddingBottom,
      paddingLeft: node.paddingLeft,
    };
  }
  if (node.type === "TEXT") {
    summary.text = node.characters;
    summary.fontSize = node.fontSize;
    summary.fontName = node.fontName;
    summary.lineHeight = node.lineHeight;
    summary.letterSpacing = node.letterSpacing;
    summary.textAlignHorizontal = node.textAlignHorizontal;
    summary.textAlignVertical = node.textAlignVertical;
  }
  if ("children" in node && depth < maxDepth) {
    summary.children = node.children.map((child) => summarizeNode(child, depth + 1, maxDepth));
  }
  return summary;
}

async function getColorVariables() {
  const locals = await figma.variables.getLocalVariablesAsync("COLOR");
  return locals.map((variable) => ({
    id: variable.id,
    key: variable.key,
    name: variable.name,
    collectionId: variable.variableCollectionId,
    resolvedType: variable.resolvedType,
    valuesByMode: variable.valuesByMode,
  }));
}

async function inspectSelection(payload) {
  return { selection: figma.currentPage.selection.map((node) => summarizeNode(node, 0, payload.maxDepth || 3)) };
}

async function inspectNode(payload) {
  return summarizeNode(findNode(payload.nodeId), 0, payload.maxDepth || 3);
}
