import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.124/build/three.module.js';


export const player_state = (() => {

  class State {
    constructor(parent) {
      this._parent = parent;
    }
  
    Enter() {}
    Exit() {}
    Update() {}
  };

  class DeathState extends State {
    constructor(parent) {
      super(parent);
  
      this._action = null;
    }
  
    get Name() {
      return 'death';
    }
  
    Enter(prevState) {
      const anim = this._parent._proxy.animations['death'];
      if (!anim) {
        this._parent.SetState('idle');
        return;
      }

      this._action = anim.action;

      this._action.reset();  
      this._action.setLoop(THREE.LoopOnce, 1);
      this._action.clampWhenFinished = true;

      if (prevState) {
        const prevAnim = this._parent._proxy.animations[prevState.Name];
        if (prevAnim) {
          const prevAction = prevAnim.action;
          this._action.crossFadeFrom(prevAction, 0.2, true);
        }
        this._action.play();
      } else {
        this._action.play();
      }
    }
  
    Exit() {
    }
  
    Update(_) {
    }
  };
  
  class DanceState extends State {
    constructor(parent) {
      super(parent);
  
      this._action = null;
  
      this._FinishedCallback = () => {
        this._Finished();
      }
    }
  
    get Name() {
      return 'dance';
    }
  
    Enter(prevState) {
      const anim = this._parent._proxy.animations['dance'];
      if (!anim) {
        this._parent.SetState('idle');
        return;
      }

      this._action = anim.action;
      const mixer = this._action.getMixer();
      mixer.addEventListener('finished', this._FinishedCallback);

      this._action.reset();  
      this._action.setLoop(THREE.LoopOnce, 1);
      this._action.clampWhenFinished = true;

      if (prevState) {
        const prevAnim = this._parent._proxy.animations[prevState.Name];
        if (prevAnim) {
          const prevAction = prevAnim.action;
          this._action.crossFadeFrom(prevAction, 0.2, true);
        }
        this._action.play();
      } else {
        this._action.play();
      }
    }
  
    _Finished() {
      this._Cleanup();
      this._parent.SetState('idle');
    }
  
    _Cleanup() {
      if (this._action) {
        this._action.getMixer().removeEventListener('finished', this._FinishedCallback);
      }
    }
  
    Exit() {
      this._Cleanup();
    }
  
    Update(_) {
    }
  };

  class AttackState extends State {
    constructor(parent) {
      super(parent);
  
      this._action = null;
  
      this._FinishedCallback = () => {
        this._Finished();
      }
    }
  
    get Name() {
      return 'attack';
    }
  
    Enter(prevState) {
      const anim = this._parent._proxy.animations['attack'];
      if (!anim) {
        this._parent.SetState('idle');
        return;
      }

      this._action = anim.action;
      const mixer = this._action.getMixer();
      mixer.addEventListener('finished', this._FinishedCallback);
  
      this._action.reset();  
      this._action.setLoop(THREE.LoopOnce, 1);
      this._action.clampWhenFinished = true;

      if (prevState) {
        const prevAnim = this._parent._proxy.animations[prevState.Name];
        if (prevAnim) {
          const prevAction = prevAnim.action;
          this._action.crossFadeFrom(prevAction, 0.4, true);
        }
        this._action.play();
      } else {
        this._action.play();
      }
    }
  
    _Finished() {
      this._Cleanup();
      this._parent.SetState('idle'); // Ensure this triggers the NPCController state update
    }
  
    _Cleanup() {
      if (this._action) {
        this._action.getMixer().removeEventListener('finished', this._FinishedCallback);
      }
    }
  
    Exit() {
      this._Cleanup();
    }
  
    Update(_) {
    }
  };
  
  class WalkState extends State {
    constructor(parent) {
      super(parent);
    }
  
    get Name() {
      return 'walk';
    }
  
    Enter(prevState) {
      const anim = this._parent._proxy.animations['walk'];
      if (!anim) return;

      const curAction = anim.action;
      if (prevState) {
        const prevAnim = this._parent._proxy.animations[prevState.Name];
        if (prevAnim) {
          const prevAction = prevAnim.action;
          curAction.enabled = true;

          if (prevState.Name == 'run') {
            const ratio = curAction.getClip().duration / prevAction.getClip().duration;
            curAction.time = prevAction.time * ratio;
          } else {
            curAction.time = 0.0;
            curAction.setEffectiveTimeScale(1.0);
            curAction.setEffectiveWeight(1.0);
          }
          curAction.crossFadeFrom(prevAction, 0.1, true);
        }
        curAction.play();
      } else {
        curAction.play();
      }
    }
  
    Exit() {
    }
  
    Update(timeElapsed, input) {
      if (!input) {
        return;
      }
  
      if (input._keys.forward || input._keys.backward) {
        if (input._keys.shift) {
          this._parent.SetState('run');
        }
        return;
      }
  
      this._parent.SetState('idle');
    }
  };
  
  
  class RunState extends State {
    constructor(parent) {
      super(parent);
    }
  
    get Name() {
      return 'run';
    }
  
    Enter(prevState) {
      const anim = this._parent._proxy.animations['run'];
      if (!anim) return;

      const curAction = anim.action;
      if (prevState) {
        const prevAnim = this._parent._proxy.animations[prevState.Name];
        if (prevAnim) {
          const prevAction = prevAnim.action;
          curAction.enabled = true;

          if (prevState.Name == 'walk') {
            const ratio = curAction.getClip().duration / prevAction.getClip().duration;
            curAction.time = prevAction.time * ratio;
          } else {
            curAction.time = 0.0;
            curAction.setEffectiveTimeScale(1.0);
            curAction.setEffectiveWeight(1.0);
          }
          curAction.crossFadeFrom(prevAction, 0.1, true);
        }
        curAction.play();
      } else {
        curAction.play();
      }
    }
  
    Exit() {
    }
  
    Update(timeElapsed, input) {
      if (!input) {
        return;
      }

      if (input._keys.forward || input._keys.backward) {
        if (!input._keys.shift) {
          this._parent.SetState('walk');
        }
        return;
      }
  
      this._parent.SetState('idle');
    }
  };
  
  
  class IdleState extends State {
    constructor(parent) {
      super(parent);
    }
  
    get Name() {
      return 'idle';
    }
  
    Enter(prevState) {
      const anim = this._parent._proxy.animations['idle'];
      if (!anim) return;

      const idleAction = anim.action;
      if (prevState) {
        const prevAnim = this._parent._proxy.animations[prevState.Name];
        if (prevAnim) {
          const prevAction = prevAnim.action;
          idleAction.time = 0.0;
          idleAction.enabled = true;
          idleAction.setEffectiveTimeScale(1.0);
          idleAction.setEffectiveWeight(1.0);
          idleAction.crossFadeFrom(prevAction, 0.25, true);
        }
        idleAction.play();
      } else {
        idleAction.play();
      }
    }
  
    Exit() {
    }
  
    Update(_, input) {
      if (!input) {
        return;
      }
  
      if (input._keys.forward || input._keys.backward) {
        this._parent.SetState('walk');
      } else if (input._keys.space) {
        this._parent.SetState('attack');
      } else if (input._keys.backspace) {
        this._parent.SetState('dance');
      }
    }
  };

  return {
    State: State,
    DanceState: DanceState,
    AttackState: AttackState,
    IdleState: IdleState,
    WalkState: WalkState,
    RunState: RunState,
    DeathState: DeathState,
  };

})();
