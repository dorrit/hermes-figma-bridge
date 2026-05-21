function withDefaults(spec, defaults) {
  var out = {};
  var key;
  for (key in spec) out[key] = spec[key];
  for (key in defaults) {
    if (out[key] === undefined || out[key] === null) out[key] = defaults[key];
  }
  return out;
}

async function createTextNode(spec, parent) {
  const node = figma.createText();
  node.name = spec.name || "Text";
  node.fontName = await loadFont(spec.fontName || { family: "Inter", style: spec.bold ? "Bold" : "Regular" });
  node.fontSize = spec.fontSize || 32;
  if (spec.lineHeight) node.lineHeight = spec.lineHeight;
  if (spec.letterSpacing) node.letterSpacing = spec.letterSpacing;
  if (spec.textAlignHorizontal) node.textAlignHorizontal = spec.textAlignHorizontal;
  if (spec.textAlignVertical) node.textAlignVertical = spec.textAlignVertical;
  if (spec.textCase) node.textCase = spec.textCase;
  node.characters = spec.characters || spec.text || "Text";
  node.fills = makePaints(spec.fills || spec.fill || spec.color, "#111111");
  applyStyle(node, spec);
  if (spec.width) node.resize(spec.width, node.height);
  if (typeof spec.x === "number") node.x = spec.x;
  if (typeof spec.y === "number") node.y = spec.y;
  parent.appendChild(node);
  return node;
}

async function createRectangleNode(spec, parent) {
  const node = figma.createRectangle();
  node.name = spec.name || "Rectangle";
  applyGeometry(node, withDefaults(spec, { width: 100, height: 100 }));
  applyStyle(node, withDefaults(spec, { fill: "#cccccc" }));
  parent.appendChild(node);
  return node;
}

async function createEllipseNode(spec, parent) {
  const node = figma.createEllipse();
  node.name = spec.name || "Ellipse";
  applyGeometry(node, withDefaults(spec, { width: 100, height: 100 }));
  applyStyle(node, withDefaults(spec, { fill: "#cccccc" }));
  parent.appendChild(node);
  return node;
}

async function createImageNode(spec, parent) {
  if (!spec.imageBytes && !spec.imageHash) throw new Error("Image node needs imageBytes (base64) or imageHash");
  const hash = spec.imageHash || figma.createImage(bytesFromBase64(spec.imageBytes)).hash;
  const node = figma.createRectangle();
  node.name = spec.name || "Image";
  applyGeometry(node, withDefaults(spec, { width: 600, height: 600 }));
  node.fills = [{ type: "IMAGE", imageHash: hash, scaleMode: spec.scaleMode || "FILL" }];
  if (spec.strokes) node.strokes = makePaints(spec.strokes);
  if (spec.effects) node.effects = spec.effects;
  if (typeof spec.cornerRadius === "number") node.cornerRadius = spec.cornerRadius;
  parent.appendChild(node);
  return node;
}

async function createFrameFromSpec(spec, parent) {
  const frame = figma.createFrame();
  frame.name = spec.name || "Generated Frame";
  applyGeometry(frame, withDefaults(spec, { width: 1080, height: 1350 }));
  applyStyle(frame, withDefaults(spec, { fill: spec.background || "#ffffff" }));
  applyAutoLayout(frame, spec);
  parent.appendChild(frame);
  for (const child of spec.children || []) {
    await createNodeFromSpec(child, frame);
  }
  return frame;
}

async function createNodeFromSpec(spec, parent) {
  if (!spec || typeof spec !== "object") throw new Error("Invalid node spec");
  if (spec.type === "TEXT") return createTextNode(spec, parent);
  if (spec.type === "FRAME") return createFrameFromSpec(spec, parent);
  if (spec.type === "RECTANGLE") return createRectangleNode(spec, parent);
  if (spec.type === "ELLIPSE") return createEllipseNode(spec, parent);
  if (spec.type === "IMAGE") return createImageNode(spec, parent);
  throw new Error(`Unsupported spec node type: ${spec.type}`);
}

async function createFromSpec(payload) {
  await loadDefaultFonts();
  const node = await createNodeFromSpec(payload.spec, figma.currentPage);
  figma.viewport.scrollAndZoomIntoView([node]);
  return { nodeId: node.id, name: node.name };
}

async function createPromoFrame(payload) {
  await loadDefaultFonts();
  const width = payload.width || 1080;
  const spec = {
    type: "FRAME",
    name: payload.name || "AI Promo Frame",
    width,
    height: payload.height || 1350,
    fill: payload.background || "#101820",
    autoLayout: { layoutMode: "VERTICAL", paddingTop: 96, paddingRight: 72, paddingBottom: 72, paddingLeft: 72, itemSpacing: 28 },
    children: [
      { type: "TEXT", name: "Badge", text: payload.badge || "PROMO TOPUP", fontSize: 28, bold: true, fill: payload.accent || "#ffcc33" },
      { type: "TEXT", name: "Title", text: payload.title || "PROMO MLBB", fontSize: 86, bold: true, fill: payload.titleColor || "#ffffff", width: width - 144 },
      { type: "TEXT", name: "Subtitle", text: payload.subtitle || "Topup cepat, aman, dan murah.", fontSize: 36, fill: payload.textColor || "#d7e0ea", width: width - 144 },
      {
        type: "FRAME",
        name: "CTA Button",
        width: 340,
        height: 90,
        fill: payload.accent || "#ffcc33",
        cornerRadius: 999,
        autoLayout: { layoutMode: "HORIZONTAL", primaryAxisSizingMode: "AUTO", counterAxisSizingMode: "AUTO", paddingTop: 24, paddingRight: 34, paddingBottom: 24, paddingLeft: 34 },
        children: [{ type: "TEXT", name: "CTA", text: payload.cta || "ORDER SEKARANG", fontSize: 34, bold: true, fill: payload.background || "#101820" }],
      },
    ],
  };
  const frame = await createFrameFromSpec(spec, figma.currentPage);
  figma.viewport.scrollAndZoomIntoView([frame]);
  return { frameId: frame.id, name: frame.name };
}

async function createFrameSimple(payload) {
  var spec = withDefaults(payload, { type: "FRAME", fill: payload.background || payload.fill || "#ffffff" });
  spec.type = "FRAME";
  const frame = await createFrameFromSpec(spec, figma.currentPage);
  return { nodeId: frame.id };
}
