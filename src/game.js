import * as T from 'three';
import { CHAPTERS, MODULES, STAGES, EQUIPMENT } from './data.js';
import { POINTS } from './world.js';
import { newState, advance, completeChapter, equipmentStats, writeSave, equip } from './state.js';
import { Sound } from './audio.js';
import { damp, turnToward, moveVelocity } from './mechanics.js';
import { Aim } from './aim.js';
import { aimWeapon } from './robot-motion.js';
import { AbilityEffects } from './ability-effects.js';
import { abilityState } from './guidance.js';
import { storage } from './storage.js';
import { Encounters } from './encounters.js';
import { Exploration } from './exploration.js';
import { applyRobotSkin } from './robot-rig.js';
import { animateEnemy } from './models.js';

const v = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const horizontalDistance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export class Game {
  constructor(world, state, settings) {
    this.world = world;
    this.state = state;
    this.settings = settings;
    this.sound = new Sound(settings);
    this.events = new EventTarget();
    this.mode = 'menu';
    this.keys = new Set();
    this.actors = [];
    this.projectiles = [];
    this.time = 0;
    this.yaw = 0;
    this.pitch = 0.2;
    this.distance = 11;
    this.cameraTarget = v();
    this.cameraPosition = v();
    this.lastSave = 0;
    this.shake = 0;
    this.timeSlow = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.rightDrag = null;
    this.cameraRay = new T.Raycaster();
    this.velocity = v();
    this.hitStop = 0;
    this.lockedTarget = null;
    this.lastDodge = -10;
    this.lastFeedback = 0;
    this.aim = new Aim(this);
    this.jumpBuffer = 0;
    this.dashBuffer = 0;
    this.abilityEffects = new AbilityEffects(this);
    this.encounters = new Encounters(this);
    this.exploration = new Exploration(this);
    this.bindInput();
    this.load(this.state.location, true);
  }
  on(name, handler) {
    this.events.addEventListener(name, (event) => handler(event.detail));
  }
  emit(name, detail) {
    this.events.dispatchEvent(new CustomEvent(name, { detail }));
  }
  get chapter() {
    return this.state.location === 'hub' ? null : CHAPTERS[this.state.location];
  }
  get cs() {
    return this.state.location === 'hub' ? null : this.state.chapters[this.state.location];
  }
  get playing() {
    return this.mode === 'playing';
  }
  get mode() {
    return this._mode;
  }
  set mode(value) {
    if (this._mode !== value) this.clearInput();
    this._mode = value;
  }
  clearInput() {
    this.keys?.clear();
    this.rightDrag = null;
    this.velocity?.set(0, 0, 0);
    this.jumpBuffer = 0;
    this.dashBuffer = 0;
    this.meleeBuffered = 0;
    this.dashTime = 0;
    this.aim?.reset();
  }
  bindInput() {
    window.addEventListener('keydown', (event) => {
      if (event.code === 'Escape') {
        event.preventDefault();
        if (this.arrival && this.playing) {
          this.arrival = null;
          return;
        }
        this.emit('escape');
        return;
      }
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)
        return;
      const key = event.code;
      if (
        this.playing &&
        ['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)
      )
        event.preventDefault();
      if (event.repeat) return;
      if (key === 'Escape') {
        this.emit('escape');
        return;
      }
      if (key === 'Enter' && this.mode === 'dialog') {
        event.preventDefault();
        this.emit('dialog-next');
        return;
      }
      if (!this.playing) return;
      this.keys.add(key);
      if (this.arrival) {
        this.arrival = null;
        if (key === 'Space') return;
      }
      if (key === 'KeyV') this.exploration.scan();
      if (key === 'Space') {
        this.jumpBuffer = 0.13;
        this.jump();
      }
      if (key.startsWith('Shift')) {
        this.dashBuffer = 0.13;
        this.dash();
      }
      if (key === 'KeyJ') this.melee();
      if (key === 'KeyK') {
        this.aim.mouse = false;
        this.shoot();
      }
      if (key === 'KeyF') this.ability();
      if (key === 'KeyE') this.interact();
      if (key === 'KeyL') this.toggleLock();
      if (key === 'KeyG') this.heal();
      if (key === 'Tab' || key === 'KeyM') this.emit('journal');
      if (key === 'KeyC' && this.state.location === 'hub') this.emit('workshop');
      if (/Digit[1-4]/.test(key)) this.selectModule(Object.keys(MODULES)[Number(key.at(-1)) - 1]);
    });
    window.addEventListener('keyup', (event) => this.keys.delete(event.code));
    window.addEventListener('blur', () => {
      this.clearInput();
      if (this.playing) this.emit('pause');
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.playing) {
        this.clearInput();
        this.emit('pause');
      }
    });
    const canvas = this.world.renderer.domElement;
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    canvas.addEventListener('pointerdown', (event) => {
      if (!this.playing) return;
      this.arrival = null;
      this.sound.start();
      if (event.button === 0) {
        this.aim.setPointer(event);
        this.keys.add('Mouse0');
        this.shoot();
      }
      if (event.button === 1) {
        event.preventDefault();
        this.toggleLock();
      }
      if (event.button === 2) {
        this.rightDrag = { x: event.clientX, y: event.clientY, moved: 0 };
        this.aim.mouse = true;
        this.aim.pointer.set(0, 0);
      }
    });
    window.addEventListener('pointerup', (event) => {
      if (event.button === 0) this.keys.delete('Mouse0');
      if (event.button === 2 && this.rightDrag) {
        if (this.rightDrag.moved < 5 && this.playing) this.melee();
        this.rightDrag = null;
      }
    });
    window.addEventListener('pointercancel', () => this.clearInput());
    canvas.addEventListener('pointerleave', () => {
      if (!this.keys.has('Mouse0') && !this.rightDrag) this.aim.mouse = false;
    });
    window.addEventListener('pointermove', (event) => {
      if (!this.playing) return;
      if (!this.rightDrag) {
        if (event.target === canvas) this.aim.setPointer(event);
        return;
      }
      const dx = event.clientX - this.rightDrag.x,
        dy = event.clientY - this.rightDrag.y;
      this.rightDrag.moved += Math.abs(dx) + Math.abs(dy);
      this.rightDrag.x = event.clientX;
      this.rightDrag.y = event.clientY;
      this.yaw -= dx * 0.005 * this.settings.sensitivity;
      this.pitch = T.MathUtils.clamp(this.pitch + dy * 0.004, -0.04, 0.9);
    });
    canvas.addEventListener(
      'wheel',
      (event) => {
        if (this.playing) {
          event.preventDefault();
          this.distance = T.MathUtils.clamp(this.distance + event.deltaY * 0.01, 7, 17);
        }
      },
      { passive: false },
    );
  }
  load(location, preview = false) {
    this.clearInput();
    this.abilityEffects.clear();
    this.encounters?.clear();
    this.arrival = null;
    this.bossAnnounced = false;
    this.lockedTarget = null;
    this.velocity.set(0, 0, 0);
    this.hitStop = 0;
    this.keys.clear();
    this.cinematic = null;
    this.state.location = location;
    this.world.load(location, this.state);
    this.actors = [];
    this.projectiles = [];
    this.stats = equipmentStats(this.state);
    this.hp = this.stats.chassis.hp;
    this.energy = 100;
    this.heals = this.state.chapters[0].helped ? 4 : 3;
    this.cooldowns = { shot: 0, melee: 0, dash: 0, ability: 0 };
    this.invincible = 0;
    this.dashTime = 0;
    this.dashVector = v();
    this.velocityY = 0;
    this.jumps = 0;
    this.attackTime = 0;
    this.timeSlow = 0;
    this.combo = 0;
    this.player = this.world.robot(this.stats.skin);
    this.world.root.add(this.player);
    this.world.subject = this.player;
    const checkpoints = [
      [0, 29],
      [-8, 10],
      [-18, -19],
      [17, -48],
      [0, -78],
      [0, -126],
      [0, -137],
    ];
    const point = location === 'hub' ? [0, 9] : preview ? [0, 23] : checkpoints[this.cs.stage];
    this.player.position.set(point[0], 0, point[1]);
    this.yaw = 0;
    if (this.state.equipment.chassis === 'guardian') this.player.scale.set(1.18, 1, 1.15);
    if (this.state.equipment.chassis === 'drifter')
      this.world.box([1.9, 0.15, 0.6], [0, 1.8, 0.5], '#d69964', this.player);
    for (let i = 0; i < this.state.modules.length; i++)
      this.world.mesh(
        'OctahedronGeometry',
        [0.13, 0],
        MODULES[this.state.modules[i]].color,
        [-0.4 + i * 0.27, 1.9, 0.75],
        this.player,
        1,
      );
    if (location !== 'hub') this.spawnEnemies(location);
    this.exploration.load();
    this.sound.setChapter(location === 'hub' ? this.state.unlocked : location);
    this.cameraTarget.copy(this.player.position).add(v(0, 1.6, 0));
    this.cameraPosition.copy(this.player.position).add(v(0, 7, 11));
    this.world.camera.position.copy(this.cameraPosition);
    this.world.camera.lookAt(this.cameraTarget);
    this.nearby = null;
    this.emit('loaded', { location });
  }
  start(fresh = false) {
    if (fresh) {
      const chosen = this.state.equipment.skin;
      this.state = newState();
      if (EQUIPMENT.skin.some((s) => s.id === chosen && s.cost === 0))
        equip(this.state, 'skin', chosen);
    }
    this.load(this.state.location);
    this.mode = 'playing';
    this.sound.start();
    this.save();
    this.emit('started');
    if (this.chapter) {
      this.emit('chapter', this.chapter);
      if (this.cs.stage === 0) this.beginArrival();
    }
  }
  travel(index) {
    if (index > this.state.unlocked || index < 0 || index > 3) return;
    this.load(index);
    this.mode = 'playing';
    this.save();
    this.emit('started');
    this.emit('chapter', this.chapter);
    if (this.cs.stage === 0) this.beginArrival();
  }
  beginArrival(boss = false) {
    if (!this.settings.reducedMotion)
      this.arrival = { remaining: boss ? 2.6 : 4, total: boss ? 2.6 : 4, boss };
  }
  toHub() {
    this.load('hub');
    this.mode = 'playing';
    this.save();
    this.emit('started');
    this.toast('归航完成', '身体已修复 · 修复包已补充');
  }
  spawnEnemies(index) {
    const list = [
      ['relay-0', 'cutter', -15, -15],
      ['relay-1', 'turret', -25, -25],
      ['relay-2', 'beacon', -10, -29],
      ['module-0', 'cutter', 14, -37],
      ['module-1', 'turret', 25, -47],
      ['module-2', 'beacon', 11, -55],
      ['optional-0', 'cutter', -25, -48],
      ['optional-1', 'turret', 27, -120],
      ['boss', 'boss', 0, -103],
    ];
    for (const [id, type, x, z] of list) {
      if (this.cs.killed.includes(id)) continue;
      const boss = type === 'boss',
        hp = boss
          ? 560 + index * 130
          : type === 'cutter'
            ? 75 + index * 12
            : type === 'turret'
              ? 65 + index * 12
              : 55 + index * 10;
      const mesh = this.world.enemy(type, x, z, index, boss);
      const warning = this.world.ring(
        boss ? 9 : 3,
        0.12,
        '#ff8967',
        [x, 0.15, z],
        this.world.root,
        1.7,
      );
      warning.rotation.x = Math.PI / 2;
      warning.visible = false;
      this.actors.push({
        id,
        type,
        mesh,
        hp,
        maxHp: hp,
        cooldown: boss ? 2 : 1 + Math.random(),
        windup: 0,
        stunned: 0,
        exposed: 0,
        warning,
        phase: 0,
        attacks: 0,
        active: false,
        boss,
        armBroken: false,
        cannonBroken: false,
      });
    }
  }
  save() {
    const saved = writeSave(storage, this.state);
    this.lastSaveSucceeded = saved;
    this.emit(saved ? 'saved' : 'storage-error');
    return saved;
  }
  toast(title, body = '') {
    if (this.lastToast === title && this.time - this.lastFeedback < 1.5) return;
    this.lastToast = title;
    this.lastFeedback = this.time;
    this.emit('toast', { title, body });
  }
  progress(stage) {
    if (advance(this.state, this.state.location, stage)) {
      this.world.updateMarkers(this.cs);
      this.exploration.refresh();
      this.hp = this.stats.chassis.hp;
      this.energy = 100;
      this.heals = this.state.chapters[0].helped ? 4 : 3;
      this.save();
      this.sound.play('interact');
      this.emit('objective');
    }
  }
  dialog(lines, onDone) {
    this.keys.clear();
    this.mode = 'dialog';
    this.emit('dialog', {
      lines,
      onDone: () => {
        this.mode = 'playing';
        onDone?.();
      },
    });
  }
  changeSkin(id) {
    const skin = EQUIPMENT.skin.find((s) => s.id === id);
    if (
      !skin ||
      (!this.state.owned.includes(id) && skin.cost > 0) ||
      !equip(this.state, 'skin', id)
    )
      return false;
    this.stats.skin = skin;
    applyRobotSkin(this.world, this.player, skin);
    this.save();
    this.emit('skin-changed', skin);
    return true;
  }
  selectModule(id) {
    if (this.state.modules.includes(id) && this.state.activeModule !== id) {
      this.state.activeModule = id;
      this.sound.play('interact');
      this.save();
    }
  }
  jump() {
    if (this.jumps >= 2) return;
    this.jumpBuffer = 0;
    this.velocityY = this.jumps === 0 ? 10 : 9;
    this.jumps++;
    this.emit('training-action', 'jump');
    this.world.burst(this.player.position, '#c2eadd', 5);
    this.sound.play('dash');
  }
  movementDirection() {
    const forward =
      (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) -
      (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0);
    const right =
      (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) -
      (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
    return v(
      right * Math.cos(this.yaw) - forward * Math.sin(this.yaw),
      0,
      -right * Math.sin(this.yaw) - forward * Math.cos(this.yaw),
    ).normalize();
  }
  dash() {
    const cost = this.dashCost();
    if (this.cooldowns.dash > 0) return;
    if (this.energy < cost) {
      this.toast('推进能源不足', '稍等片刻，让推进器恢复');
      return;
    }
    this.dashBuffer = 0;
    this.emit('training-action', 'dash');
    this.energy -= cost;
    this.cooldowns.dash = 0.28;
    this.dashTime = 0.19;
    this.invincible = 0.22;
    this.hitStop = 0;
    this.player.userData.slash = 0;
    this.attackTime = 0;
    this.meleeBuffered = 0;
    this.dashVector = this.movementDirection();
    if (!this.dashVector.lengthSq())
      this.dashVector.set(-Math.sin(this.player.rotation.y), 0, -Math.cos(this.player.rotation.y));
    this.sound.play('dash');
    this.world.wave(this.player.position, this.world.color, 2);
  }
  dashCost() {
    return (
      (this.state.equipment.chassis === 'drifter' ? 14 : 22) -
      (this.state.chapters[3].helped ? 4 : 0)
    );
  }
  target(range, melee = false) {
    if (
      !melee &&
      this.lockedTarget?.hp > 0 &&
      horizontalDistance(this.lockedTarget.mesh.position, this.player.position) < range
    )
      return this.lockedTarget;
    if (!melee) return this.aim.select(range);
    return this.actors
      .filter(
        (e) =>
          e.hp > 0 &&
          (!e.boss || this.cs.stage >= 4) &&
          horizontalDistance(e.mesh.position, this.player.position) < range,
      )
      .sort(
        (a, b) =>
          horizontalDistance(a.mesh.position, this.player.position) -
          horizontalDistance(b.mesh.position, this.player.position),
      )[0];
  }
  toggleLock() {
    if (this.lockedTarget) {
      this.lockedTarget = null;
      this.toast('已解除锁定');
      return;
    }
    this.lockedTarget = this.target(48);
    if (this.lockedTarget) {
      this.sound.play('lock');
      this.toast('目标已锁定', 'L / 鼠标中键解除 · 移动时保持跟随');
    } else this.toast('视野内没有目标');
  }
  shoot() {
    if (this.cooldowns.shot > 0 || this.state.location === 'hub') return;
    const weapon = this.stats.weapon;
    this.cooldowns.shot = weapon.interval;
    this.attackTime = 0.12;
    this.player.userData.fire = this.time + 0.17;
    this.player.userData.shotAt = this.time;
    this.player.userData.aimUntil = this.time + 0.6;
    const intended = this.aim.resolve().intended;
    this.face(intended);
    this.player.userData.aimAt = intended.clone();
    aimWeapon(this.player, intended, true);
    const shot = this.aim.resolve();
    this.aim.solution = shot;
    this.aim.kick = weapon.id === 'lance' ? 1 : 0.65;
    if (shot.target) {
      this.damageEnemy(shot.target, weapon.damage, 'shot');
      this.sound.play('confirm');
    }
    this.world.shotEffect(shot.from, shot.point, weapon.id, !!shot.target || shot.blocked);
    this.sound.play(weapon.id === 'lance' ? 'lance' : 'shot');
    this.emit('fire', shot);
  }
  melee() {
    if (this.state.location === 'hub') return;
    if (this.cooldowns.melee > 0) {
      if (this.cooldowns.melee < 0.18) this.meleeBuffered = 0.2;
      return;
    }
    this.player.userData.slash = this.time + 0.32;
    this.cooldowns.melee = 0.38;
    this.attackTime = 0.32;
    this.combo = this.comboTimer > 0 ? (this.combo % 3) + 1 : 1;
    this.comboTimer = 1.1;
    const target = this.target(8, true);
    if (target) {
      this.face(target.mesh.position);
      const delta = target.mesh.position.clone().sub(this.player.position);
      delta.y = 0;
      if (delta.length() > 3) {
        delta.normalize();
        this.player.position.addScaledVector(delta, 2);
        this.resolvePosition();
      }
      for (const e of this.actors)
        if (
          e.hp > 0 &&
          horizontalDistance(e.mesh.position, this.player.position) < (e.boss ? 7 : 4.5) &&
          (!e.boss || this.cs.stage >= 4)
        )
          this.damageEnemy(e, this.combo === 3 ? 55 : 30, 'melee');
    }
    const center = this.player.position
      .clone()
      .add(
        v(-Math.sin(this.player.rotation.y) * 1.5, 0.1, -Math.cos(this.player.rotation.y) * 1.5),
      );
    this.world.wave(center, this.combo === 3 ? '#ffcc87' : '#b9f6e7', this.combo === 3 ? 4 : 2.8);
    this.sound.play('slash');
    this.world.slash(this.player.position, this.player.rotation.y, this.combo);
    this.emit('combo', { combo: this.combo });
  }
  face(point) {
    this.player.rotation.y = Math.atan2(
      -(point.x - this.player.position.x),
      -(point.z - this.player.position.z),
    );
  }
  damageEnemy(e, raw, source) {
    if (e.hp <= 0) return;
    const shield =
      !e.boss &&
      e.type !== 'beacon' &&
      this.actors.some(
        (a) =>
          a.type === 'beacon' &&
          a.hp > 0 &&
          horizontalDistance(a.mesh.position, e.mesh.position) < 18 &&
          a.stunned <= 0,
      );
    let damage = raw * (shield ? 0.4 : 1) * (e.boss && e.exposed <= 0 ? 0.48 : 1);
    if (source === 'melee' && !e.boss) e.stunned = Math.max(e.stunned, 0.4);
    e.hp -= damage;
    e.active = true;
    this.world.burst(e.mesh.position, shield ? '#bdd8ef' : '#ffc188', 5, e.boss ? 1.5 : 1);
    this.emit('hit', {
      damage: Math.round(damage),
      shield,
      position: e.mesh.position.clone().add(v(0, e.boss ? 5 : 2.5, 0)),
      heavy: source === 'melee',
    });
    if (source === 'melee') {
      this.hitStop = this.settings.reducedMotion ? 0 : 0.045;
      this.shake = this.settings.shake ? 0.09 : 0;
      this.sound.play('impact');
    }
    if (e.boss) {
      if (!e.armBroken && e.hp < e.maxHp * 0.66) {
        e.armBroken = true;
        e.mesh.userData.arms[0].visible = false;
        this.toast('左侧切割臂已拆除', '横扫范围缩小 · 获得 15 零件');
        this.state.salvage += 15;
        this.world.burst(e.mesh.position, '#ffb579', 22, 2);
      }
      if (!e.cannonBroken && e.hp < e.maxHp * 0.33) {
        e.cannonBroken = true;
        e.mesh.userData.arms[1].visible = false;
        this.toast('右侧炮组已拆除', '追踪弹数量减少 · 获得 15 零件');
        this.state.salvage += 15;
      }
    }
    if (e.hp <= 0) {
      if (this.lockedTarget === e) this.lockedTarget = null;
      this.world.root.remove(e.mesh);
      this.world.root.remove(e.warning);
      this.world.burst(e.mesh.position, '#f6c18f', e.boss ? 35 : 15, e.boss ? 2.5 : 1);
      this.world.wave(e.mesh.position, '#efb97e', e.boss ? 12 : 3);
      this.sound.play('kill');
      const group = e.id.split('-')[0];
      const cleared =
        ['relay', 'module'].includes(group) &&
        !this.actors.some((other) => other.hp > 0 && other.id.startsWith(group));
      this.emit('defeat', { boss: e.boss, reward: e.boss ? 40 : 8, cleared, group });
      if (cleared) this.sound.play('clear');
      this.state.salvage += e.boss ? 40 : 8;
      this.state.kills++;
      if (!this.cs.killed.includes(e.id)) this.cs.killed.push(e.id);
      this.hp = Math.min(this.stats.chassis.hp, this.hp + (e.boss ? 100 : 8));
      if (e.boss && this.cs.stage === 4) {
        this.progress(5);
        this.toast('攻击系统已解除', '环境控制回路保留 · 前往观察系统');
      } else this.save();
    }
  }
  ability() {
    if (!this.playing) return;
    const id = this.state.activeModule;
    const status = abilityState(this);
    if (!status.ready) {
      this.emit('ability-blocked', status);
      return;
    }
    const p = this.player.position,
      origin = p.clone(),
      hpBefore = this.hp,
      targets = [];
    let affected = 0,
      opened = false;
    if (this.chapter && this.cs.stage === 3 && Math.hypot(p.x, p.z + 62) < 15) {
      if (id !== this.chapter.module) {
        this.toast(
          '需要 ' + this.chapter.moduleName,
          '按 ' + MODULES[this.chapter.module].key + ' 切换模块，再按 F',
        );
        return;
      }
      this.progress(4);
      opened = true;
      this.toast('通路已开启', '新的身体，带你去往新的地方');
    }
    this.energy -= 30;
    this.cooldowns.ability = this.state.chapters[2].helped ? 5 : 6;
    this.sound.play('ability-' + id);
    if (id === 'anchor') {
      for (const e of this.actors)
        if (
          e.hp > 0 &&
          horizontalDistance(e.mesh.position, p) < 23 &&
          (!e.boss || this.cs.stage >= 4)
        ) {
          targets.push(e.mesh.position.clone());
          affected++;
          if (!e.boss) {
            const delta = p.clone().sub(e.mesh.position).normalize();
            e.mesh.position.addScaledVector(
              delta,
              Math.min(9, Math.max(0, horizontalDistance(e.mesh.position, p) - 3)),
            );
          }
          e.stunned = e.boss ? 1.3 : 2.8;
          e.exposed = 7;
          e.windup = 0;
          this.encounters.cancel(e);
          e.warning.visible = false;
          this.damageEnemy(e, 20, 'ability');
        }
    } else if (id === 'bloom') {
      this.hp = Math.min(
        this.stats.chassis.hp,
        this.hp + 32 + (this.state.chapters[1].helped ? 10 : 0),
      );
      for (const e of this.actors)
        if (
          e.hp > 0 &&
          horizontalDistance(e.mesh.position, p) < 17 &&
          (!e.boss || this.cs.stage >= 4)
        ) {
          affected++;
          e.stunned = e.boss ? 1 : 3;
          this.encounters.cancel(e);
          e.exposed = 5;
          this.damageEnemy(e, 26, 'ability');
        }
    } else if (id === 'time') {
      this.timeSlow = 6;
      for (const e of this.actors)
        if (e.boss && horizontalDistance(e.mesh.position, p) < 24) e.exposed = 6;
    } else if (id === 'phase') {
      this.player.position.copy(this.phaseDestination());
      this.invincible = 0.9;
      for (const e of this.actors)
        if (
          e.hp > 0 &&
          horizontalDistance(e.mesh.position, this.player.position) < 12 &&
          (!e.boss || this.cs.stage >= 4)
        ) {
          affected++;
          e.exposed = 4;
          this.damageEnemy(e, 65, 'ability');
        }
    }
    const result = {
      id,
      origin,
      destination: p.clone(),
      targets,
      affected,
      healed: Math.max(0, this.hp - hpBefore),
      opened,
    };
    this.abilityEffects.cast(result);
    this.emit('ability-cast', result);
  }
  phaseDestination() {
    const point = this.player.position
      .clone()
      .add(v(-Math.sin(this.player.rotation.y) * 13, 0, -Math.cos(this.player.rotation.y) * 13));
    this.resolvePosition(point);
    return point;
  }
  heal() {
    if (!this.heals || this.hp >= this.stats.chassis.hp) {
      this.toast(this.heals ? '耐久已满' : '修复包已用完', '完成任务节点或返回飞船可补充');
      return;
    }
    this.heals--;
    this.hp = Math.min(this.stats.chassis.hp, this.hp + 55);
    this.world.wave(this.player.position, '#c2e88d', 3);
    this.sound.play('interact');
    this.toast('修复完成', '+55 耐久');
  }
  hurt(amount) {
    if (!this.playing) return;
    if (this.invincible > 0) {
      if (this.dashTime > 0 && this.time - this.lastDodge > 1) {
        this.lastDodge = this.time;
        this.energy = Math.min(100, this.energy + 12);
        this.sound.play('dodge');
        this.emit('dodge');
      }
      return;
    }
    this.hp = Math.max(0, this.hp - amount * (this.settings.difficulty === 'story' ? 0.5 : 1));
    this.invincible = 0.5;
    this.shake = this.settings.shake ? 0.2 : 0;
    this.player.userData.hurtUntil = this.time + 0.25;
    this.sound.play('hurt');
    this.emit('hurt');
    if (this.hp <= 0) {
      this.state.deaths++;
      this.save();
      this.keys.clear();
      this.mode = 'dead';
      this.emit('dead');
    }
  }
  retry() {
    this.load(this.state.location);
    this.mode = 'playing';
    this.emit('started');
    this.toast('从最近节点重新启动', '已取得的部件、记录与世界变化均已保留');
  }
  objective() {
    if (!this.chapter)
      return {
        text: '在飞船中休息、改造，或选择下一个坐标',
        target: { x: 0, z: -15 },
        name: '星图 / 启航',
      };
    const stage = this.cs.stage,
      ids = ['npc', 'relay', 'module', 'gate', 'boss', 'reveal', 'spawn'];
    const point = POINTS[ids[stage]];
    const guardian = stage === 4 ? this.actors.find((e) => e.boss && e.hp > 0) : null;
    return {
      text: STAGES[stage],
      target: guardian ? guardian.mesh.position : { x: point[0], z: point[1] },
      name:
        stage === 4
          ? this.chapter.boss
          : stage === 3
            ? this.chapter.moduleName + ' · F'
            : STAGES[stage],
    };
  }
  updateNearby() {
    let nearest = null,
      distance = 5;
    for (const marker of this.world.markers) {
      if (!marker.group.visible && marker.id !== 'npc') continue;
      if (this.chapter && marker.id === 'npc' && this.cs.stage > 0) continue;
      const d = Math.hypot(marker.x - this.player.position.x, marker.z - this.player.position.z);
      if (d < distance) {
        distance = d;
        nearest = marker;
      }
    }
    this.nearby = nearest;
  }
  interact() {
    this.updateNearby();
    const item = this.nearby;
    if (!item) {
      this.toast('附近没有可互动对象', '沿任务信标靠近目标 · V 扫描附近信号');
      return;
    }
    if (this.state.location === 'hub') {
      this.hubInteract(item.id);
      return;
    }
    const cs = this.cs,
      chapter = this.chapter;
    if (item.id.startsWith('cache-')) {
      this.exploration.collect(item.id.slice(6));
      return;
    }
    if (item.id === 'side') {
      this.exploration.interact();
      return;
    }
    if (item.id === 'npc' && cs.stage === 0) this.dialog(chapter.talk, () => this.progress(1));
    if (item.id === 'relay' && cs.stage === 1) {
      if (this.actors.some((e) => e.id.startsWith('relay') && e.hp > 0)) {
        this.toast('中继受到干扰', '先解除附近三台巡逻机；信标会保护其他敌人');
        return;
      }
      this.dialog([chapter.relay], () => this.progress(2));
    }
    if (item.id === 'module' && cs.stage === 2) {
      if (this.actors.some((e) => e.id.startsWith('module') && e.hp > 0)) {
        this.toast('维护舱被封锁', '解除附近巡逻机后，可安全取出模块');
        return;
      }
      this.progress(3);
      this.emit('module', { id: chapter.module });
    }
    if (item.id === 'gate')
      this.toast(
        '用身体与遗迹连接',
        `按 ${MODULES[chapter.module].key} 选择${chapter.moduleName}，再按 F 开启通路`,
      );
    if (item.id === 'reveal' && cs.stage === 5) {
      this.world.revealCivilization();
      this.cinematic = this.world.discoveryFocus;
      this.dialog(chapter.discovery, () => {
        this.cinematic = null;
        this.progress(6);
        if (chapter.id === 3) {
          this.mode = 'ending';
          this.emit('ending-choice');
        } else {
          this.toast(chapter.discoveryTitle, '章节完成 · +60 零件 · 已发现新坐标');
          this.emit('discovery', chapter);
        }
      });
    }
    if (item.id === 'ship' && cs.stage === 6) {
      if (chapter.id === 3 && !this.state.ending) {
        this.mode = 'ending';
        this.emit('ending-choice');
        return;
      }
      if (chapter.id === 0 && !this.state.companion) {
        this.dialog(
          [
            [
              '铆钉',
              cs.tool
                ? '扳手找到了，船也修好了。我想带着它去看看下一颗星星。能带上我吗？'
                : '船修好了。我还想修好自己的观测器。也许下一颗星星有合适的零件……能带上我吗？',
            ],
          ],
          () => this.emit('invite'),
        );
      } else this.toHub();
    }
    if (item.id === 'memory' && !cs.memory) {
      if (cs.stage < 3) {
        this.toast('记录被锁在维护层', '先取得本章身体模块，再回来读取');
        return;
      }
      cs.memory = true;
      this.state.salvage += 25;
      this.world.updateMarkers(cs);
      this.save();
      this.dialog([[chapter.memory[0], chapter.memory[1]]]);
    }
    if (item.id === 'secret' && !cs.secret && this.state.modules.includes('phase')) {
      cs.secret = true;
      this.state.salvage += 35;
      this.world.updateMarkers(cs);
      this.save();
      this.dialog([[chapter.secret[0], chapter.secret[1]]]);
    }
    if (item.id === 'tool' && !cs.tool) {
      cs.tool = true;
      this.state.salvage += 15;
      this.world.updateMarkers(cs);
      this.save();
      this.toast('找到了铆钉的旧扳手', '它会记住这件小事 · +15 零件');
    }
  }
  hubInteract(id) {
    if (id === 'messenger')
      this.dialog([
        ['小信使', '今天没有新的指令。你愿意给我讲讲，外面是什么样子吗？'],
        ['你', '我看见了一些，任务清单里没有的东西。'],
      ]);
    if (id === 'nav') this.emit('starmap');
    if (id === 'workbench') this.emit('workshop');
    if (id === 'garden')
      this.dialog(
        this.state.garden
          ? [
              ['铆钉', '幼苗长高了一点。我照着花园里的做法，把它转向了星光。'],
              ['你', '我们可以给它留一扇窗。'],
            ]
          : [['航行日志', '种植箱还是空的。我想，也许下一次旅行能带一点生命回来。']],
      );
    if (id === 'observatory')
      this.dialog([
        [
          '你',
          this.state.ending
            ? '原来旅程可以没有指令。我想回去看看，我们帮过的那些地方。'
            : '宇宙那么大。有些地方，只有亲自去过才会明白。',
        ],
        [
          '航行日志',
          `已探索 ${this.state.chapters.filter((c) => c.completed).length} 个文明，保存 ${this.state.chapters.filter((c) => c.memory).length + this.state.chapters.filter((c) => c.secret).length} 份记忆。`,
        ],
      ]);
    if (id === 'companion') {
      const lines = [
        [
          '铆钉',
          this.state.chapters[0].tool
            ? '你找回来的扳手，还是比新工具顺手。可能因为它记得我。'
            : '我用废零件做了一把扳手。还不太顺手，但它会慢慢习惯我的。',
        ],
      ];
      if (this.state.modules.includes('phase'))
        lines.push([
          '铆钉',
          '你能看见新的频段了。巨舰、花园、慢速之海……那些地方可能还有没说完的话。',
        ]);
      else if (this.state.garden)
        lines.push(['铆钉', '我给幼苗做了一个旋转底座。现在它每天都能看见星星。']);
      else lines.push(['铆钉', '我把观测器修好了一半。下一次出发，我想坐在窗边。']);
      lines.push([
        '铆钉',
        this.state.equipment.chassis === 'guardian'
          ? '这身装甲很适合你。记得把登船坡道放低一点。'
          : '新部件磨合得怎么样？工作台随时能用。',
      ]);
      this.dialog(lines);
    }
  }
  finish(ending) {
    if (completeChapter(this.state, 3, ending)) {
      this.save();
      this.mode = 'ending';
      this.emit('ending', { ending });
    }
  }
  resolvePosition(p = this.player.position) {
    const hub = this.state.location === 'hub';
    p.x = T.MathUtils.clamp(p.x, hub ? -16.5 : -36, hub ? 16.5 : 36);
    p.z = T.MathUtils.clamp(p.z, hub ? -24 : -162, hub ? 18 : 39);
    if (!hub && this.cs.stage < 4 && p.z < -63) p.z = -63;
    if (!hub && this.world.bridgeOpen && this.world.bridge?.position.y > 0.4 && p.z < -63)
      p.z = -63;
    if (!hub && p.z < -63 && p.z > -76) p.x = T.MathUtils.clamp(p.x, -7, 7);
    for (const o of this.world.obstacles) {
      const dx = p.x - o.x,
        dz = p.z - o.z,
        distance = Math.hypot(dx, dz),
        radius = o.r + 0.65;
      if (distance < radius && p.y < 2) {
        if (distance < 0.01) p.x += radius;
        else {
          p.x = o.x + (dx / distance) * radius;
          p.z = o.z + (dz / distance) * radius;
        }
      }
    }
  }
  enemyUpdate(e, dt) {
    if (e.hp <= 0 || (e.boss && this.cs.stage < 4)) return;
    const p = this.player.position,
      pos = e.mesh.position,
      distance = horizontalDistance(pos, p);
    e.exposed = Math.max(0, e.exposed - dt);
    e.stunned = Math.max(0, e.stunned - dt);
    e.mesh.rotation.y = turnToward(
      e.mesh.rotation.y,
      Math.atan2(-(p.x - pos.x), -(p.z - pos.z)),
      e.boss ? 3 : 6,
      dt,
    );
    if (e.mesh.userData.body && !e.boss && e.type === 'beacon')
      e.mesh.userData.body.rotation.y += dt;
    if (e.boss && e.mesh.userData.halo)
      e.mesh.userData.halo.rotation.z += dt * (e.exposed > 0 ? 2 : 0.2);
    if (e.stunned > 0) {
      this.encounters.cancel(e);
      e.warning.visible = false;
      e.windup = 0;
      return;
    }
    if (distance < (e.boss ? 37 : 25)) e.active = true;
    if (!e.active || distance > 58) {
      e.warning.visible = false;
      return;
    }
    if (e.windup > 0) {
      e.windup -= dt;
      e.warning.visible = !e.boss;
      e.warning.position.set(pos.x, 0.12, pos.z);
      e.warning.scale.setScalar(0.85 + Math.sin(this.time * 18) * 0.12);
      if (e.windup <= 0) {
        e.warning.visible = false;
        e.attacks++;
        e.firedAt = this.time;
        if (e.boss) {
          e.exposed = Math.max(e.exposed, 3);
          e.cooldown = e.hp < e.maxHp / 2 ? 2.3 : 3.1;
          return;
        }
        if (e.type === 'turret' || e.type === 'beacon' || (e.boss && e.attacks % 2 === 0)) {
          const count = e.boss ? (e.cannonBroken ? 3 : 7) : 1;
          for (let i = 0; i < count; i++) {
            const dir = p
              .clone()
              .add(v(0, 1.3, 0))
              .sub(pos.clone().add(v(0, e.boss ? 3 : 1.6, 0)))
              .normalize();
            dir.applyAxisAngle(v(0, 1, 0), (i - (count - 1) / 2) * 0.14);
            const mesh = this.world.mesh(
              'SphereGeometry',
              [e.boss ? 0.3 : 0.2, 8, 6],
              '#ff9167',
              [pos.x, e.boss ? 3 : 1.6, pos.z],
              this.world.root,
              2,
            );
            this.projectiles.push({
              mesh,
              direction: dir,
              speed: e.boss ? 19 : 16,
              ttl: 5,
              damage: e.boss ? 16 : 12,
            });
          }
        } else {
          this.world.wave(pos, '#ff9d79', e.boss ? (e.armBroken ? 6 : 10) : 3);
          if (distance < (e.boss ? (e.armBroken ? 7 : 11) : 3.7) && p.y < (e.boss ? 2 : 1.6))
            this.hurt(e.boss ? 27 : 16);
        }
        e.cooldown = e.boss ? (e.hp < e.maxHp / 2 ? 1.15 : 1.7) : e.type === 'turret' ? 1.7 : 1.3;
      }
      return;
    }
    e.cooldown -= dt;
    if ((e.type === 'cutter' && distance > 2.5) || (e.boss && distance > 8)) {
      const direction = p.clone().sub(pos);
      direction.y = 0;
      direction.normalize();
      pos.addScaledVector(direction, dt * (e.boss ? 3.7 : 4.7));
      if (this.cs.stage < 4) pos.z = Math.max(-62, pos.z);
    }
    if (e.cooldown <= 0 && distance < (e.boss ? 32 : e.type === 'cutter' ? 4 : 35)) {
      if (e.boss) {
        this.encounters.prepare(e, this.chapter.id);
        this.sound.play('warning');
      } else e.windup = e.type === 'cutter' ? 0.7 : 0.85;
    }
  }
  update(dt) {
    dt = Math.min(dt, 0.05);
    this.time += dt;
    const visualDt = dt;
    this.hitStop = Math.max(0, this.hitStop - dt);
    if (this.playing && this.arrival) {
      this.arrival.remaining -= dt;
      if (this.arrival.remaining <= 0) this.arrival = null;
    }
    if (this.playing && !this.arrival) {
      this.exploration.update(dt);
      const boss = this.actors.find((e) => e.boss && e.hp > 0);
      if (
        boss &&
        this.cs.stage === 4 &&
        !this.bossAnnounced &&
        horizontalDistance(boss.mesh.position, this.player.position) < 27
      ) {
        this.bossAnnounced = true;
        this.beginArrival(true);
      }
      this.state.playTime += dt;
      this.invincible = Math.max(0, this.invincible - dt);
      this.attackTime = Math.max(0, this.attackTime - dt);
      this.comboTimer -= dt;
      this.timeSlow = Math.max(0, this.timeSlow - dt);
      for (const key in this.cooldowns) this.cooldowns[key] = Math.max(0, this.cooldowns[key] - dt);
      this.energy = Math.min(100, this.energy + dt * 24);
      if (this.dashBuffer > 0) {
        this.dashBuffer = Math.max(0, this.dashBuffer - dt);
        if (this.cooldowns.dash === 0 && this.energy >= this.dashCost()) this.dash();
      }
      if (
        this.lockedTarget &&
        (this.lockedTarget.hp <= 0 ||
          horizontalDistance(this.lockedTarget.mesh.position, this.player.position) > 55)
      )
        this.lockedTarget = null;
      if (this.lockedTarget && !this.rightDrag) {
        const delta = this.lockedTarget.mesh.position.clone().sub(this.player.position);
        this.yaw = turnToward(this.yaw, Math.atan2(-delta.x, -delta.z), 4, dt);
      }
      if (this.keys.has('KeyQ')) this.yaw += dt * 1.6;
      if (this.keys.has('KeyR')) this.yaw -= dt * 1.6;
      const direction = this.movementDirection();
      // Small collision steps prevent a fast diagonal boost from skipping cover.
      let remaining = dt;
      while (remaining > 1e-6) {
        const step = Math.min(remaining, 1 / 120, this.dashTime > 0 ? this.dashTime : remaining),
          dashing = this.dashTime > 0;
        if (dashing && direction.lengthSq() > 0) {
          const yaw = turnToward(
            Math.atan2(this.dashVector.x, this.dashVector.z),
            Math.atan2(direction.x, direction.z),
            38,
            step,
          );
          this.dashVector.set(Math.sin(yaw), 0, Math.cos(yaw));
        }
        this.player.position.add(
          moveVelocity(
            this.velocity,
            dashing ? this.dashVector : direction,
            dashing ? 43 : 10.8 * this.stats.chassis.speed,
            step,
            dashing,
          ),
        );
        this.resolvePosition();
        this.dashTime = Math.max(0, this.dashTime - step);
        remaining -= step;
      }
      if (
        this.dashTime > 0 &&
        !this.settings.reducedMotion &&
        this.time - (this.lastTrail || 0) > 0.035
      ) {
        this.world.trail(this.player.position);
        this.lastTrail = this.time;
      }
      const tracking =
        this.lockedTarget ||
        this.keys.has('KeyK') ||
        this.keys.has('Mouse0') ||
        (this.aim.mouse && this.aim.solution?.target);
      const aiming = tracking || this.player.userData.aimUntil > this.time;
      if (aiming) {
        const aim = this.aim.resolve().intended;
        this.player.userData.aimAt = aim;
        if (tracking) this.player.userData.aimUntil = this.time + 0.1;
        this.face(aim);
      } else if (direction.lengthSq() > 0)
        this.player.rotation.y = turnToward(
          this.player.rotation.y,
          Math.atan2(-direction.x, -direction.z),
          34,
          dt,
        );
      this.velocityY -= 25 * dt;
      this.player.position.y += this.velocityY * dt;
      if (this.player.position.y <= 0) {
        if (this.jumps > 0) {
          this.player.userData.landUntil = this.time + 0.3;
          this.sound.play('land');
        }
        this.player.position.y = 0;
        this.velocityY = 0;
        this.jumps = 0;
      }
      if (this.jumpBuffer > 0) {
        if (this.jumps < 2) this.jump();
        else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
      }
      this.resolvePosition();
      if (this.keys.has('KeyK') || this.keys.has('Mouse0')) this.shoot();
      if (this.keys.has('KeyJ')) this.melee();
      if (this.meleeBuffered > 0) {
        this.meleeBuffered -= dt;
        if (this.cooldowns.melee === 0) {
          this.meleeBuffered = 0;
          this.melee();
        }
      }
      this.player.userData.dashing = this.dashTime > 0;
      this.player.userData.lookAt =
        this.lockedTarget?.mesh.position.clone().add(v(0, 3, 0)) ||
        (this.nearby ? new T.Vector3(this.nearby.x, 2.4, this.nearby.z) : null);
      const steps = this.player.userData.rig.stepEvents;
      this.world.animateRobot(
        this.player,
        this.time,
        direction.length(),
        this.attackTime,
        this.jumps > 0,
      );
      if (this.player.userData.rig.stepEvents > steps) this.sound.play('footstep');
      if (this.world.npc)
        this.world.npc.userData.lookAt = this.player.position.clone().add(v(0, 2.6, 0));
      const enemyDt = dt * (this.timeSlow > 0 ? 0.25 : 1) * (this.hitStop > 0 ? 0.15 : 1);
      for (const e of this.actors) {
        this.enemyUpdate(e, enemyDt);
        if (e.hp > 0) animateEnemy(e, this.time);
      }
      this.encounters.update(enemyDt);
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const b = this.projectiles[i];
        b.mesh.position.addScaledVector(b.direction, b.speed * enemyDt);
        b.ttl -= enemyDt;
        if (b.mesh.position.distanceTo(this.player.position.clone().add(v(0, 1.3, 0))) < 1.15) {
          this.hurt(b.damage);
          b.ttl = 0;
        }
        if (b.ttl <= 0) {
          this.world.root.remove(b.mesh);
          this.projectiles.splice(i, 1);
        }
      }
      this.updateNearby();
      if (this.time - this.lastSave > 25) {
        this.save();
        this.lastSave = this.time;
      }
    }
    if (this.mode === 'menu') {
      this.yaw = -0.38 + Math.sin(this.time * 0.08) * 0.12;
      this.cameraPosition.copy(this.player.position).add(v(-8, 5.8, 12));
      this.cameraTarget.copy(this.player.position).add(v(-2.8, 3, -14));
      this.player.rotation.y = 2.55;
      this.world.animateRobot(this.player, this.time);
    } else {
      const focus = this.player.position
        .clone()
        .add(v(-Math.sin(this.yaw) * 6, 2, -Math.cos(this.yaw) * 6));
      if (this.cinematic) focus.copy(this.cinematic);
      const desired = this.player.position
        .clone()
        .add(
          v(
            Math.sin(this.yaw) * this.distance * Math.cos(this.pitch),
            Math.sin(this.pitch) * this.distance + 3,
            Math.cos(this.yaw) * this.distance * Math.cos(this.pitch),
          ),
        );
      const origin = this.player.position.clone().add(v(0, 2, 0)),
        rayDirection = desired.clone().sub(origin),
        rayLength = rayDirection.length();
      this.cameraRay.set(origin, rayDirection.normalize());
      this.cameraRay.far = rayLength;
      const collision = this.cameraRay.intersectObjects(this.world.cameraObstacles || [], false)[0];
      if (collision)
        desired.copy(origin).addScaledVector(rayDirection, Math.max(2, collision.distance - 0.7));
      this.cameraPosition.lerp(desired, 1 - Math.exp(-dt * 24));
      this.cameraTarget.lerp(focus, 1 - Math.exp(-dt * 28));
    }
    if (this.arrival) {
      const a = this.arrival,
        t = 1 - a.remaining / a.total;
      const center = a.boss ? this.actors.find((e) => e.boss)?.mesh.position : this.player.position;
      if (center) {
        const desired = center
          .clone()
          .add(
            v(
              Math.sin(0.7 - t * 0.9) * (a.boss ? 16 : 27),
              a.boss ? 7 : 14 - t * 6,
              Math.cos(0.7 - t * 0.9) * (a.boss ? 16 : 27),
            ),
          );
        this.cameraPosition.lerp(desired, 1 - Math.exp(-dt * 3));
        this.cameraTarget.lerp(
          center.clone().add(v(0, a.boss ? 4 : 3, a.boss ? 0 : -12)),
          1 - Math.exp(-dt * 3),
        );
      }
    }
    this.world.camera.position.copy(this.cameraPosition);
    if (this.shake > 0) {
      this.shake -= dt;
      this.world.camera.position.x += (Math.random() - 0.5) * this.shake;
    }
    this.world.camera.lookAt(this.cameraTarget);
    const targetFov = this.settings.reducedMotion ? 53 : this.dashTime > 0 ? 59 : 53;
    this.world.camera.fov = damp(this.world.camera.fov, targetFov, 8, visualDt);
    this.world.camera.updateProjectionMatrix();
    if (this.playing && !this.arrival) this.aim.update(visualDt);
    this.sound.update(visualDt, this.playing && !this.arrival);
    this.sound.setActivity?.(
      this.playing,
      this.actors.some((e) => e.hp > 0 && e.active),
    );
    if (this.playing || this.mode === 'menu' || this.mode === 'dialog')
      this.world.update(dt, this.time);
    this.abilityEffects.update(this.playing && !this.arrival ? dt : 0);
    this.world.render();
    this.emit('frame');
  }
}
