// Minimal RFC6455 WebSocket server. No external deps.
// Supports text frames, ping/pong, close. Good enough for local agent bridge.

const crypto = require("node:crypto");

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function acceptKey(secWebSocketKey) {
  return crypto.createHash("sha1").update(secWebSocketKey + GUID).digest("base64");
}

function encodeFrame(data, opcode = 0x1) {
  const payload = Buffer.from(typeof data === "string" ? data : JSON.stringify(data), "utf8");
  const length = payload.length;
  let header;
  if (length < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode;
    header[1] = length;
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  return Buffer.concat([header, payload]);
}

function decodeFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (offset < buffer.length) {
    if (buffer.length - offset < 2) break;
    const byte1 = buffer[offset];
    const byte2 = buffer[offset + 1];
    const fin = (byte1 & 0x80) !== 0;
    const opcode = byte1 & 0x0f;
    const masked = (byte2 & 0x80) !== 0;
    let length = byte2 & 0x7f;
    let cursor = offset + 2;

    if (length === 126) {
      if (buffer.length - cursor < 2) break;
      length = buffer.readUInt16BE(cursor);
      cursor += 2;
    } else if (length === 127) {
      if (buffer.length - cursor < 8) break;
      length = Number(buffer.readBigUInt64BE(cursor));
      cursor += 8;
    }

    let mask = null;
    if (masked) {
      if (buffer.length - cursor < 4) break;
      mask = buffer.subarray(cursor, cursor + 4);
      cursor += 4;
    }

    if (buffer.length - cursor < length) break;
    let payload = buffer.subarray(cursor, cursor + length);
    if (masked) {
      const unmasked = Buffer.alloc(length);
      for (let i = 0; i < length; i += 1) unmasked[i] = payload[i] ^ mask[i % 4];
      payload = unmasked;
    }
    cursor += length;

    frames.push({ fin, opcode, payload });
    offset = cursor;
  }
  return { frames, rest: buffer.subarray(offset) };
}

class WebSocketServer {
  constructor() {
    this.clients = new Set();
    this.handlers = { connection: [], message: [], close: [] };
  }

  on(event, handler) {
    if (this.handlers[event]) this.handlers[event].push(handler);
  }

  emit(event, ...args) {
    for (const handler of this.handlers[event] || []) handler(...args);
  }

  handleUpgrade(req, socket, head) {
    const key = req.headers["sec-websocket-key"];
    if (!key) {
      socket.destroy();
      return;
    }
    const responseHeaders = [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${acceptKey(key)}`,
      "",
      "",
    ];
    socket.write(responseHeaders.join("\r\n"));

    const client = {
      id: crypto.randomUUID(),
      socket,
      meta: {},
      send: (data) => {
        try {
          socket.write(encodeFrame(data));
        } catch (error) {
          // ignore broken pipe
        }
      },
      close: () => socket.end(encodeFrame("", 0x8)),
    };

    this.clients.add(client);
    this.emit("connection", client, req);

    let buffer = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const { frames, rest } = decodeFrames(buffer);
      buffer = rest;
      for (const frame of frames) {
        if (frame.opcode === 0x8) {
          // close
          socket.end();
        } else if (frame.opcode === 0x9) {
          // ping
          socket.write(encodeFrame(frame.payload, 0xa));
        } else if (frame.opcode === 0x1) {
          // text
          this.emit("message", client, frame.payload.toString("utf8"));
        }
      }
    });

    const cleanup = () => {
      if (this.clients.has(client)) {
        this.clients.delete(client);
        this.emit("close", client);
      }
    };
    socket.on("close", cleanup);
    socket.on("error", cleanup);
  }

  broadcast(data, filter) {
    for (const client of this.clients) {
      if (!filter || filter(client)) client.send(data);
    }
  }
}

module.exports = { WebSocketServer };
