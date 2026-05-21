const state = {
  bridgeUrl: "http://localhost:3131",
  secret: "",
  timer: null,
};

function log(message) {
  figma.ui.postMessage({ type: "log", message });
}

function headers() {
  const value = { "content-type": "application/json" };
  if (state.secret) value["x-figma-bridge-secret"] = state.secret;
  return value;
}

async function loadFont(fontName) {
  if (fontName && typeof fontName === "object" && fontName.family && fontName.style) {
    await figma.loadFontAsync(fontName);
    return fontName;
  }
  const fallback = { family: "Inter", style: "Regular" };
  await figma.loadFontAsync(fallback);
  return fallback;
}

async function loadDefaultFonts() {
  await loadFont({ family: "Inter", style: "Regular" });
  await loadFont({ family: "Inter", style: "Bold" });
}

function findNode(id) {
  const node = figma.getNodeById(id);
  if (!node) throw new Error(`Node not found: ${id}`);
  return node;
}

function toHex(paint) {
  if (!paint || paint.type !== "SOLID" || !paint.color) return null;
  const channel = (value) => Math.round(value * 255).toString(16).padStart(2, "0");
  return `#${channel(paint.color.r)}${channel(paint.color.g)}${channel(paint.color.b)}`;
}

function solid(hex) {
  const clean = String(hex || "#ffffff").replace("#", "");
  const n = Number.parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16);
  return { type: "SOLID", color: { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 } };
}

function gradient(spec) {
  var stops = spec.stops || [
    { position: 0, color: "#000000" },
    { position: 1, color: "#ffffff" },
  ];
  return {
    type: spec.gradientType || spec.type || "GRADIENT_LINEAR",
    gradientTransform: spec.gradientTransform || [
      [1, 0, 0],
      [0, 1, 0],
    ],
    gradientStops: stops.map(function (stop) {
      var color = solid(stop.color).color;
      return {
        position: stop.position,
        color: { r: color.r, g: color.g, b: color.b, a: stop.opacity !== undefined ? stop.opacity : 1 },
      };
    }),
  };
}

function bindPaintVariable(paint, variableId, field) {
  if (!variableId || !figma.variables || typeof figma.variables.setBoundVariableForPaint !== "function") return paint;
  var variable = figma.variables.getVariableById(variableId);
  if (!variable) throw new Error(`Variable not found: ${variableId}`);
  return figma.variables.setBoundVariableForPaint(paint, field || "color", variable);
}

function makePaint(spec) {
  if (!spec) return solid("#ffffff");
  if (typeof spec === "string") return solid(spec);
  var paint;
  if (spec.type === "SOLID" || spec.variableId) paint = solid(spec.color || spec.hex || "#ffffff");
  else if (String(spec.type || "").indexOf("GRADIENT") === 0) paint = gradient(spec);
  else paint = solid(spec.color || spec.hex || "#ffffff");
  return bindPaintVariable(paint, spec.variableId, spec.variableField || "color");
}

function makePaints(value, fallback) {
  var source = value !== undefined && value !== null ? value : fallback;
  if (Array.isArray(source)) return source.map(makePaint);
  return [makePaint(source)];
}

function applyVariableBinding(node, spec) {
  if (!spec.variableBindings) return;
  for (const binding of spec.variableBindings) {
    if (binding.field === "fills" && "fills" in node) {
      var fillPaints = node.fills && Array.isArray(node.fills) ? node.fills.slice() : makePaints(spec.fills || spec.fill || spec.background, "#ffffff");
      node.fills = fillPaints.map(function (paint) { return bindPaintVariable(paint, binding.variableId, binding.variableField || "color"); });
    } else if (binding.field === "strokes" && "strokes" in node) {
      var strokePaints = node.strokes && Array.isArray(node.strokes) ? node.strokes.slice() : makePaints(spec.strokes || spec.stroke, "#000000");
      node.strokes = strokePaints.map(function (paint) { return bindPaintVariable(paint, binding.variableId, binding.variableField || "color"); });
    } else if (typeof node.setBoundVariable === "function") {
      const variable = figma.variables.getVariableById(binding.variableId);
      if (!variable) throw new Error(`Variable not found: ${binding.variableId}`);
      node.setBoundVariable(binding.field, variable);
    }
  }
}

function applyGeometry(node, spec) {
  if ("resize" in node && (spec.width || spec.height)) node.resize(spec.width || node.width, spec.height || node.height);
  if ("x" in node && typeof spec.x === "number") node.x = spec.x;
  if ("y" in node && typeof spec.y === "number") node.y = spec.y;
  if ("opacity" in node && typeof spec.opacity === "number") node.opacity = spec.opacity;
  if ("rotation" in node && typeof spec.rotation === "number") node.rotation = spec.rotation;
  if ("cornerRadius" in node && typeof spec.cornerRadius === "number") node.cornerRadius = spec.cornerRadius;
}

function applyStyle(node, spec) {
  if ("fills" in node && (spec.fill || spec.fills || spec.background)) node.fills = makePaints(spec.fills || spec.fill || spec.background);
  if ("strokes" in node && (spec.stroke || spec.strokes)) node.strokes = makePaints(spec.strokes || spec.stroke);
  if ("strokeWeight" in node && typeof spec.strokeWeight === "number") node.strokeWeight = spec.strokeWeight;
  if ("effects" in node && Array.isArray(spec.effects)) node.effects = spec.effects;
  applyVariableBinding(node, spec);
}

function applyAutoLayout(frame, spec) {
  if (!spec.autoLayout) return;
  frame.layoutMode = spec.autoLayout.layoutMode || "VERTICAL";
  frame.primaryAxisSizingMode = spec.autoLayout.primaryAxisSizingMode || "FIXED";
  frame.counterAxisSizingMode = spec.autoLayout.counterAxisSizingMode || "FIXED";
  frame.primaryAxisAlignItems = spec.autoLayout.primaryAxisAlignItems || frame.primaryAxisAlignItems;
  frame.counterAxisAlignItems = spec.autoLayout.counterAxisAlignItems || frame.counterAxisAlignItems;
  frame.itemSpacing = spec.autoLayout.itemSpacing || 0;
  frame.paddingTop = spec.autoLayout.paddingTop || 0;
  frame.paddingRight = spec.autoLayout.paddingRight || 0;
  frame.paddingBottom = spec.autoLayout.paddingBottom || 0;
  frame.paddingLeft = spec.autoLayout.paddingLeft || 0;
}

function bytesFromBase64(data) {
  const clean = String(data || "").replace(/^data:[^,]+,/, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
