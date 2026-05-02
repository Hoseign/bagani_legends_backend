import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.124/build/three.module.js';

import {entity} from './entity.js';
import {player_entity} from './player-entity.js'

import {defs} from '/shared/defs.mjs';


export const npc_entity = (() => {

  class NPCController extends entity.Component {
    constructor(params) {
      super();
      this.params_ = params;
    }

    Destroy() {
      this.group_.traverse(c => {
        if (c.material) {
          let materials = c.material;
          if (!(c.material instanceof Array)) {
            materials = [c.material];
          }
          for (let m of materials) {
            m.dispose();
          }
        }

        if (c.geometry) {
          c.geometry.dispose();
        }
      });
      this.params_.scene.remove(this.group_);
    }

    InitEntity() {
      this._Init();
    }

    _Init() {
      this.animations_ = {};
      this.group_ = new THREE.Group();

      this.params_.scene.add(this.group_);
      this.queuedState_ = null;
      this.lastNetworkState_ = null;

      this.LoadModels_();
    }

    InitComponent() {
      this._RegisterHandler('health.death', (m) => { this.OnDeath_(m); });
      this._RegisterHandler('update.position', (m) => { this.OnPosition_(m); });
      this._RegisterHandler('update.rotation', (m) => { this.OnRotation_(m); });
      this._RegisterHandler('events.network', (m) => { this.OnEvents_(m); });
    }

    OnEvents_(msg) {
      for (let e of msg.value) {
        if (e.type === 'attack' && e.target === this.Parent) {
          this.Shake_();
        }
      }
    }

    Shake_() {
      this.shakeTimer_ = 0.5;
    }

    SetState(s) {
      if (!this.stateMachine_) {
        this.queuedState_ = s;
        return;
      }

      const curState = this.stateMachine_._currentState.Name;

      // Prevent restarting one-shot animations if the server is lagging
      if (curState === 'idle' && (s === 'dance' || s === 'attack') && s === this.lastNetworkState_) {
        return;
      }

      // If we finished our animation and are in 'idle', but the server 
      // is still sending the old 'dance' or 'attack' state (due to lag), ignore it.
      if (curState === 'idle' && (s === 'dance' || s === 'attack')) {
        if (s === this.lastNetworkState_) {
          return;
        }
      }

      this.lastNetworkState_ = s;

      // hack: should propogate attacks through the events on server
      // Right now, they're inferred from whatever animation we're running, blech
      if (s == 'attack' && curState != 'attack') {
        this.Broadcast({
            topic: 'action.attack',
        });
      }

      this.stateMachine_.SetState(s);
    }

    ChangeClass(newClass) {
      this.params_.desc.character.class = newClass;
      // Remove old model
      this.group_.remove(this.target_);
      this.target_ = null;
      this.animations_ = {};
      
      this.LoadModels_();
    }

    OnDeath_(msg) {
      this.SetState('death');
    }

    OnPosition_(m) {
      this.group_.position.copy(m.value);
    }

    OnRotation_(m) {
      this.group_.quaternion.copy(m.value);
    }

    LoadModels_() {
      const classType = this.params_.desc.character.class;
      const modelData = defs.CHARACTER_MODELS[classType];

      const loader = this.FindEntity('loader').GetComponent('LoadController');

      const _OnLoad = (glb) => {
        if (glb.scene) {
          this.target_ = glb.scene;
          this.target_.animations = glb.animations;
        } else {
          this.target_ = glb;
        }

        this.target_.scale.setScalar(modelData.scale);
        this.target_.visible = false;

        this.group_.add(this.target_);
  
        this.bones_ = {};
        this.target_.traverse(c => {
          if (!c.skeleton) {
            return;
          }
          for (let b of c.skeleton.bones) {
            this.bones_[b.name] = b;
          }
        });

        this.target_.traverse(c => {
          c.castShadow = true;
          c.receiveShadow = true;
          if (c.material && c.material.map) {
            c.material.map.encoding = THREE.sRGBEncoding;
          }
        });

        this.mixer_ = new THREE.AnimationMixer(this.target_);

        
        const _FindAnim = (animName) => {
          const anims = this.target_.animations || glb.animations || [];
          for (let i = 0; i < anims.length; i++) {
            if (anims[i].name.includes(animName)) {
              const clip = anims[i];
              const action = this.mixer_.clipAction(clip);
              return {
                clip: clip,
                action: action
              }
            }
          }
          return null;
        };

        this.animations_['idle'] = _FindAnim('Idle');
        this.animations_['walk'] = _FindAnim('Walk');
        this.animations_['run'] = _FindAnim('Run');
        this.animations_['death'] = _FindAnim('Death');
        this.animations_['attack'] = _FindAnim('Attack');
        this.animations_['dance'] = _FindAnim('Dance');

        this.target_.visible = true;

        this.stateMachine_ = new player_entity.CharacterFSM(
            new player_entity.BasicCharacterControllerProxy(this.animations_, false));

        if (this.queuedState_) {
          this.stateMachine_.SetState(this.queuedState_)
          this.queuedState_ = null;
        } else {
          this.stateMachine_.SetState('idle');
        }

        // Force an initial update to the mixer to prevent T-pose on spawn
        if (this.mixer_) {
          this.mixer_.update(0);
        }

        this.Broadcast({
            topic: 'load.character',
            model: this.group_,
            bones: this.bones_,
        });
      };

      if (modelData.base.endsWith('.fbx')) {
        loader.LoadFBX(modelData.path, modelData.base, _OnLoad);
      } else {
        loader.LoadSkinnedGLB(modelData.path, modelData.base, _OnLoad);
      }
    }

    Update(timeInSeconds) {
      if (!this.stateMachine_) {
        return;
      }
      this.stateMachine_.Update(timeInSeconds, null);

      // Hit reaction shake
      if (this.shakeTimer_ > 0 && this.target_) {
        this.shakeTimer_ -= timeInSeconds;
        this.target_.position.x = (Math.random() - 0.5) * 0.5;
        this.target_.position.z = (Math.random() - 0.5) * 0.5;
      } else if (this.target_) {
        this.target_.position.set(0, 0, 0);
      }

      this.Broadcast({
          topic: 'player.action',
          action: this.stateMachine_._currentState.Name,
      });
      
      if (this.mixer_) {
        this.mixer_.update(timeInSeconds);
      }
    }
  };

  return {
    NPCController: NPCController,
  };

})();
