import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.124/build/three.module.js';
import {entity} from './entity.js';
import {defs} from '/shared/defs.mjs';


export const ui_controller = (() => {

  class UIController extends entity.Component {
    constructor(params) {
      super();
      this._params = params;
      // Detect mobile via URL parameter OR the custom Flutter User Agent
      this._isMobile = navigator.userAgent.includes("BaganiLegends-Mobile-App") || 
                       new URLSearchParams(window.location.search).get('platform') === 'mobile';
      this._quests = {};
      this._currentClass = 'zombie';
      this._typewriterTimers = [];
      this._editMode = false;
      this._resizeMode = 'both'; // 'both', 'width', 'height'
      this._wasDead = false;
      this._respawning = false;
      this._lastStatUpdate = 0;
      this._specialCooldown = 0;

      this._playerStats = {
        level: 1,
        coins: 100,
        hp: 100, maxHp: 100,
        mana: 100, maxMana: 100,
        energy: 100, maxEnergy: 100
      };

      this._barBaseWidths = {
        'health-bar': 200,
        'mana-bar': 180,
        'energy-bar': 140
      };
    }
  
    InitComponent() {
      this.iconBar_ = {
        stats: document.getElementById('icon-bar-stats'),
        inventory: document.getElementById('icon-bar-inventory'),
        quests: document.getElementById('icon-bar-quests'),
        swap: document.getElementById('icon-bar-character-swap'),
      };

      this._ui = {
        inventory: document.getElementById('inventory'),
        stats: document.getElementById('stats'),
        quests: document.getElementById('quest-journal'),
        swap: document.getElementById('character-radial-menu'),
      };

      const e = document.getElementById('quest-ui');
      if (e) e.style.visibility = 'hidden';

      // Safety check and bind handlers
      const _Bind = (el, fn) => {
        if (!el) return;
        if (this._isMobile) {
          el.ontouchstart = (e) => {
            if (this._editMode) return;
            if (e.cancelable) e.preventDefault();
            fn(e);
          };
        } else {
          el.onclick = fn;
        }
      };

      _Bind(this.iconBar_.inventory, (m) => { this.OnInventoryClicked_(m); });
      _Bind(this.iconBar_.stats, (m) => { this.OnStatsClicked_(m); });
      _Bind(this.iconBar_.quests, (m) => { this.OnQuestsClicked_(m); });
      _Bind(this.iconBar_.swap, (m) => { this.OnSwapClicked_(m); });

      _Bind(document.getElementById('inventory-close'), () => { this.HideUI(); });
      _Bind(document.getElementById('stats-close'), () => { this.HideUI(); });
      _Bind(document.getElementById('quests-close'), () => { this.HideUI(); });

      _Bind(document.getElementById('respawn-button'), () => { this._OnRespawnClicked(); });
      _Bind(document.getElementById('exit-button'), () => { this._OnExitClicked(); });

      // Edit Mode Controls
      window.addEventListener('keydown', (e) => {
        if (!this._isMobile) return; // Only allow Edit Mode on mobile

        if (e.key === '1') {
          this._editMode = !this._editMode;
          this._resizeMode = 'both';
          console.log(`%c EDIT MODE: ${this._editMode ? 'ON' : 'OFF'} (Mode: BOTH)`, 'color: #ffff00; font-weight: bold;');
          this._UpdateEditModeVisuals();
        } else if (this._editMode && e.key === '2') {
          this._resizeMode = 'width';
          console.log(`%c EDIT MODE: ON (Mode: WIDTH ONLY)`, 'color: #00ffff; font-weight: bold;');
        } else if (this._editMode && e.key === '3') {
          this._resizeMode = 'height';
          console.log(`%c EDIT MODE: ON (Mode: HEIGHT ONLY)`, 'color: #ff00ff; font-weight: bold;');
        }
      });

      // Make EVERYTHING adjustable
      const adjustables = [
        'health-ui', 'mobile-joystick-container', 'mobile-btn-attack', 'mobile-btn-dance',
        'mobile-btn-special', 'player-profile-avatar', 'health-bar', 'mana-bar',
        'energy-bar', 'player-name-text', 'quest-journal', 'stats', 'inventory',
        'respawn-button', 'exit-button', 'icon-bar-character-swap',
        'icon-bar-stats', 'icon-bar-inventory', 'icon-bar-quests',
        'inventory-close', 'stats-close', 'quests-close'
      ];
      adjustables.forEach(id => this._MakeAdjustable(document.getElementById(id)));

      // Bind Mobile Functionality
      this._SetupMobileButtons();
      this._SetupMobileJoystick();
      this._SetupGameMechanics();

      const avatarIcon = document.getElementById('profile-avatar-icon');
      if (avatarIcon) {
        avatarIcon.onclick = () => this._OnAvatarClicked();
      }

      // Set custom swap icon
      if (this.iconBar_.swap) {
        this.iconBar_.swap.style.backgroundImage = "url('/resources/icons/ui/swap-icon.png')";
        this.iconBar_.swap.style.backgroundSize = 'cover';
        this.iconBar_.swap.style.backgroundRepeat = 'no-repeat';
        this.iconBar_.swap.style.backgroundPosition = 'center';
        this.iconBar_.swap.style.backgroundColor = 'transparent';
        this.iconBar_.swap.style.padding = '0';
        this.iconBar_.swap.style.border = 'none';
        this.iconBar_.swap.style.cursor = 'pointer';
      }

      // Prevent character rotation/movement when interacting with the radial menu
      if (this._ui.swap) {
        this._ui.swap.onmouseenter = () => {
          const player = this.FindEntity('player');
          if (player) {
            const input = player.GetComponent('BasicCharacterControllerInput');
            if (input) Object.keys(input._keys).forEach(k => input._keys[k] = false);
          }
        };
      }

      this._SetupRadialMenu();
      this.HideUI();
      this._UpdateEditModeVisuals(); // Ensure interaction rules apply on start

      // Only apply custom mobile placements and hiding logic if on mobile platform
      if (this._isMobile) {
        const panels = ['stats', 'inventory', 'quest-journal'];
        panels.forEach(id => {
          const el = document.getElementById(id);
          if (el) {
            el.style.position = 'fixed';
            el.style.left = '50%';
            el.style.top = '50%';
            el.style.transform = 'translate(-50%, -50%)';
            el.style.zIndex = '6500';
          }
        });

        const healthUI = document.getElementById('health-ui');
        if (healthUI) {
          healthUI.style.position = 'fixed';
          healthUI.style.left = '3px';
          healthUI.style.top = '-9px';
          healthUI.style.width = '350px';
          healthUI.style.height = '202px';
        }

        const iconBar = document.getElementById('icon-bar');
        if (iconBar) {
          iconBar.style.background = 'none'; // Hide web background, keep container for children
          iconBar.style.pointerEvents = 'none'; // Ensure container doesn't block screen
          iconBar.style.position = 'fixed';
        }

        const joystick = document.getElementById('mobile-joystick-container');
        if (joystick) {
          joystick.style.position = 'fixed';
          joystick.style.left = '40px';
          joystick.style.bottom = '40px';
          joystick.style.top = 'auto'; // Clear the top value from CSS
          joystick.style.display = 'flex';
          joystick.style.zIndex = '10000';
        }

        // Apply saved fitment for avatar, name and health bar
        const avatar = document.getElementById('player-profile-avatar');
        if (avatar) {
          avatar.style.position = 'fixed';
          avatar.style.left = '26px';
          avatar.style.top = '27px';
          avatar.style.width = '78px';
          avatar.style.height = '74px';
          avatar.style.zIndex = '1000';
        }

        const nameText = document.getElementById('player-name-text');
        if (nameText) {
          nameText.style.position = 'fixed';
          nameText.style.left = '121px';
          nameText.style.top = '19px';
          nameText.style.width = '63px';
          nameText.style.height = '19px';
          nameText.style.fontSize = '12px';
        }

        const healthBar = document.getElementById('health-bar');
        if (healthBar) {
          healthBar.style.position = 'fixed';
          healthBar.style.left = '127px';
          healthBar.style.top = '39px';
          healthBar.style.width = '130px';
          healthBar.style.height = '14px';
          this._barBaseWidths['health-bar'] = 130;
        }

        const manaBar = document.getElementById('mana-bar');
        if (manaBar) {
          manaBar.style.position = 'fixed';
          manaBar.style.left = '129px';
          manaBar.style.top = '56px';
          manaBar.style.width = '120px';
          manaBar.style.height = '12px';
          this._barBaseWidths['mana-bar'] = 120;
        }

        const energyBar = document.getElementById('energy-bar');
        if (energyBar) {
          energyBar.style.position = 'fixed';
          energyBar.style.left = '140px';
          energyBar.style.top = '74px';
          energyBar.style.width = '90px';
          energyBar.style.height = '10px';
          this._barBaseWidths['energy-bar'] = 90;
        }

        // Ensure icons have size on mobile so they don't "vanish"
        const icons = [this.iconBar_.stats, this.iconBar_.inventory, this.iconBar_.quests];
        for (let icon of icons) {
          if (icon) {
            icon.style.width = '50px';
            icon.style.height = '50px';
            icon.style.backgroundSize = 'contain';
            icon.style.backgroundRepeat = 'no-repeat';
            icon.style.backgroundPosition = 'center bottom';
            icon.style.pointerEvents = 'auto';
            icon.style.visibility = 'visible';
            icon.style.zIndex = '2000';
          }
        }
        // Align mobile icons horizontally (Skills, Backpack, Quests)
        if (this.iconBar_.stats) {
          this.iconBar_.stats.style.position = 'fixed';
          this.iconBar_.stats.style.left = '310px';
          this.iconBar_.stats.style.top = '319px';
          this.iconBar_.stats.style.width = '50px';
          this.iconBar_.stats.style.height = '50px';
          this.iconBar_.stats.style.backgroundPosition = 'center bottom';
          this.iconBar_.stats.style.backgroundSize = 'contain';
          this.iconBar_.stats.style.pointerEvents = 'auto';
          this.iconBar_.stats.style.cursor = 'pointer';
          this.iconBar_.stats.style.visibility = 'visible';
          this.iconBar_.stats.style.zIndex = '2000';
        }
        if (this.iconBar_.inventory) {
          this.iconBar_.inventory.style.position = 'fixed';
          this.iconBar_.inventory.style.left = '370px';
          this.iconBar_.inventory.style.top = '306.5px'; // Aligned vertically with 50px icons
          this.iconBar_.inventory.style.width = '75px'; // Made bigger as requested
          this.iconBar_.inventory.style.height = '75px';
          this.iconBar_.inventory.style.backgroundPosition = 'center bottom';
          this.iconBar_.inventory.style.backgroundSize = 'contain';
          this.iconBar_.inventory.style.pointerEvents = 'auto';
          this.iconBar_.inventory.style.cursor = 'pointer';
          this.iconBar_.inventory.style.visibility = 'visible';
          this.iconBar_.inventory.style.zIndex = '2000';
        }
        if (this.iconBar_.quests) {
          this.iconBar_.quests.style.position = 'fixed';
          this.iconBar_.quests.style.left = '455px';
          this.iconBar_.quests.style.top = '319px';
          this.iconBar_.quests.style.width = '50px';
          this.iconBar_.quests.style.height = '50px';
          this.iconBar_.quests.style.backgroundPosition = 'center bottom';
          this.iconBar_.quests.style.backgroundSize = 'contain';
          this.iconBar_.quests.style.pointerEvents = 'auto';
          this.iconBar_.quests.style.cursor = 'pointer';
          this.iconBar_.quests.style.visibility = 'visible';
          this.iconBar_.quests.style.zIndex = '2000';
        }
      }

      this.chatElement_ = document.getElementById('chat-input');
      if (this.chatElement_) {
        this.chatElement_.addEventListener(
          'keydown', (e) => this.OnChatKeyDown_(e), false);
      }
    }

    _UpdateEditModeVisuals() {
      const adjustables = [
        'health-ui', 'mobile-joystick-container', 'mobile-btn-attack', 'mobile-btn-dance',
        'mobile-btn-special', 'player-profile-avatar', 'health-bar', 'mana-bar',
        'energy-bar', 'player-name-text', 'quest-journal', 'stats', 'inventory',
        'respawn-button', 'exit-button', 'icon-bar-character-swap',
        'icon-bar-stats', 'icon-bar-inventory', 'icon-bar-quests',
        'inventory-close', 'stats-close', 'quests-close'
      ];

      adjustables.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          if (this._editMode || this._isMobile) {
            el.style.position = 'fixed';
          }
          el.style.border = this._editMode ? '2px dashed yellow' : (
            el.classList.contains('mobile-action-button') || el.classList.contains('icon-bar-item') ? 
            'none' : ''
          );
          // In Edit Mode, everything must capture the mouse.
          // Out of Edit Mode, only buttons and interactive icons should be clickable.
          el.style.pointerEvents = this._editMode ? 'auto' : (
            el.classList.contains('icon-bar-item') || 
            el.id === 'icon-bar-stats' ||
            el.id === 'icon-bar-inventory' ||
            el.id === 'icon-bar-quests' ||
            el.id === 'icon-bar-character-swap' ||
            el.id === 'mobile-joystick-container' ||
            el.id === 'stats' ||
            el.id === 'inventory' ||
            el.id === 'quest-journal' ||
            el.id === 'inventory-close' ||
            el.id === 'stats-close' ||
            el.id === 'quests-close' ||
            el.classList.contains('ui-close-button') ||
            el.classList.contains('mobile-action-button') ||
            el.id === 'player-profile-avatar' ||
            el.tagName === 'BUTTON' ? 'auto' : 'none'
          );
        }
      });
    }

    _MakeAdjustable(el) {
      if (!el) return;
      let isDragging = false;
      let startX, startY, startLeft, startTop;

      el.onmousedown = (e) => {
        if (!this._editMode || e.button !== 0) return;
        e.stopPropagation(); // Prevent parent from moving when child is dragged
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const style = window.getComputedStyle(el);
        el.style.position = 'fixed';
        el.style.transform = 'none'; // Prevent centering logic from fighting the drag
        startLeft = parseInt(style.left) || 0;
        startTop = parseInt(style.top) || 0;
        el.style.transform = 'none'; 
        e.preventDefault();
        e.stopPropagation();
      };

      window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        el.style.left = (startLeft + dx) + 'px';
        el.style.top = (startTop + dy) + 'px';
        el.style.bottom = 'auto';
        el.style.right = 'auto';
        el.style.transform = 'none';

        // Auto-scale font size for name text when resizing container
        if (el.id === 'player-name-text') {
          el.style.fontSize = (parseInt(el.style.height) * 0.6) + 'px';
        }
        this._LogValues(el);
      });

      window.addEventListener('mouseup', () => { isDragging = false; });

      el.onwheel = (e) => {
        if (!this._editMode) return;
        e.preventDefault();
        e.stopPropagation(); // Prevent parent from resizing when child is scrolled
        const style = window.getComputedStyle(el);

        if (this._resizeMode === 'both' || this._resizeMode === 'width') {
          const w = (parseInt(style.width) || 100) - Math.sign(e.deltaY) * 10;
          if (this._barBaseWidths[el.id] !== undefined) {
            this._barBaseWidths[el.id] = w;
          }
          el.style.width = w + 'px';
        }

        if (this._resizeMode === 'both' || this._resizeMode === 'height') {
          const h = (parseInt(style.height) || 20) - Math.sign(e.deltaY) * 2;
          el.style.height = h + 'px';

          // Auto-scale font size for name text
          if (el.id === 'player-name-text') {
            el.style.fontSize = (h * 0.6) + 'px';
          }
        }
        this._LogValues(el);
      };
    }

    _LogValues(el) {
      const s = el.style;
      console.log(`%c [FITMENT] ${el.id}: left: ${s.left}, top: ${s.top}, width: ${s.width}, height: ${s.height}`, 'color: #00ff00; font-weight: bold;');
    }

    UpdateLocalPlayerStats(stats) {
      if (!stats) return;
      
      // Block server updates for 4s after local changes to ensure the server has fully synced the drain/regen
      if (Date.now() - this._lastStatUpdate < 4000) return;
      
      this._playerStats.hp = stats.health[0];
      this._playerStats.maxHp = stats.health[1];
      
      if (stats.mana) {
        this._playerStats.mana = stats.mana[0];
        this._playerStats.maxMana = stats.mana[1];
      }
      if (stats.energy) {
        this._playerStats.energy = stats.energy[0];
        this._playerStats.maxEnergy = stats.energy[1];
      }
      
      this._UpdateBars();

      if (this._playerStats.hp > 0) {
        this._respawning = false;
      }

      if (this._playerStats.hp <= 0 && !this._respawning) {
        const overlay = document.getElementById('perish-overlay');
        if (overlay) overlay.style.visibility = 'visible';

        const respawnBtn = document.getElementById('respawn-button');
        const exitBtn = document.getElementById('exit-button');

        // Force visibility in case they are hidden via display: none
        if (respawnBtn) { respawnBtn.style.display = 'block'; respawnBtn.style.visibility = 'visible'; }
        if (exitBtn) { exitBtn.style.display = 'block'; exitBtn.style.visibility = 'visible'; }

        // Use the saved fitment positions once when death occurs
        if (!this._wasDead) {
          if (respawnBtn) {
            respawnBtn.style.position = 'fixed';
            respawnBtn.style.left = '631px';
            respawnBtn.style.top = '474px';
            respawnBtn.style.width = '131px';
            respawnBtn.style.height = '51px';
            respawnBtn.style.transform = 'none';
          }
          if (exitBtn) {
            exitBtn.style.position = 'fixed';
            exitBtn.style.left = '791px';
            exitBtn.style.top = '471px';
            exitBtn.style.width = '135px';
            exitBtn.style.height = '51px';
            exitBtn.style.transform = 'none';
          }
        }
      }
      this._wasDead = (this._playerStats.hp <= 0);
    }

    _OnRespawnClicked() {
      if (this._editMode) return;

      const respawnBtn = document.getElementById('respawn-button');
      const exitBtn = document.getElementById('exit-button');

      // Make buttons and overlay vanish immediately
      if (respawnBtn) { respawnBtn.style.display = 'none'; respawnBtn.style.visibility = 'hidden'; }
      if (exitBtn) { exitBtn.style.display = 'none'; exitBtn.style.visibility = 'hidden'; }

      const overlay = document.getElementById('perish-overlay');
      if (overlay) overlay.style.visibility = 'hidden';

      this._respawning = true;
      this._lastStatUpdate = Date.now();

      const net = this.FindEntity('network').GetComponent('NetworkController');
      net.SendRespawn();

      // Reset local stats and update bars to full
      this._playerStats.hp = this._playerStats.maxHp;
      this._playerStats.mana = this._playerStats.maxMana;
      this._playerStats.energy = this._playerStats.maxEnergy;
      this._UpdateBars();

      // Automatically re-apply the last chosen character class
      this._OnClassSelected(this._currentClass);

      const player = this.FindEntity('player');
      if (player) {
        player.SetPosition(new THREE.Vector3(0, 0, 0));

        // Force health component to full locally and block server sync briefly
        const hc = player.GetComponent('HealthComponent');
        if (hc) {
          hc.stats_.health = hc.stats_.maxHealth;
          hc._lastNetUpdate = Date.now();
        }

        // Reset animation state machine back to idle from death
        const bcc = player.GetComponent('BasicCharacterController');
        if (bcc && bcc.stateMachine_) {
          bcc.stateMachine_.SetState('idle');
        }
      }
      
      this._wasDead = false;
    }

    _OnExitClicked() {
      if (this._editMode) return;

      const respawnBtn = document.getElementById('respawn-button');
      const exitBtn = document.getElementById('exit-button');
      if (respawnBtn) { respawnBtn.style.display = 'none'; respawnBtn.style.visibility = 'hidden'; }
      if (exitBtn) { exitBtn.style.display = 'none'; exitBtn.style.visibility = 'hidden'; }

      const overlay = document.getElementById('perish-overlay');
      if (overlay) overlay.style.visibility = 'hidden';

      // Reloading the page is the cleanest way to reset the socket and game state
      window.location.reload();
    }

    _SetupGameMechanics() {
    }

    _UpdateBars() {
      const hBar = document.getElementById('health-bar');
      const mBar = document.getElementById('mana-bar');
      const eBar = document.getElementById('energy-bar');

      if (hBar) {
        const hWidth = Math.max(0, (this._playerStats.hp / this._playerStats.maxHp) * this._barBaseWidths['health-bar']);
        hBar.style.width = hWidth + 'px';
        hBar.innerText = Math.floor(this._playerStats.hp);
        const height = parseInt(window.getComputedStyle(hBar).height) || 20;
        hBar.style.fontSize = '10px';
        hBar.style.display = 'flex';
        hBar.style.alignItems = 'center';
        hBar.style.justifyContent = 'flex-start';
        hBar.style.paddingLeft = '5px';
        hBar.style.lineHeight = '1';
        hBar.style.boxSizing = 'border-box';
      }
      
      const manaWidth = this._playerStats.maxMana > 0 ? 
          Math.max(0, (this._playerStats.mana / this._playerStats.maxMana) * this._barBaseWidths['mana-bar']) : 0;
      if (mBar) {
        mBar.style.width = manaWidth + 'px';
        mBar.innerText = Math.floor(this._playerStats.mana);
        mBar.style.backgroundColor = '#0000ff'; // Force Blue
        const height = parseInt(window.getComputedStyle(mBar).height) || 12;
        mBar.style.fontSize = '9px';
        mBar.style.display = 'flex';
        mBar.style.alignItems = 'center';
        mBar.style.justifyContent = 'flex-start';
        mBar.style.paddingLeft = '5px';
        mBar.style.lineHeight = '1';
        mBar.style.boxSizing = 'border-box';

        // Forcefully vanish the bar when drained
        mBar.style.display = (manaWidth <= 0) ? 'none' : 'block';
        mBar.style.visibility = (manaWidth <= 0) ? 'hidden' : 'visible';
      }

      const energyWidth = this._playerStats.maxEnergy > 0 ? 
          Math.max(0, (this._playerStats.energy / this._playerStats.maxEnergy) * this._barBaseWidths['energy-bar']) : 0;
      if (eBar) {
        eBar.style.width = energyWidth + 'px';
        eBar.innerText = Math.floor(this._playerStats.energy);
        eBar.style.backgroundColor = '#ffff00'; // Force Yellow
        const height = parseInt(window.getComputedStyle(eBar).height) || 10;
        eBar.style.fontSize = '8px';
        eBar.style.display = 'flex';
        eBar.style.alignItems = 'center';
        eBar.style.justifyContent = 'flex-start';
        eBar.style.paddingLeft = '5px';
        eBar.style.lineHeight = '1';
        eBar.style.boxSizing = 'border-box';

        // Forcefully vanish the bar when drained
        eBar.style.display = (energyWidth <= 0) ? 'none' : 'block';
        eBar.style.visibility = (energyWidth <= 0) ? 'hidden' : 'visible';
      }
    }

    _SetupMobileButtons() {
      const atk = document.getElementById('mobile-btn-attack');
      const dnc = document.getElementById('mobile-btn-dance');

      // Forcefully create the Special Skill button if it doesn't exist in HTML
      let spc = document.getElementById('mobile-btn-special');
      if (!spc) {
        spc = document.createElement('button');
        spc.id = 'mobile-btn-special';
        spc.className = 'mobile-action-button';
        const gameUI = document.getElementById('game-ui') || document.body;
        gameUI.appendChild(spc);
        this._MakeAdjustable(spc); // Ensure it is movable in Edit Mode immediately
      }

      // Set custom mobile action icons
      if (atk) {
        atk.innerText = '';
        atk.style.backgroundImage = "url('/resources/icons/ui/attack.png')";
        if (this._isMobile) {
          atk.style.position = 'fixed';
          atk.style.left = '626px'; 
          atk.style.top = '289px';
          atk.style.width = '80px';
          atk.style.height = '84px';
        } else {
          atk.style.position = 'fixed';
          atk.style.left = '1092px'; // Swapped with Special
          atk.style.top = '688px';   // Swapped with Special
          atk.style.width = '140px';
          atk.style.height = '140px';
        }
        atk.style.zIndex = '100';
        atk.style.backgroundSize = 'cover'; // Fill circular space without stretching
        atk.style.backgroundRepeat = 'no-repeat';
        atk.style.backgroundPosition = 'center';
        atk.style.backgroundColor = 'transparent';
        atk.style.padding = '0';
        atk.style.border = 'none';
        atk.style.outline = 'none';
        atk.style.cursor = 'pointer';
        atk.style.borderRadius = '50%';
        atk.style.overflow = 'hidden';
      }
      if (dnc) {
        dnc.innerText = '';
        dnc.style.backgroundImage = "url('/resources/icons/ui/dance.png')";
        if (this._isMobile) {
          dnc.style.position = 'fixed';
          dnc.style.left = '645px';
          dnc.style.top = '197px';
          dnc.style.width = '80px';
          dnc.style.height = '84px';
        } else {
          dnc.style.position = 'fixed';
          dnc.style.left = '1182px';
          dnc.style.top = '553px';
          dnc.style.width = '140px';
          dnc.style.height = '140px';
        }
        dnc.style.zIndex = '100';
        dnc.style.backgroundSize = 'cover'; // Fill circular space without stretching
        dnc.style.backgroundRepeat = 'no-repeat';
        dnc.style.backgroundPosition = 'center';
        dnc.style.backgroundColor = 'transparent';
        dnc.style.padding = '0';
        dnc.style.border = 'none';
        dnc.style.outline = 'none';
        dnc.style.cursor = 'pointer';
        dnc.style.borderRadius = '50%';
        dnc.style.overflow = 'hidden';
      }
      if (spc) {
        spc.innerText = '';
        spc.style.backgroundImage = "url('/resources/icons/ui/pinakamalakas.png')";
        if (this._isMobile) {
          spc.style.position = 'fixed';
          spc.style.left = '730px';
          spc.style.top = '164px';
          spc.style.width = '70px';
          spc.style.height = '76px';
        } else {
          spc.style.position = 'fixed';
          spc.style.left = '1320px'; // Swapped with Attack
          spc.style.top = '454px';   // Swapped with Attack
          spc.style.width = '140px';
          spc.style.height = '140px';
        }
        spc.style.zIndex = '1000';
        spc.style.backgroundSize = 'cover'; // Fill circular space without stretching
        spc.style.backgroundRepeat = 'no-repeat';
        spc.style.backgroundPosition = 'center';
        spc.style.backgroundColor = 'transparent';
        spc.style.padding = '0';
        spc.style.border = 'none';
        spc.style.outline = 'none';
        spc.style.cursor = 'pointer';
        spc.style.borderRadius = '50%';
        spc.style.overflow = 'hidden';

        // Add cooldown overlay (ML style clock)
        if (!document.getElementById('special-skill-cooldown-overlay')) {
          const overlay = document.createElement('div');
          overlay.id = 'special-skill-cooldown-overlay';
          overlay.style.position = 'absolute';
          overlay.style.top = '0';
          overlay.style.left = '0';
          overlay.style.width = '100%';
          overlay.style.height = '100%';
          overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
          overlay.style.borderRadius = '50%';
          overlay.style.display = 'none';
          overlay.style.justifyContent = 'center';
          overlay.style.alignItems = 'center';
          overlay.style.color = 'white';
          overlay.style.fontSize = '32px';
          overlay.style.fontWeight = 'bold';
          overlay.style.pointerEvents = 'none';
          spc.appendChild(overlay);
        }
      }

      const triggerAction = (stateName) => {
        const player = this.FindEntity('player');
        if (player) {
          player.GetComponent('BasicCharacterController').stateMachine_.SetState(stateName);
        }
      };

      if (atk) atk.onclick = () => {
        if (this._editMode) return;

        this._lastStatUpdate = Date.now();

        // Deduct resources: 10% Mana and 15% Energy of total maximum
        this._playerStats.mana = Math.max(0, this._playerStats.mana - (this._playerStats.maxMana * 0.10));
        this._playerStats.energy = Math.max(0, this._playerStats.energy - (this._playerStats.maxEnergy * 0.15));
        this._UpdateBars();

        // Sync updates to the server immediately to prevent UI flickering
        const net = this.FindEntity('network').GetComponent('NetworkController');
        net.socket_.emit('world.stats-update', { 
          mana: this._playerStats.mana, 
          energy: this._playerStats.energy 
        });

        triggerAction('attack');
      };

      if (dnc) dnc.onclick = () => {
        triggerAction('dance');
        
        this._lastStatUpdate = Date.now();

        const oldMana = this._playerStats.mana;
        const oldEnergy = this._playerStats.energy;

        // Regenerate 50% of Max Mana and Energy (2 clicks = full)
        this._playerStats.mana = Math.min(this._playerStats.maxMana, this._playerStats.mana + (this._playerStats.maxMana * 0.5));
        this._playerStats.energy = Math.min(this._playerStats.maxEnergy, this._playerStats.energy + (this._playerStats.maxEnergy * 0.5));
        
        const manaGained = Math.round(this._playerStats.mana - oldMana);
        const energyGained = Math.round(this._playerStats.energy - oldEnergy);

        this._UpdateBars();

        // Sync with server to prevent "flicker" overwrite
        const net = this.FindEntity('network').GetComponent('NetworkController');
        net.socket_.emit('world.stats-update', { mana: this._playerStats.mana, energy: this._playerStats.energy });

        // Show gain in chatbox
        if (manaGained > 0 || energyGained > 0) {
          this.AddChatMessage({ name: '', text: `You gained ${manaGained} Mana and ${energyGained} Energy!`, action: true });
        }
      };

      if (spc) spc.onclick = () => {
        if (this._specialCooldown > 0 || this._editMode) return;
        
        this._lastStatUpdate = Date.now();

        triggerAction('attack'); // Triggers the visual attack

        // Broadcast to the PLAYER entity so the NetworkController picks it up
        const player = this.FindEntity('player');
        if (player) {
          player.Broadcast({
            topic: 'action.attack',
            special: true,
            damage: 999999
          });
        }
        
        // Drain stats to zero
        this._playerStats.mana = 0;
        this._playerStats.energy = 0;
        this._UpdateBars();

        // Sync with server to ensure the drain is recognized globally
        const net = this.FindEntity('network').GetComponent('NetworkController');
        net.socket_.emit('world.stats-update', { 
          mana: 0, 
          energy: 0 
        });

        // Start 30s Cooldown
        this._specialCooldown = 30;
        const overlay = document.getElementById('special-skill-cooldown-overlay');
        if (overlay) {
          overlay.style.display = 'flex';
          overlay.innerText = this._specialCooldown;
        }

        const timer = setInterval(() => {
          this._specialCooldown--;
          if (this._specialCooldown <= 0) {
            clearInterval(timer);
            if (overlay) overlay.style.display = 'none';
          } else if (overlay) {
            overlay.innerText = this._specialCooldown;
          }
        }, 1000);
      };
    }

    _SetupMobileJoystick() {
      const container = document.getElementById('mobile-joystick-container');
      const handle = document.getElementById('mobile-joystick-handle');
      
      if (!this._isMobile) return; // Don't setup joystick on web

      if (!container || !handle) return;

      let active = false;

      const resetJoystick = () => {
        active = false;
        handle.style.transform = `translate(0, 0)`;
        
        const player = this.FindEntity('player');
        if (player) {
          const input = player.GetComponent('BasicCharacterControllerInput');
          if (input) {
            input._keys.forward = false;
            input._keys.backward = false;
            input._keys.left = false;
            input._keys.right = false;
            input._keys.shift = false;
          }
        }
      };

      const handleInput = (clientX, clientY) => {
        const player = this.FindEntity('player');
        if (!player) return;
        const input = player.GetComponent('BasicCharacterControllerInput');
        if (!input) return;

        // If radial menu is visible, disable joystick input to prevent unwanted movement
        if (this._ui.swap.style.visibility === 'visible') {
          resetJoystick();
          return;
        }

        const rect = container.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const dx = (clientX - centerX) / (rect.width / 2);
        const dy = (clientY - centerY) / (rect.height / 2);

        const dist = Math.sqrt(dx * dx + dy * dy);
        const cappedDist = Math.min(1, dist);
        const angle = Math.atan2(dy, dx);

        const moveX = Math.cos(angle) * cappedDist;
        const moveY = Math.sin(angle) * cappedDist;

        handle.style.transform = `translate(${moveX * 40}px, ${moveY * 40}px)`;

        // Thresholds for movement with automatic sprint detection
        input._keys.forward = moveY < -0.15;
        input._keys.backward = moveY > 0.15;
        input._keys.left = moveX < -0.15;
        input._keys.right = moveX > 0.15;
        input._keys.shift = cappedDist > 0.75;
      };

      // Native Touch Events for Mobile (Fixes "ghost dragging")
      container.addEventListener('touchstart', (e) => {
        active = true;
        handleInput(e.touches[0].clientX, e.touches[0].clientY);
      }, {passive: false});

      window.addEventListener('touchmove', (e) => {
        if (active) {
          handleInput(e.touches[0].clientX, e.touches[0].clientY);
          e.preventDefault();
        }
      }, {passive: false});

      window.addEventListener('touchend', () => {
        resetJoystick();
      });

      // Fallback Mouse Events
      container.addEventListener('mousedown', (e) => {
        if (e.button === 0) active = true; // Only activate on left-click
      });

      window.addEventListener('mousemove', (e) => {
        if (active) {
          if (e.buttons !== 1) {
            resetJoystick();
            return;
          }
          handleInput(e.clientX, e.clientY);
        }
      });

      window.addEventListener('mouseup', () => {
        resetJoystick();
      });
    }

    FadeoutLogin() {
      const loginElement = document.getElementById('login-ui');
      if (loginElement.classList.contains('fadeOut')) {
        return;
      }
  
      loginElement.classList.toggle('fadeOut');
      loginElement.style.display = 'none'; // Force hide to prevent getting stuck
      document.getElementById('game-ui').style.visibility = 'visible';

      const loginInput = document.getElementById('login-input');
      const nameElement = document.getElementById('player-name-text');
      if (nameElement && loginInput) {
        nameElement.innerText = loginInput.value || 'Nameless';
      }

      // Reveal Gameplay UI
      const healthUI = document.getElementById('health-ui');
      if (healthUI) {
        healthUI.style.display = 'block';
        healthUI.style.visibility = 'visible';
      }

      const iconBar = document.getElementById('icon-bar');
      if (iconBar) {
        iconBar.style.display = 'flex';
        iconBar.style.visibility = 'visible';
      }

      // Reveal action buttons and avatar for Gameplay
      const atk = document.getElementById('mobile-btn-attack');
      const dnc = document.getElementById('mobile-btn-dance');
      const spc = document.getElementById('mobile-btn-special');
      const avatar = document.getElementById('player-profile-avatar');
      if (atk) { atk.style.display = 'block'; atk.style.visibility = 'visible'; }
      if (dnc) { dnc.style.display = 'block'; dnc.style.visibility = 'visible'; }
      if (spc) {
        spc.style.display = 'block';
        spc.style.visibility = 'visible';
      }
      if (avatar) { avatar.style.display = 'block'; avatar.style.visibility = 'visible'; }

      // Toggle joystick visibility based on platform
      const joystick = document.getElementById('mobile-joystick-container');
      if (joystick) {
        joystick.style.display = this._isMobile ? 'flex' : 'none';
        joystick.style.justifyContent = 'center';
        joystick.style.alignItems = 'center';
        joystick.style.visibility = this._isMobile ? 'visible' : 'hidden';
        joystick.style.position = 'fixed';
        joystick.style.zIndex = '10000';
      }

      this._UpdateInventoryBackground(this._currentClass);
    }  
    
    _OnAvatarClicked() {
      const avatarIcon = document.getElementById('profile-avatar-icon');
      if (!avatarIcon) return;

      const defaultSrc = '/resources/icons/ui/avatar.jpg';
      if (avatarIcon.src.endsWith('avatar.jpg')) {
        let classPart = this._currentClass;
        if (classPart === 'sorceror') classPart = 'sorcerer';
        avatarIcon.src = `/resources/icons/ui/characteravatars/${classPart}profile.png`;
      } else {
        avatarIcon.src = defaultSrc;
      }
    }

    _UpdateInventoryBackground(className) {
      const invBg = document.getElementById('inventory-character-bg');
      if (invBg) {
        let classPart = className;
        let fileName = 'inventory.png';
        if (classPart === 'sorceror') {
          classPart = 'sorcerer';
          fileName = 'inventor.png'; // Matching your filename: sorcererinventor.png
        }
        invBg.style.backgroundImage = `url('/resources/icons/ui/characterinventory/${classPart}${fileName}')`;
      }
    }

    OnChatKeyDown_(evt) {
      if (evt.key === 'Enter') {
        evt.preventDefault();
        const msg = this.chatElement_.value;
        if (msg != '') {
          const net = this.FindEntity('network').GetComponent(
              'NetworkController');
          net.SendChat(msg);
        }
        this.chatElement_.value = '';
      }
      evt.stopPropagation();
    }

    AddQuest(quest) {
      if (quest.id in this._quests) {
        return;
      }

      const e = document.createElement('DIV');
      e.className = 'quest-entry';
      e.id = 'quest-entry-' + quest.id;
      e.innerText = quest.title;
      e.onclick = (evt) => {
        this.OnQuestSelected_(e.id);
      };
      document.getElementById('quest-journal').appendChild(e);

      this._quests[quest.id] = quest;
      this.OnQuestSelected_(quest.id);
    }

    AddEventMessages(events) {
      for (let e of events) {
        if (e.type != 'attack') {
          continue;
        }
        if (e.attacker.Name != 'player' && e.target.Name != 'player') {
          continue;
        }

        const attackerName = e.attacker.Name == 'player' ? 'You' : e.attacker.Account.name;
        const targetName = e.target.Name == 'player' ? 'you' : e.target.Account.name;

        this.AddChatMessage({
            name: '',
            text: attackerName + ' hit ' + targetName + ' for ' + e.amount + ' damage!',
            action: true,
        });
      }
    }

    AddChatMessage(msg) {
      const e = document.createElement('div');
      e.className = 'chat-text';
      if (msg.server) {
        e.className += ' chat-text-server';
      } else if (msg.action) {
        e.className += ' chat-text-action';
      } else {
        e.innerText = '[' + msg.name + ']: ';
      }
      e.innerText += msg.text;
      const chatElement = document.getElementById('chat-ui-text-area');
      chatElement.insertBefore(e, document.getElementById('chat-input'));
    }

    OnQuestSelected_(id) {
      const quest = this._quests[id];

      const e = document.getElementById('quest-ui');
      e.style.visibility = '';

      const text = document.getElementById('quest-text');
      text.innerText = quest.text;

      const title = document.getElementById('quest-text-title');
      if (title) title.innerText = '';
    }

    HideUI() {
      this._StopQuestTypewriter();
      const uiElements = Object.values(this._ui);
      for (let el of uiElements) {
        if (el) el.style.visibility = 'hidden';
      }
    }
    
    OnQuestsClicked_(msg) {
      const isHidden = this._ui.quests.style.visibility === 'hidden';
      this.HideUI();
      const targetVisibility = isHidden ? 'visible' : 'hidden';
      this._ui.quests.style.visibility = targetVisibility;

      if (targetVisibility === 'visible') {
        this._StartQuestTypewriter();
      } else {
        this._StopQuestTypewriter();
      }
    }

    _StopQuestTypewriter() {
      this._typewriterTimers.forEach(t => clearInterval(t));
      this._typewriterTimers = [];
    }

    _StartQuestTypewriter() {
      this._StopQuestTypewriter();

      const city = "BIRINGAN CITY";
      const body = "Sa wakas ay narating mo na ang nakapangingilabot at kumikinang na Lungsod ng Biringan na siyang pinaka-puso ng lagusan patungo sa kabilang mundo kung saan ang bawat anino ay may mga matang nagmamasid at ang bawat bulong ay sumpa sa iyong kaluluwa.\n\n" +
                   "Bilang itinakdang Bagani ay kailangang dumanak ang luha at dugo sa pagitan mo at ng mga dambuhalang malignong naghahari sa kadiliman dahil ikaw lamang ang tanging pag-asa na magtatapos sa milenyong hidwaan ng tao at espiritu bago pa tuluyang lamunin ng lagim ang buong sangkatauhan.\n\n" +
                   "Ihanda mo ang iyong buong pagkatao dahil ang bawat hakbang mo sa lupain ng mga engkanto ay isang pakikipagpatayan para sa kapayapaan kaya huwag kang kukurap dahil sa oras na ikaw ay madaig ay magiging bahagi ka na lamang ng mga ligaw na kaluluwang habambuhay na magsisilbing alipin sa ginintuang lungsod na ito.";

      const cityEl = document.getElementById('quest-journal-city');
      const titleEl = document.getElementById('quest-journal-title');
      const bodyEl = document.getElementById('quest-journal-text');

      cityEl.innerText = '';
      titleEl.innerText = '';
      bodyEl.innerText = '';

      this._AnimateText(city, cityEl, 60, () => {
        this._AnimateText(body, bodyEl, 35);
      });
    }

    _AnimateText(text, element, speed, callback) {
      let i = 0;
      const timer = setInterval(() => {
        if (i < text.length) {
          element.innerText += text.charAt(i);
          i++;
        } else {
          clearInterval(timer);
          if (callback) callback();
        }
      }, speed);
      this._typewriterTimers.push(timer);
    }

    OnStatsClicked_(msg) {
      const isHidden = this._ui.stats.style.visibility === 'hidden';
      this.HideUI();
      this._ui.stats.style.visibility = isHidden ? 'visible' : 'hidden';
    }

    OnInventoryClicked_(msg) {
      const isHidden = this._ui.inventory.style.visibility === 'hidden';
      this.HideUI();
      this._ui.inventory.style.visibility = isHidden ? 'visible' : 'hidden';
    }

    OnSwapClicked_(msg) {
      if (!this._ui.swap) return;
      const isHidden = this._ui.swap.style.visibility !== 'visible';
      this.HideUI();
      this._ui.swap.style.visibility = isHidden ? 'visible' : 'hidden';

      // Clear all movement keys when opening the menu
      if (isHidden) {
        const player = this.FindEntity('player');
        if (player) {
          const input = player.GetComponent('BasicCharacterControllerInput');
          if (input) {
            Object.keys(input._keys).forEach(k => input._keys[k] = false);
          }
        }
      }
    }

    _SetupRadialMenu() {
      const classes = ['zombie', 'guard', 'paladin', 'warrok', 'sorceror'];
      for (let c of classes) {
        const el = document.getElementById('class-select-' + c);
        if (el) {
          el.onclick = (e) => {
            e.stopPropagation(); // Stop the click from affecting the game world
            this._OnClassSelected(c);
          };
          el.onmousedown = (e) => e.stopPropagation();
        }
      }
    }

    _OnClassSelected(className) {
      const player = this.FindEntity('player').GetComponent('BasicCharacterController');
      player.ChangeClass(className);

      this._currentClass = className;

      const modelData = defs.CHARACTER_MODELS[className];
      const net = this.FindEntity('network').GetComponent('NetworkController');
      net.SendClassChange(className, modelData.inventory);

      // Reset Profile Avatar to default image on swap
      const avatar = document.getElementById('profile-avatar-icon');
      if (avatar) {
        avatar.src = `/resources/icons/ui/avatar.jpg`;
      }

      this._UpdateInventoryBackground(className);

      this.HideUI();
    }

    Update(timeInSeconds) {
    }
  };

  return {
    UIController: UIController,
  };

})();
