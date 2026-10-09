import * as T from 'three';
import { EQUIPMENT, CHAPTERS } from './data.js';
import { makeRobot, applyRobotSkin } from './robot-rig.js';
import { animateMechanicalRobot } from './robot-motion.js';
import './robot-inspection.css';

export class RobotInspection {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.yaw = -0.35;
    this.pitch = 0.13;
    this.distance = 4.9;
    this.pose = 'idle';
    const el = document.createElement('section');
    el.id = 'robot-inspection';
    el.className = 'hidden';
    el.setAttribute('aria-label', '身体检视');
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.innerHTML = `<header><span>WITNESS LAB <b>/ 身体检视</b></span><button id="inspection-close">返回旅程 <kbd>Esc</kbd></button></header><aside class="inspection-title"><small>EXPLORATION UNIT</small><h2>见证者<span>07</span></h2><p>每一处连接，<br>都让这副身体更接近世界。</p><section class="skin-picker" aria-label="机体涂装"><div class="skin-heading"><span>机体涂装</span><small>COLOR LAB</small></div><div id="skin-swatches"></div><p id="skin-selection" aria-live="polite"></p><small class="skin-note">点击即应用 · 自动保存<br>文明涂装可在飞船工作台制作</small></section></aside><aside class="inspection-info"><small>SYSTEMS ONLINE</small><button data-detail="head">01 <span>感知头部</span> ↗</button><button data-detail="body">02 <span>胸部与能源背包</span> ↗</button><button data-detail="legs">03 <span>步行执行机构</span> ↗</button><p id="inspection-detail">喷涂护板、承力骨架与活动关节独立装配。拖动视角可以观察背面的线束与散热结构。</p><button id="inspection-reset">全身视角 ↺</button></aside><footer><div class="inspection-poses"><button data-pose="idle" class="selected">待机</button><button data-pose="walk">步行</button><button data-pose="aim">瞄准</button><button data-pose="cut">切割</button></div><span>拖动旋转 · 滚轮缩放 · <kbd>I</kbd> 检视身体</span></footer>`;
    document.getElementById('ui').appendChild(el);
    this.element = el;
    document
      .querySelector('.hero-copy')
      .insertAdjacentHTML(
        'beforeend',
        '<button class="understated" data-inspect>机器人配色 / 检视 <span>↗</span></button>',
      );
    document
      .querySelector('.hud-actions')
      .insertAdjacentHTML(
        'afterbegin',
        '<button data-inspect aria-label="检视机器人">◎ <span>身体</span><kbd>I</kbd></button>',
      );
    document.addEventListener('click', (event) => {
      if (event.target.closest('[data-inspect]')) this.open();
    });
    el.querySelector('#inspection-close').onclick = () => this.close();
    el.querySelector('#inspection-reset').onclick = () => {
      this.distance = 4.9;
      this.focusY = 1.48;
    };
    game.on('skin-changed', (skin) => {
      if (this.active) {
        applyRobotSkin(game.world, this.robot, skin);
        this.refreshSkins();
      }
    });
    el.addEventListener('click', (event) => {
      const skin = event.target.closest('[data-skin]')?.dataset.skin;
      if (skin) {
        game.changeSkin(skin);
        return;
      }
      const pose = event.target.closest('[data-pose]')?.dataset.pose;
      if (pose) {
        this.pose = pose;
        el.querySelectorAll('[data-pose]').forEach((b) =>
          b.classList.toggle('selected', b.dataset.pose === pose),
        );
      }
      const detail = event.target.closest('[data-detail]')?.dataset.detail;
      if (detail) {
        this.distance = detail === 'head' ? 1.8 : detail === 'body' ? 2.5 : 2.7;
        this.focusY = detail === 'head' ? 2.64 : detail === 'body' ? 2.1 : 0.85;
        el.querySelector('#inspection-detail').textContent = {
          head: '紧凑头部由独立俯仰和偏航关节承托。不同孔径的镜头承担环境观察，状态灯只表达设备状态。',
          body: '装甲浮置在金属骨架外侧，腰部保留活动空间。背包包含电源筒、散热片、线束与矢量推进器。',
          legs: '大腿、小腿与脚踝形成运动链。膝部连杆随弯曲伸缩，脚踝抵消上游旋转，使支撑脚平贴地面。',
        }[detail];
      }
    });
    window.addEventListener(
      'keydown',
      (event) => {
        if (!this.active && event.code === 'KeyI' && ['playing', 'menu'].includes(game.mode)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.open();
        } else if (this.active) {
          if (event.code === 'Escape' || event.code === 'KeyI') {
            event.preventDefault();
            event.stopImmediatePropagation();
            this.close();
          } else if (event.code === 'Tab') {
            const buttons = [...el.querySelectorAll('button:not(:disabled)')];
            const index = buttons.indexOf(document.activeElement);
            if (event.shiftKey && index <= 0) {
              event.preventDefault();
              buttons.at(-1).focus();
            } else if (!event.shiftKey && index === buttons.length - 1) {
              event.preventDefault();
              buttons[0].focus();
            }
          }
        }
      },
      true,
    );
    const canvas = game.world.renderer.domElement;
    canvas.addEventListener('webglcontextlost', () => {
      if (this.active) this.close();
    });
    canvas.addEventListener('pointerdown', (event) => {
      if (this.active) {
        this.drag = { x: event.clientX, y: event.clientY };
        canvas.setPointerCapture(event.pointerId);
      }
    });
    canvas.addEventListener('pointermove', (event) => {
      if (this.active && this.drag) {
        this.yaw -= (event.clientX - this.drag.x) * 0.008;
        this.pitch = T.MathUtils.clamp(
          this.pitch + (event.clientY - this.drag.y) * 0.006,
          -0.4,
          0.7,
        );
        this.drag = { x: event.clientX, y: event.clientY };
      }
    });
    const release = () => {
      this.drag = null;
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    window.addEventListener('blur', release);
    canvas.addEventListener(
      'wheel',
      (event) => {
        if (this.active) {
          event.preventDefault();
          this.distance = T.MathUtils.clamp(this.distance + event.deltaY * 0.003, 1.4, 7);
        }
      },
      { passive: false },
    );
  }
  open() {
    if (this.active) return;
    const g = this.game,
      w = g.world;
    this.previousMode = g.mode;
    this.previousFocus = document.activeElement;
    g.keys.clear();
    g.rightDrag = null;
    g.velocity.set(0, 0, 0);
    g.mode = 'inspect';
    this.active = true;
    this.time = 0;
    this.previousFrame = performance.now();
    this.focusY = 1.48;
    this.distance = 4.9;
    this.pose = 'idle';
    this.yaw = -0.35;
    this.pitch = 0.13;
    this.scene = new T.Scene();
    this.scene.background = new T.Color('#080e15');
    this.scene.environment = w.scene.environment;
    this.scene.environmentIntensity = 0.75;
    this.camera = new T.PerspectiveCamera(38, innerWidth / innerHeight, 0.05, 80);
    this.robot = makeRobot(w, g.stats.skin, 1);
    this.scene.add(this.robot);
    const ambient = new T.HemisphereLight('#d5e9ef', '#17202a', 1);
    this.scene.add(ambient);
    for (const [color, intensity, pos] of [
      ['#e4eef5', 45, [-3, 5, -4]],
      ['#8ebbbd', 30, [3, 3, 2]],
      ['#d7ad80', 12, [-3, 2, 3]],
    ]) {
      const light = new T.SpotLight(color, intensity, 18, 0.6, 0.65, 1);
      light.position.set(...pos);
      light.target.position.set(0, 1.4, 0);
      light.castShadow = true;
      light.shadow.mapSize.set(1024, 1024);
      light.shadow.bias = -0.0002;
      this.scene.add(light, light.target);
    }
    const stage = w.mesh(
      'CylinderGeometry',
      [1.25, 1.3, 0.1, 64],
      '#17242d',
      [0, -0.08, 0],
      this.scene,
    );
    stage.material = w.mat('#17242d');
    stage.receiveShadow = true;
    const grid = new T.GridHelper(12, 48, '#30424c', '#16212a');
    grid.position.y = -0.14;
    this.scene.add(grid);
    this.grid = grid;
    const ring = w.ring(1.27, 0.012, '#8aaea4', [0, -0.02, 0], this.scene, 0.3);
    ring.rotation.x = Math.PI / 2;
    w.viewer = this;
    this.element.classList.remove('hidden');
    document.body.classList.add('inspecting');
    for (const id of ['hud', 'menu', 'modal-root']) document.getElementById(id).inert = true;
    this.element
      .querySelectorAll('[data-pose]')
      .forEach((b) => b.classList.toggle('selected', b.dataset.pose === 'idle'));
    this.refreshSkins();
    this.element.querySelector('#inspection-close').focus();
  }
  refreshSkins() {
    const state = this.game.state,
      focused = document.activeElement?.dataset.skin;
    this.element.querySelector('#skin-swatches').innerHTML = EQUIPMENT.skin
      .map((skin) => {
        const owned = state.owned.includes(skin.id),
          locked =
            (skin.chapter !== undefined && !state.chapters[skin.chapter].completed) ||
            (!owned && skin.cost > 0),
          selected = state.equipment.skin === skin.id;
        const note = selected
          ? '已应用'
          : locked
            ? skin.chapter !== undefined && !state.chapters[skin.chapter].completed
              ? '完成' + CHAPTERS[skin.chapter].name
              : skin.cost + ' 零件制作'
            : '可用';
        return `<button type="button" class="skin-swatch ${selected ? 'selected' : ''}" data-skin="${skin.id}" aria-label="${skin.name} · ${note}" aria-pressed="${selected}" title="${skin.desc} · ${note}" style="--paint:${skin.color};--trim:${skin.accent}" ${locked ? 'disabled' : ''}><i></i><span>${skin.name}</span><small>${selected ? '✓ 已应用' : locked ? (skin.chapter !== undefined && !state.chapters[skin.chapter].completed ? '待解锁' : '未制作') : '可用'}</small></button>`;
      })
      .join('');
    this.element.querySelector('#skin-selection').textContent = this.game.stats.skin.desc;
    if (focused)
      this.element.querySelector(`[data-skin="${focused}"]`)?.focus({ preventScroll: true });
  }
  close() {
    if (!this.active) return;
    this.active = false;
    this.drag = null;
    this.game.world.viewer = null;
    this.game.mode = this.previousMode;
    this.game.keys.clear();
    this.element.classList.add('hidden');
    document.body.classList.remove('inspecting');
    this.scene.traverse((o) => {
      if (o.isLight) o.dispose?.();
    });
    this.grid.geometry.dispose();
    this.grid.material.dispose();
    this.scene.clear();
    this.scene = null;
    this.robot = null;
    for (const id of ['hud', 'menu', 'modal-root']) document.getElementById(id).inert = false;
    this.previousFocus?.focus?.({ preventScroll: true });
  }
  render() {
    const now = performance.now(),
      dt = Math.min(0.05, (now - this.previousFrame) / 1000);
    this.previousFrame = now;
    this.time += dt;
    this.robot.userData.previewSpeed = this.pose === 'walk' ? 2.4 : 0;
    this.robot.userData.fire = this.pose === 'aim' ? this.time + 0.2 : 0;
    this.robot.userData.shotAt = -10;
    this.robot.userData.slash =
      this.pose === 'cut' && this.time % 1.6 < 0.35 ? this.time + 0.32 - (this.time % 1.6) : 0;
    animateMechanicalRobot(this.robot, this.time, 0, 0, false);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(
      Math.sin(this.yaw) * this.distance,
      this.focusY + Math.sin(this.pitch) * this.distance,
      -Math.cos(this.yaw) * this.distance,
    );
    this.camera.lookAt(0, this.focusY, 0);
    this.game.world.renderer.render(this.scene, this.camera);
  }
}
