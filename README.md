# Hermes Figma Bridge

Local bridge + modular Figma plugin that lets an AI agent design directly in the Figma canvas.

```txt
Hermes / AI Agent
  -> local HTTP bridge
  -> Figma plugin (modular handlers)
  -> direct canvas manipulation
```

## Project layout

```txt
hermes-figma-bridge/
  bridge/
    server.js          local HTTP queue
    send-command.js    CLI helper to send JSON commands
  plugin/
    manifest.json
    src/
      ui.html
      code.js          AUTO-GENERATED. Run `npm run build` after editing modules.
      modules/
        utils.js       paints, fonts, geometry, base64, variable bindings
        inspect.js     summarize selection/node, list color variables
        creators.js    createFromSpec for FRAME/TEXT/RECTANGLE/ELLIPSE/IMAGE + promo helper
        clone.js       cloneAndModify, patchNode (deep style/text patching)
        exportOps.js   exportNodes, moveNode, resizeNode, setText, deleteNode
        dispatcher.js  command -> handler map + polling loop
        runtime.js     UI message wiring (start/stop polling)
  scripts/
    build-plugin.js    concatenates modules into plugin/src/code.js
  examples/
    *.json             ready-to-send command payloads
```

## Run the bridge

```bash
cd hermes-figma-bridge
HOST=localhost PORT=3131 npm run bridge
PORT=3131 npm run bridge
```

Optional shared secret:

```bash
FIGMA_BRIDGE_SECRET=my-secret PORT=3131 npm run bridge
```

## Build & install plugin in Figma

```bash
npm run build           # rebuild plugin/src/code.js from modules
```

In Figma (or `figma-linux`):

1. `Plugins -> Development -> Import plugin from manifest...`
2. Choose `<repo>/plugin/manifest.json`
3. Run `Hermes Canvas Bridge`
4. Bridge URL: `http://localhost:3131`
5. Keep `WebSocket events` and `HTTP poll commands` checked, then click `Start`

## How AI design works

The plugin is the hand. The AI agent is the brain. Typical loop:

1. Agent calls `inspectSelection` (or `inspectNode`) to read example frames.
2. Agent calls `getColorVariables` to read local color tokens.
3. Agent generates a JSON design spec.
4. Agent calls `createFromSpec` (or `cloneAndModify`) to produce the design.
5. Agent calls `exportNodes` to get PNG/JPG bytes back if needed.

Quick test:

```bash
FIGMA_BRIDGE_URL=http://localhost:3131 npm run send -- examples/inspect-selection.json
FIGMA_BRIDGE_URL=http://localhost:3131 npm run send -- examples/get-color-variables.json
FIGMA_BRIDGE_URL=http://localhost:3131 npm run send -- examples/dynamic-spec.json
FIGMA_BRIDGE_URL=http://localhost:3131 npm run send -- examples/spec-with-effects.json
```

Read result:

```bash
curl http://localhost:3131/results/<command-id>
```

## Command reference

### Inspection

`inspectSelection`

```json
{ "type": "inspectSelection", "payload": { "maxDepth": 4 } }
```

`inspectNode`

```json
{ "type": "inspectNode", "payload": { "nodeId": "1:2", "maxDepth": 4 } }
```

`getColorVariables`

```json
{ "type": "getColorVariables", "payload": {} }
```

### Creation

`createFromSpec` supports `FRAME`, `TEXT`, `RECTANGLE`, `ELLIPSE`, and `IMAGE` (base64 image bytes). Each node accepts `fill`, `fills`, `strokes`, `effects`, `cornerRadius`, `opacity`, `rotation`, `autoLayout`, and `variableBindings`.

```json
{
  "type": "createFromSpec",
  "payload": {
    "spec": {
      "type": "FRAME",
      "name": "AI Generated",
      "width": 1080,
      "height": 1350,
      "fills": [
        {
          "type": "GRADIENT_LINEAR",
          "gradientTransform": [[1, 0, 0], [0, 1, 0]],
          "stops": [
            { "position": 0, "color": "#1a1a2e" },
            { "position": 1, "color": "#e94560" }
          ]
        }
      ],
      "effects": [
        { "type": "DROP_SHADOW", "color": { "r": 0, "g": 0, "b": 0, "a": 0.4 }, "offset": { "x": 0, "y": 16 }, "radius": 32, "spread": 0, "visible": true, "blendMode": "NORMAL" }
      ],
      "autoLayout": { "layoutMode": "VERTICAL", "paddingTop": 96, "paddingRight": 72, "paddingBottom": 72, "paddingLeft": 72, "itemSpacing": 28 },
      "children": [
        { "type": "TEXT", "name": "Headline", "text": "PROMO", "fontSize": 84, "bold": true, "fill": "#ffffff" },
        { "type": "ELLIPSE", "name": "Decor", "width": 200, "height": 200, "fill": "#ffd84d" },
        { "type": "IMAGE", "name": "Hero", "width": 936, "height": 520, "imageBytes": "<base64 image>", "scaleMode": "FILL", "cornerRadius": 32 }
      ]
    }
  }
}
```

`createPromoFrame` and `createFrame` are kept for quick presets.

### Modification

`cloneAndModify` clones an existing node and patches its children by name or id.

```json
{
  "type": "cloneAndModify",
  "payload": {
    "sourceNodeId": "1:23",
    "name": "Promo Variant FF",
    "x": 1200,
    "changes": [
      { "target": { "byName": "Title" }, "patch": { "text": "PROMO FREE FIRE", "fill": "#ffffff" } },
      { "target": { "byName": "CTA" }, "patch": { "text": "ORDER FF" } }
    ]
  }
}
```

`patchNode` patches a single node directly.

```json
{
  "type": "patchNode",
  "payload": {
    "nodeId": "1:24",
    "patch": { "text": "Diamond Murah", "fontSize": 72, "fill": "#ffd84d" }
  }
}
```

`moveNode`, `resizeNode`, `setText`, `deleteNode` cover smaller atomic ops.

### Variable binding

Use Figma color variables instead of raw hex:

```json
{
  "type": "patchNode",
  "payload": {
    "nodeId": "1:24",
    "patch": {
      "variableBindings": [
        { "field": "fills", "variableId": "VariableID:1:9" }
      ]
    }
  }
}
```

Get variable IDs from `getColorVariables`.

### Export

`exportNodes` returns base64 image bytes that the agent can write to disk or upload elsewhere.

```json
{
  "type": "exportNodes",
  "payload": {
    "nodeIds": ["1:23"],
    "settings": { "format": "PNG", "constraint": { "type": "SCALE", "value": 2 } }
  }
}
```

## Modular plugin

Logic is split into small files under `plugin/src/modules/`. After editing any module, rebuild:

```bash
npm run build
```

This regenerates `plugin/src/code.js` (the file Figma actually loads). Import the plugin again in Figma if you change `manifest.json`.

## Notes

- Figma must be open and the plugin must be running; this is not a background REST API worker.
- Text editing always loads the requested font via `figma.loadFontAsync`.
- The bridge defaults to `localhost`. Avoid `127.0.0.1` because Figma's `allowedDomains` does not accept it.
- Polling is intentional and simple. Swap to WebSocket later if you need real-time control.
