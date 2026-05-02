import 'https://cdn.jsdelivr.net/npm/socket.io-client@3.1.0/dist/socket.io.js';


import {entity} from './entity.js';
import { ui_controller } from './ui-controller.js';


export const network_controller = (() => {

  class NetworkController extends entity.Component {
    constructor(params) {
      super();

      this.playerID_ = null;
      this.SetupSocket_();
    }

    GenerateRandomName_() {
      const names1 = [
          'Aspiring', 'Nameless', 'Cautionary', 'Excited',
          'Modest', 'Maniacal', 'Caffeinated', 'Sleepy',
          'Passionate', 'Medical',
      ];
      const names2 = [
          'Painter', 'Cheese Guy', 'Giraffe', 'Snowman',
          'Doberwolf', 'Cocktail', 'Fondler', 'Typist',
          'Noodler', 'Arborist', 'Peeper'
      ];
      const n1 = names1[
          Math.floor(Math.random() * names1.length)];
      const n2 = names2[
          Math.floor(Math.random() * names2.length)];
      return n1 + ' ' + n2;
    }

    SetupSocket_() {
      this.socket_ = io('https://bagani-legends-backend.onrender.com', {
          reconnection: true,
          reconnectionAttempts: 10,
          reconnectionDelay: 2000,
          transports: ['polling', 'websocket'],
          timeout: 60000,
      });
  
      this.socket_.on("connect", () => {
        console.log(this.socket_.id);
        const loginInput = document.getElementById('login-input');
        const username = loginInput.value || this.GenerateRandomName_();

        this.socket_.emit('login.commit', username);
      });
  
      this.socket_.on("disconnect", () => {
        console.log('DISCONNECTED: ' + this.socket_.id); // undefined
      });
  
      this.socket_.onAny((e, d) => {
        this.OnMessage_(e, d);
      });
    }

    SendChat(txt) {
      this.socket_.emit('chat.msg', txt);
    }

    SendTransformUpdate(transform) {
      this.socket_.emit('world.update', transform);
    }

    SendActionAttack_(data) {
      this.socket_.emit('action.attack', data);
    }

    SendRespawn() {
      this.socket_.emit('world.respawn');
    }

    SendInventoryChange_(packet) {
      this.socket_.emit('world.inventory', packet);
    }

    SendClassChange(newClass, inventory) {
      this.socket_.emit('world.change-class', [newClass, inventory]);
    }

    GetEntityID_(serverID) {
      if (serverID == this.playerID_) {
        return 'player';
      } else {
        return '__npc__' + serverID;
      }
    }
    
    OnMessage_(e, d) {
      if (e == 'world.player') {
        this.playerID_ = d.id;
        console.log('entering world: ' + d.id);

        const spawner = this.FindEntity('spawners').GetComponent('PlayerSpawner');
        const player = spawner.Spawn(d.desc);

        player.Broadcast({
            topic: 'network.update',
            transform: d.transform,
        });

        const inventory = d.desc.character.inventory || {};

        player.Broadcast({
            topic: 'network.inventory',
            inventory: inventory,
        });
      } else if (e == 'world.update') {
        const updates = d;

        const spawner = this.FindEntity('spawners').GetComponent(
            'NetworkEntitySpawner');

        const ui = this.FindEntity('ui').GetComponent('UIController');

        for (let u of updates) {
          const id = this.GetEntityID_(u.id);

          let npc = this.FindEntity(id);
          if (!npc && 'desc' in u) {
            // Only spawn if it's a remote player we don't know yet
            npc = spawner.Spawn(id, u.desc);

            npc.Broadcast({
                topic: 'network.inventory',
                inventory: u.desc.character.inventory,
            });
          } else if (npc && id != 'player') {
            // Check for class change
            const controller = npc.GetComponent('NPCController');
            if (controller && u.desc && u.desc.character.class !== controller.params_.desc.character.class) {
              controller.ChangeClass(u.desc.character.class);

              npc.Broadcast({
                  topic: 'network.inventory',
                  inventory: u.desc.character.inventory,
              });
            }
          }

          // Translate events, hardcoded, bad, sorry
          let events = [];
          if (u.events) {
            for (let e of u.events) {
              events.push({
                  type: e.type,
                  target: this.FindEntity(this.GetEntityID_(e.target)),
                  attacker: this.FindEntity(this.GetEntityID_(e.attacker)),
                  amount: e.amount,
              });
            }
          }

          ui.AddEventMessages(events);

          // Direct sync for local player UI
          if (id == 'player' && u.stats) {
            ui.UpdateLocalPlayerStats(u.stats);
          }

          if (npc) {
            npc.Broadcast({
                topic: 'network.update',
                // Only send transforms to remote players. 
                // Local player handles its own transform to prevent rubber-banding.
                transform: (id == 'player') ? [] : (u.transform || []),
                stats: u.stats || { health: [100, 100], maxHealth: 100 },
                events: events,
            });
          }
        }
      } else if (e == 'chat.message') {
        this.FindEntity('ui').GetComponent('UIController').AddChatMessage(d);
      } else if (e == 'world.inventory') {
        const id = this.GetEntityID_(d[0]);

        const e = this.FindEntity(id);
        if (!e) {
          return;
        }

        e.Broadcast({
            topic: 'network.inventory',
            inventory: d[1],
        });
      }
    }
  };

  return {
      NetworkController: NetworkController
  };
})();
