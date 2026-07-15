const net = require('net');
const EventEmitter = require('events');

/**
 * TCP client that connects to the AeroKitten Bot NeoForge mod's API server.
 * Sends commands and receives events via JSON lines.
 */
class McBotController extends EventEmitter {
  constructor(options = {}) {
    super();
    this.host = options.host || '127.0.0.1';
    this.port = options.port || 3478;
    this.reconnectDelay = options.reconnectDelay || 3000;
    this.autoReconnect = options.autoReconnect !== false;

    this.socket = null;
    this.buffer = '';
    this.connected = false;
    this.reconnectTimer = null;
  }

  connect() {
    if (this.socket) this.destroy();

    this.socket = new net.Socket();
    this.socket.setEncoding('utf8');

    this.socket.on('connect', () => {
      this.connected = true;
      this.emit('connected');
      console.log('[McBotController] Connected to Minecraft bot on', `${this.host}:${this.port}`);
    });

    this.socket.on('data', (data) => {
      this.buffer += data;
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop(); // keep incomplete line
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed);
          this.emit('event', msg);
          if (msg.event) {
            this.emit(msg.event, msg.data || msg);
          }
        } catch (e) {
          console.error('[McBotController] Failed to parse:', trimmed);
        }
      }
    });

    this.socket.on('close', () => {
      this.connected = false;
      this.emit('disconnected');
      console.log('[McBotController] Disconnected from Minecraft bot');
      if (this.autoReconnect) {
        this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectDelay);
      }
    });

    this.socket.on('error', (err) => {
      console.error('[McBotController] Socket error:', err.message);
      this.socket.destroy();
    });

    this.socket.connect(this.port, this.host);
  }

  send(cmd, data = {}) {
    if (!this.connected || !this.socket) {
      console.error('[McBotController] Cannot send: not connected');
      return false;
    }
    const msg = JSON.stringify({ cmd, ...data }) + '\n';
    this.socket.write(msg);
    return true;
  }

  /**
   * High-level commands
   */
  say(message) {
    return this.send('say', { message });
  }

  moveTo(x, z, y) {
    const data = { x, z };
    if (y !== undefined) data.y = y;
    return this.send('move_to', data);
  }

  follow(playerName) {
    return this.send('follow', { player: playerName });
  }

  stop() {
    return this.send('stop');
  }

  lookAt(x, z, y) {
    const data = { x, z };
    if (y !== undefined) data.y = y;
    return this.send('look_at', data);
  }

  lookAtPlayer(playerName) {
    return this.send('look_at', { player: playerName });
  }

  scan(radius) {
    return this.send('scan', { radius: radius || 10 });
  }

  status() {
    return this.send('status');
  }

  inventory() {
    return this.send('inventory');
  }

  connectToServer(host, port) {
    const data = { host };
    if (port) data.port = port;
    return this.send('connect', data);
  }

  disconnect() {
    return this.send('disconnect');
  }

  destroy() {
    this.autoReconnect = false;
    clearTimeout(this.reconnectTimer);
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
      this.socket = null;
    }
    this.connected = false;
  }
}

module.exports = McBotController;
