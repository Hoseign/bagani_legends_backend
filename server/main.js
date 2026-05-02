const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const httpServer = createServer(app);

// Enable Cross-Origin Isolation for SharedArrayBuffer
app.use((req, res, next) => {
    const origin = req.headers.origin || '';
    const allowedOrigins = ['https://baganilegends.web.app', 'https://baganilegends.firebaseapp.com', 'http://localhost:3000', 'http://localhost:5000'];

    if (allowedOrigins.includes(origin) || allowedOrigins.some(o => origin.startsWith(o))) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Origin-Agent-Cluster', '?1');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Health check route to wake up the server manually
app.get('/', (req, res) => {
  res.send('Bagani Legends Backend is Running');
});

// Handle favicon requests to avoid 404 noise in the console
app.get('/favicon.ico', (req, res) => res.status(204).end());

const io = new Server(httpServer, {
  cors: {
    origin: ["https://baganilegends.web.app", "https://baganilegends.firebaseapp.com", "http://localhost:3000", "http://localhost:5000"],
    methods: ["GET", "POST"],
    credentials: true
  }
});


const _STATE = {
  clients: {},
  npcs: {},
  events: []
};

const ATTACK_CONFIG = {
  guard: { delay: 500, damage: 20 },
  paladin: { delay: 350, damage: 20 },
  sorceror: { delay: 1000, damage: 25 },
  warrok: { delay: 1500, damage: 30 },
  zombie: { delay: 1000, damage: 10 }
};

io.on('connection', (socket) => {
  console.log('User connected: ' + socket.id);

  socket.on('login.commit', (name) => {
    _STATE.clients[socket.id] = {
      id: socket.id,
      desc: {
        account: {
          name: name,
        },
        character: {
          class: 'zombie',
          inventory: {}
        }
      },
      stats: {
        health: [100, 100],
        mana: [100, 100],
        energy: [100, 100],
        maxHealth: 100,
      },
      transform: ['idle', [0, 0, 0], [0, 0, 0, 1]],
    };

    socket.emit('world.player', _STATE.clients[socket.id]);
  });

  socket.on('world.update', (transform) => {
    if (socket.id in _STATE.clients) {
      _STATE.clients[socket.id].transform = transform;
    }
  });

  socket.on('action.attack', (data) => {
    const attacker = _STATE.clients[socket.id];
    if (!attacker) return;

    const config = ATTACK_CONFIG[attacker.desc.character.class] || ATTACK_CONFIG.zombie;
    const isSpecial = !!(data && data.special);
    const damage = isSpecial ? 999999 : config.damage;

    // Delay damage to match animation impact
    setTimeout(() => {
      if (!_STATE.clients[socket.id]) return; // Attacker disconnected

      Object.values(_STATE.clients).forEach(target => {
        if (target.id === socket.id) return;
        const dist = Math.hypot(
          attacker.transform[1][0] - target.transform[1][0],
          attacker.transform[1][2] - target.transform[1][2]
        );
        if (dist < 5) {
          if (isSpecial) {
            // ONE HIT KILL: Force health to exactly 0 immediately
            target.stats.health[0] = 0;
          } else {
            target.stats.health[0] = Math.max(0, target.stats.health[0] - damage);
          }

          // Generate event for client-side visuals (Blood/Shake)
          _STATE.events.push({ 
            type: 'attack', 
            attacker: socket.id, 
            target: target.id, 
            amount: isSpecial ? 'INSTANT KILL' : damage 
          });
        }
      });
    }, config.delay);
  });

  socket.on('world.stats-update', (stats) => {
    if (socket.id in _STATE.clients) {
      if (stats.mana !== undefined) _STATE.clients[socket.id].stats.mana[0] = stats.mana;
      if (stats.energy !== undefined) _STATE.clients[socket.id].stats.energy[0] = stats.energy;
    }
  });

  socket.on('world.respawn', () => {
    if (socket.id in _STATE.clients) {
      const client = _STATE.clients[socket.id];
      client.stats.health = [100, 100];
      client.transform = ['idle', [0, 0, 0], [0, 0, 0, 1]];
    }
  });

  socket.on('world.change-class', (data) => {
    if (socket.id in _STATE.clients) {
      _STATE.clients[socket.id].desc.character.class = data[0];
      _STATE.clients[socket.id].desc.character.inventory = data[1];
    }
  });

  socket.on('chat.msg', (msg) => {
    if (socket.id in _STATE.clients) {
      io.emit('chat.message', {
        name: _STATE.clients[socket.id].desc.account.name,
        text: msg,
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected: ' + socket.id);
    delete _STATE.clients[socket.id];
  });
});

setInterval(() => {
  const allEntities = [...Object.values(_STATE.clients), ...Object.values(_STATE.npcs)].map(e => {
    return {
      ...e,
      events: _STATE.events.filter(ev => ev.target === e.id || ev.attacker === e.id)
    };
  });

  if (allEntities.length > 0) {
    io.emit('world.update', allEntities);
  }
  _STATE.events = []; // Clear events after broadcast
}, 100);

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('Bagani Legends Server is LIVE!');
  console.log('Server listening 
