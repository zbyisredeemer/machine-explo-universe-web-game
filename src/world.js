import * as T from 'three';
import { CHAPTERS } from './data.js';
import { ChapterAtmosphere } from './chapter-atmosphere.js';
import { buildEnvironment } from './environments.js';
import { createRobot, animateRobot, createEnemy } from './models.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  VisualPipeline,
  deckTexture,
  planetTexture,
  atmosphereMaterial,
  skyMaterial,
  Dust,
} from './visuals.js';

export const POINTS = {
  spawn: [0, 29],
  npc: [-9, 10],
  relay: [-19, -19],
  module: [18, -48],
  gate: [0, -62],
  boss: [0, -103],
  reveal: [0, -141],
  memory: [-29, -51],
  tool: [24, 6],
  secret: [28, -128],
};
const rand = (seed) => {
  let s = seed;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) | 0;
    return (s >>> 0) / 4294967296;
  };
};

export class World {
  constructor(canvas, settings) {
    this.settings = settings;
    this.textures = new Map();
    this.ownedMaterials = [];
    this.renderer = new T.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, settings.quality === 'low' ? 1 : 1.75));
    this.renderer.shadowMap.enabled = settings.quality !== 'low';
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(53, innerWidth / innerHeight, 0.1, 1400);
    const room = new RoomEnvironment();
    const pmrem = new T.PMREMGenerator(this.renderer);
    this.environmentMap = pmrem.fromScene(room, 0.04);
    this.scene.environment = this.environmentMap.texture;
    this.scene.environmentIntensity = 0.35;
    room.dispose();
    pmrem.dispose();
    this.root = new T.Group();
    this.scene.add(this.root);
    this.materials = new Map();
    this.geometries = new Map();
    this.fx = [];
    this.animated = [];
    this.markers = [];
    this.obstacles = [];
    this.pipeline = new VisualPipeline(this.renderer, this.scene, this.camera, settings);
    this.resize();
  }
  resize() {
    this.renderer.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.pipeline?.resize();
  }
  quality() {
    this.pipeline.configure();
    this.resize();
  }
  mat(color, glow = 0, opacity = 1) {
    const key = `${color}/${glow}/${opacity}`;
    if (!this.materials.has(key))
      this.materials.set(
        key,
        new T.MeshStandardMaterial({
          color,
          roughness: 0.67,
          metalness: 0.35,
          emissive: color,
          emissiveIntensity: glow,
          transparent: opacity < 1,
          opacity,
          depthWrite: opacity === 1,
          side: opacity < 1 ? T.DoubleSide : T.FrontSide,
        }),
      );
    return this.materials.get(key);
  }
  geo(type, args) {
    const key = `${type}/${args}`;
    if (!this.geometries.has(key))
      this.geometries.set(
        key,
        type === 'RoundedBoxGeometry' ? new RoundedBoxGeometry(...args) : new T[type](...args),
      );
    return this.geometries.get(key);
  }
  mesh(type, args, color, position = [0, 0, 0], parent = this.root, glow = 0, opacity = 1) {
    const m = new T.Mesh(this.geo(type, args), this.mat(color, glow, opacity));
    m.position.set(...position);
    m.castShadow = opacity === 1;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  box(size, pos, color, parent, glow = 0, opacity = 1) {
    return this.mesh(
      this.buildingRobot ? 'RoundedBoxGeometry' : 'BoxGeometry',
      this.buildingRobot ? [...size, 2, Math.min(...size) * 0.18] : size,
      color,
      pos,
      parent,
      glow,
      opacity,
    );
  }
  ring(radius, tube, color, pos, parent = this.root, glow = 0) {
    return this.mesh('TorusGeometry', [radius, tube, 8, 64], color, pos, parent, glow);
  }
  reset() {
    this.dust?.dispose();
    this.atmosphere = null;
    this.root.traverse((o) => {
      if (o.isLight || o.isInstancedMesh) o.dispose?.();
    });
    for (const f of this.fx) if (f.ownMaterial) f.mesh.material.dispose();
    this.root.clear();
    this.fx = [];
    this.animated = [];
    this.markers = [];
    this.obstacles = [];
    this.cameraObstacles = [];
    this.shotObstacles = [];
    this.gate = null;
    this.bridge = null;
    this.revealObjects = [];
    this.revealShutters = [];
    this.revealActive = false;
    // Shared materials/geometries are reused across chapters and released on page teardown.
  }
  load(index, state) {
    this.reset();
    this.index = index;
    this.state = state;
    const c = CHAPTERS[index === 'hub' ? Math.min(state.unlocked, 3) : index];
    this.color = c.color;
    this.scene.background = new T.Color(c.sky);
    this.scene.fog = new T.FogExp2(c.sky, 0.0016);
    const ambient = new T.HemisphereLight(c.theme.fill, c.theme.deep, 0.9);
    this.root.add(ambient);
    const sun = new T.DirectionalLight(c.theme.sun, 2.5);
    sun.position.set(-30, 60, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -38,
      right: 38,
      top: 42,
      bottom: -42,
      near: 1,
      far: 210,
    });
    sun.target.position.set(0, 0, -45);
    sun.shadow.bias = -0.00015;
    sun.shadow.normalBias = 0.025;
    this.sun = sun;
    this.root.add(sun, sun.target);
    this.sky(c, c.id);
    if (index === 'hub') this.buildHub(state, c);
    else this.buildChapter(index, c, state.chapters[index]);
    if (index !== 'hub') this.atmosphere = new ChapterAtmosphere(this, index);
    this.dust = new Dust(this.root, c.color);
    const rim = new T.DirectionalLight(c.theme.fill, 1.6);
    rim.position.set(30, 20, -120);
    this.root.add(rim);
  }
  sky(c, index) {
    const skyKey = 'sky-palette-' + index;
    if (!this.materials.has(skyKey)) this.materials.set(skyKey, skyMaterial(c.theme));
    const dome = new T.Mesh(this.geo('SphereGeometry', [850, 32, 16]), this.materials.get(skyKey));
    dome.renderOrder = -100;
    dome.frustumCulled = false;
    dome.userData.skyBackdrop = true;
    this.root.add(dome);
    const random = rand(53 + index);
    const positions = [];
    for (let i = 0; i < 1000; i++) {
      const v = new T.Vector3(random() - 0.5, random() * 0.75, random() - 0.65)
        .normalize()
        .multiplyScalar(400 + random() * 200);
      positions.push(v.x, v.y, v.z);
    }
    if (!this.starGeo) {
      this.starGeo = new T.BufferGeometry();
      this.starMat = new T.PointsMaterial({
        color: '#dbeced',
        size: 0.7,
        transparent: true,
        opacity: 0.8,
        sizeAttenuation: true,
      });
    }
    if (!this.starGeo.getAttribute('position'))
      this.starGeo.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    else {
      this.starGeo.getAttribute('position').array.set(positions);
      this.starGeo.getAttribute('position').needsUpdate = true;
    }
    this.root.add(new T.Points(this.starGeo, this.starMat));
    const planet = this.mesh(
      'SphereGeometry',
      [62, 48, 32],
      ['#77908d', '#88a388', '#9eafc6', '#b5a18b'][index],
      [100, 77, -225],
    );
    const key = 'planet-' + index;
    if (!this.textures.has(key)) this.textures.set(key, planetTexture(index));
    if (!this.materials.has(key))
      this.materials.set(
        key,
        new T.MeshStandardMaterial({ map: this.textures.get(key), roughness: 0.95, metalness: 0 }),
      );
    planet.material = this.materials.get(key);
    const ring = this.ring(94, 3.5, c.theme.accent, [100, 77, -225]);
    ring.rotation.set(1.22, 0.22, -0.35);
    const ring2 = this.ring(102, 0.5, c.color, [100, 77, -225]);
    ring2.rotation.copy(ring.rotation);
    const atmosphere = this.mesh(
      'SphereGeometry',
      [63.4, 40, 24],
      c.color,
      [100, 77, -225],
      this.root,
      0.35,
      0.13,
    );
    if (!this.materials.has('atmosphere-' + index))
      this.materials.set('atmosphere-' + index, atmosphereMaterial(c.color));
    atmosphere.material = this.materials.get('atmosphere-' + index);
    planet.castShadow = false;
    atmosphere.castShadow = false;
    for (let i = 0; i < 35; i++) {
      const a = this.mesh('IcosahedronGeometry', [2 + random() * 5, 0], c.ground, [
        (random() - 0.5) * 360,
        18 + random() * 70,
        -30 - random() * 270,
      ]);
      a.rotation.set(random() * 3, random() * 3, random() * 3);
      this.animated.push({ mesh: a, type: 'rock', offset: random() * 6 });
    }
  }
  buildChapter(index, c, cs) {
    buildEnvironment(this, index, c);
    this.ship(15, 31);
    this.obstacles.push({ x: 15, z: 36, r: 4 });
    this.npc = this.robot('#cf9e66', 0.86);
    this.npc.position.set(-9, 0, 10);
    this.root.add(this.npc);
    this.npc.rotation.y = 0.7;
    this.box([5, 1.1, 2.7], [-13, 0.55, 8], '#2a3b3f');
    this.box([3, 0.15, 1.5], [-13, 1.17, 8], c.rust);
    this.marker('npc', '信号 / ' + c.npc, ...POINTS.npc, c.color);
    this.terminal(...POINTS.relay, c.color);
    this.marker('relay', '中继站', ...POINTS.relay, c.color);
    this.terminal(...POINTS.module, '#ebba83');
    this.marker('module', c.moduleName, ...POINTS.module, '#ebba83');
    const module = this.mesh('OctahedronGeometry', [0.7, 0], c.color, [18, 3, -48], this.root, 1.4);
    this.animated.push({ mesh: module, type: 'float', offset: 0 });
    this.moduleObject = module;
    module.visible = cs.stage < 3;
    this.marker(
      'gate',
      index === 0 ? '重力桥锚点' : index === 1 ? '枯萎根网' : index === 2 ? '同步环' : '相位裂隙',
      ...POINTS.gate,
      c.color,
    );
    this.gate = new T.Group();
    this.gate.position.set(0, 0, -69);
    this.root.add(this.gate);
    for (const side of [-1, 1]) this.box([4, 13, 3], [side * 10, 6.5, 0], '#344c55', this.gate);
    this.box([24, 2, 3], [0, 13, 0], '#344c55', this.gate);
    for (const side of [-1, 1])
      this.box([0.15, 10, 0.15], [side * 8.1, 6, 1.6], c.color, this.gate, 1.4);
    this.gateField = this.box([17, 11, 0.15], [0, 5.5, 0], c.color, this.gate, 0.6, 0.23);
    for (let x = -8; x <= 8; x += 2)
      this.box([0.06, 11, 0.12], [x, 5.5, 0], c.color, this.gate, 1.2);
    this.gate.visible = cs.stage < 4;
    this.bridge = new T.Group();
    this.bridge.position.set(0, cs.stage >= 4 ? 0 : 8, -69.5);
    this.root.add(this.bridge);
    this.bridgeOpen = cs.stage >= 4;
    for (let i = 0; i < 7; i++) {
      const slab = this.box(
        [16, 0.55, 1.8],
        [0, -0.3, -6 + i * 2],
        index === 1 ? '#81966e' : c.rust,
        this.bridge,
      );
      if (index === 2) slab.rotation.y = cs.stage >= 4 ? 0 : i % 2 ? 0.32 : -0.32;
      this.box([14, 0.06, 0.09], [0, 0.01, -6 + i * 2], c.color, this.bridge, 0.8);
    }
    for (const side of [-1, 1])
      this.box([0.15, 0.2, 15], [side * 7.7, 0.2, 0], c.color, this.bridge, 1);
    this.ring(21, 0.24, c.color, [0, 0.12, -103]).rotation.x = Math.PI / 2;
    this.ring(23, 0.65, c.rust, [0, -0.2, -103]).rotation.x = Math.PI / 2;
    this.terminal(...POINTS.reveal, c.color);
    this.marker('reveal', '观察系统', ...POINTS.reveal, c.color);
    this.marker('ship', '归航信标', ...POINTS.spawn, '#eac08c');
    this.memoryObject = this.collectible(...POINTS.memory, c.color);
    this.memoryObject.visible = !cs.memory;
    this.marker('memory', '记忆碎片', ...POINTS.memory, c.color);
    this.secretObject = this.collectible(...POINTS.secret, '#ffd397');
    this.secretObject.visible = stateHasPhase(this.state) && !cs.secret;
    this.marker('secret', '隐藏信号', ...POINTS.secret, '#ffd397');
    if (index === 0) {
      this.toolObject = this.box([0.5, 0.15, 1.6], [24, 0.3, 6], '#e99054');
      this.toolObject.visible = !cs.tool;
      this.marker('tool', '遗失的工具', ...POINTS.tool, '#e99054');
    }
    this.discoveryScene(index, c, cs);
    this.updateMarkers(cs);
  }
  discoveryScene(index, c, cs) {
    this.discoveryFocus = new T.Vector3(0, 16, -182);
    if (index === 0) {
      this.box([90, 41, 3], [0, 19, -188], '#233a42');
      this.box([94, 2, 7], [0, -1, -184], c.rust);
      this.box([94, 2, 7], [0, 40, -184], c.rust);
      for (let row = 0; row < 5; row++)
        for (let col = -6; col <= 6; col++) {
          const g = new T.Group();
          g.position.set(col * 6.5, 3.5 + row * 7.3, -183);
          this.root.add(g);
          this.mesh('CapsuleGeometry', [1.25, 3.4, 4, 10], c.color, [0, 0, 0], g, 0.8, 0.38);
          const life = this.mesh('IcosahedronGeometry', [0.9, 1], '#ffe1a8', [0, -0.2, 0], g, 0.8);
          life.scale.y = 1.55;
          this.box([3.4, 0.4, 3.4], [0, -3.1, 0], '#607c7b', g);
          this.box([3.4, 0.3, 3.4], [0, 3.1, 0], '#607c7b', g);
          for (const side of [-1, 1])
            this.box([0.12, 5.8, 0.12], [side * 1.5, 0, 1.35], c.color, g, 0.5);
          g.visible = cs.stage >= 6;
          this.revealObjects.push(g);
        }
      for (const side of [-1, 1]) {
        const panel = new T.Group();
        panel.position.set(side * 22.5, 19.5, -179);
        this.root.add(panel);
        this.box([45, 39, 1.5], [0, 0, 0], c.theme.deep, panel);
        for (let col = 0; col < 5; col++)
          for (let row = 0; row < 4; row++) {
            const x = -18 + col * 9,
              y = -14.5 + row * 9.7;
            this.box(
              [8.65, 9.3, 0.16],
              [x, y, 0.86],
              row % 2 ? c.theme.metal : c.theme.deck,
              panel,
            );
            this.box([0.14, 8.4, 0.1], [x - 3.8, y, 1], c.rust, panel);
            for (const sy of [-1, 1])
              this.box([7.8, 0.12, 0.12], [x, y + sy * 4.1, 1], '#617171', panel);
          }
        this.box([0.16, 36, 0.12], [-side * 22, 0, 1], c.color, panel, 0.5);
        panel.userData.targetX = side * 71;
        if (cs.stage >= 6) panel.position.x = panel.userData.targetX;
        this.revealShutters.push(panel);
      }
    } else if (index === 1) {
      const g = new T.Group();
      g.position.set(0, 0, -184);
      this.root.add(g);
      this.mesh('CylinderGeometry', [1.8, 4, 22, 8], '#7a8260', [0, 11, 0], g);
      for (let i = 0; i < 11; i++) {
        const x = Math.cos(i * 2.4) * (8 + i * 0.4),
          z = Math.sin(i * 2.4) * 6,
          y = 15 + i * 1.2;
        const crown = this.mesh('IcosahedronGeometry', [7, 1], '#93b577', [x, y, z], g, 0.2);
        crown.scale.y = 0.35;
        for (let n = 0; n < 3; n++) {
          this.box([1.8, 2.3, 1.8], [x - 2 + n * 2, y + 1.7, z], '#d0c9a2', g);
          this.box([0.5, 0.8, 0.08], [x - 2 + n * 2, y + 1.8, z + 1], '#e9e9a9', g, 1);
        }
      }
      g.visible = cs.stage >= 6;
      this.revealObjects.push(g);
    } else if (index === 2) {
      const g = new T.Group();
      g.position.set(0, 16, -182);
      this.root.add(g);
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6;
        this.box([3, 8 + (i % 3) * 3, 3], [Math.cos(a) * 18, Math.sin(a) * 12, 0], '#8ca5ba', g);
        this.mesh(
          'SphereGeometry',
          [0.5, 10, 8],
          c.color,
          [Math.cos(a) * 18, Math.sin(a) * 12 + 5, 2],
          g,
          2,
        );
      }
      for (let i = 0; i < 3; i++) {
        const r = this.ring(24 + i * 3, 0.2, c.color, [0, 0, 0], g, 1);
        r.rotation.y = i * 0.16;
      }
      g.visible = cs.stage >= 6;
      this.revealObjects.push(g);
      this.animated.push({ mesh: g, type: 'clock', offset: 0 });
    } else {
      const g = new T.Group();
      g.position.set(0, 20, -184);
      this.root.add(g);
      const nodes = [];
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4;
        const p = new T.Vector3(Math.cos(a) * (12 + i * 2), Math.sin(a) * (7 + i), Math.sin(a) * 5);
        nodes.push(p);
        this.mesh('IcosahedronGeometry', [1.5, 1], CHAPTERS[i % 4].color, p.toArray(), g, 1.5);
      }
      for (let i = 1; i < nodes.length; i++) {
        const a = nodes[i - 1],
          b = nodes[i],
          m = this.mesh(
            'CylinderGeometry',
            [0.09, 0.09, a.distanceTo(b), 6],
            c.color,
            a.clone().add(b).multiplyScalar(0.5).toArray(),
            g,
            1,
          );
        m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      }
      g.visible = cs.stage >= 6;
      this.revealObjects.push(g);
      this.discoveryFocus.set(0, 16, -162);
    }
    this.revealActive = cs.stage >= 6;
  }
  revealCivilization() {
    this.revealActive = true;
    for (const o of this.revealObjects) o.visible = true;
  }
  buildHub(state, c) {
    this.box([38, 2, 48], [0, -1.05, -4], '#354b52');
    this.box([36, 0.1, 46], [0, 0, -4], c.theme.deck);
    for (let z = -25; z < 20; z += 5) this.box([34, 0.03, 0.08], [0, 0.06, z], '#20383d');
    for (const x of [-18, 18]) {
      this.box([1.5, 3, 48], [x, 1.5, -4], '#213940');
      this.box([0.15, 0.1, 45], [x - Math.sign(x), 3.05, -4], c.color, this.root, 0.8);
    }
    this.box([36, 4, 1], [0, 2, 19.5], '#273f43');
    this.ring(20, 1.2, '#a18265', [0, 10, -25]);
    this.terminal(0, -15, c.color);
    this.marker('nav', '星图 / 启航', 0, -15, c.color);
    this.box([5, 1.3, 3], [-10, 0.65, -1], '#21383e');
    this.box([5.3, 0.25, 3.3], [-10, 1.4, -1], '#b08e6e');
    this.marker('workbench', '身体改造', -10, 1, '#e6b581');
    this.npc = this.robot('#cf9e66', 0.86);
    this.npc.position.set(-8, 0, -5);
    this.npc.rotation.y = -0.5;
    this.npc.visible = state.companion;
    this.root.add(this.npc);
    if (state.companion) this.marker('companion', '铆钉', -8, -5, '#e6b581');
    if (state.chapters[0].tool) this.box([0.25, 0.15, 1.3], [-10, 1.65, -1], '#ed985a');
    this.box([4, 1.2, 3], [11, 0.6, 1], '#5d7069');
    this.marker('garden', state.garden ? '漂流幼苗' : '空着的种植箱', 11, 2, '#c5e88c');
    if (state.garden) this.tree(11, 1, { color: '#c5e88c', rust: '#86775e' }, rand(77), 0.36);
    this.marker('observatory', '观测窗', 10, -18, '#a9c9ff');
    this.box([7, 0.5, 4], [8, 0.3, 12], '#263b42');
    this.box([6, 0.35, 2.5], [8, 0.72, 12], '#929c8d');
    for (let i = 0; i < state.modules.length; i++) {
      const m = this.collectible(-10 + i * 6, -20, CHAPTERS[i].color);
      m.scale.setScalar(0.7);
    }
  }
  tree(x, z, c, random, scale = 1) {
    const g = new T.Group();
    g.position.set(x, 0, z);
    g.scale.setScalar(scale);
    this.root.add(g);
    this.mesh('CylinderGeometry', [0.4, 1, 9, 6], '#78765c', [0, 4.5, 0], g);
    for (let j = 0; j < 3; j++) {
      const crown = this.mesh(
        'IcosahedronGeometry',
        [3.4, 1],
        j % 2 ? '#839c65' : '#a0b982',
        [(random() - 0.5) * 3, 7 + j * 2, (random() - 0.5) * 3],
        g,
        0.1,
      );
      crown.scale.y = 0.55;
    }
    this.mesh('SphereGeometry', [0.6, 10, 8], c.color, [0, 5, 0], g, 2);
  }
  ship(x, z) {
    const g = new T.Group();
    g.position.set(x, 0.8, z + 5);
    this.root.add(g);
    const hull = this.mesh('ConeGeometry', [2.7, 8, 4], '#9da8a1', [0, 1.8, 0], g);
    hull.rotation.x = -Math.PI / 2;
    this.box([10, 0.3, 3], [0, 0.8, 1], '#b18668', g);
    this.box([2, 1.1, 2.7], [0, 2.2, -0.8], '#74bfc1', g, 0.5);
    for (const x of [-2.4, 2.4]) {
      this.box([1.2, 1.5, 4], [x, 0.4, 2], '#3b5058', g);
      this.box([0.8, 0.7, 0.2], [x, 0.4, 4.05], '#edba82', g, 2);
    }
  }
  terminal(x, z, color) {
    this.box([2.6, 1.3, 2], [x, 0.65, z], '#253b42');
    const screen = this.box([2.1, 0.12, 1.5], [x, 1.4, z], color, this.root, 0.8);
    screen.rotation.x = 0.2;
    this.box([0.1, 3, 0.1], [x + 1, 1.5, z + 0.8], '#a4b7b2');
  }
  collectible(x, z, color) {
    const g = new T.Group();
    g.position.set(x, 0, z);
    this.root.add(g);
    this.box([1.4, 0.35, 1.4], [0, 0.2, 0], '#2a4149', g);
    const shard = this.mesh('OctahedronGeometry', [0.5, 0], color, [0, 1.6, 0], g, 1.3);
    this.animated.push({ mesh: shard, type: 'float', offset: x });
    return g;
  }
  marker(id, label, x, z, color) {
    const group = new T.Group();
    group.position.set(x, 0, z);
    this.root.add(group);
    const r = this.ring(1.8, 0.055, color, [0, 0.12, 0], group, 0.9);
    r.rotation.x = Math.PI / 2;
    const diamond = this.ring(0.32, 0.04, color, [0, 4.2, 0], group, 1);
    diamond.rotation.z = Math.PI / 4;
    this.animated.push({ mesh: diamond, type: 'marker', offset: 0 });
    this.markers.push({ id, label, x, z, group });
  }
  updateMarkers(cs) {
    if (this.index === 'hub') return;
    const ids = ['npc', 'relay', 'module', 'gate', 'boss', 'reveal', 'ship'];
    for (const m of this.markers) {
      m.group.visible =
        m.id === ids[cs.stage] ||
        (m.id === 'memory' && !cs.memory) ||
        (m.id === 'tool' && !cs.tool) ||
        (m.id === 'secret' && stateHasPhase(this.state) && !cs.secret);
    }
    if (this.gate) this.gate.visible = cs.stage < 4;
    if (this.bridge) {
      this.bridgeOpen = cs.stage >= 4;
      if (this.bridgeOpen) for (const child of this.bridge.children) child.rotation.y = 0;
    }
    if (this.moduleObject) this.moduleObject.visible = cs.stage < 3;
    if (this.memoryObject) this.memoryObject.visible = !cs.memory;
    if (this.secretObject) this.secretObject.visible = stateHasPhase(this.state) && !cs.secret;
    if (this.toolObject) this.toolObject.visible = !cs.tool;
    for (const o of this.revealObjects) o.visible = this.revealActive || cs.stage >= 6;
  }
  robot(color = '#e5dec9', scale = 1) {
    return createRobot(this, color, scale);
  }
  animateRobot(robot, time, speed = 0, attack = 0, airborne = false) {
    animateRobot(robot, time, speed, attack, airborne);
  }
  enemy(type, x, z, index, boss = false) {
    return createEnemy(this, type, x, z, index, boss, CHAPTERS[index]);
  }
  burst(pos, color, count = 10, scale = 1) {
    count = Math.min(count, Math.max(0, 180 - this.fx.length));
    for (let i = 0; i < count; i++) {
      const mesh = this.mesh(
        'BoxGeometry',
        [0.12 * scale, 0.12 * scale, 0.12 * scale],
        color,
        [pos.x, pos.y + 1, pos.z],
        this.root,
        1.8,
      );
      this.fx.push({
        mesh,
        velocity: new T.Vector3(
          (Math.random() - 0.5) * 9,
          Math.random() * 6,
          (Math.random() - 0.5) * 9,
        ),
        ttl: 0.35 + Math.random() * 0.35,
        life: 0.7,
      });
    }
  }
  wave(pos, color, radius = 5) {
    if (this.fx.length > 200) return;
    const mesh = this.ring(1, 0.07, color, [pos.x, 0.2, pos.z], this.root, 2);
    mesh.rotation.x = Math.PI / 2;
    this.fx.push({ mesh, ttl: 0.5, life: 0.5, wave: radius });
  }
  beam(a, b, color, width = 0.08, ttl = 0.1) {
    if (this.fx.length >= 200 || a.distanceToSquared(b) < 0.000001) return;
    const distance = a.distanceTo(b);
    const mesh = this.mesh(
      'CylinderGeometry',
      [width, width, 1, 6],
      color,
      [0, 0, 0],
      this.root,
      2,
    );
    mesh.scale.y = distance;
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    this.fx.push({ mesh, ttl, life: ttl });
  }
  shotEffect(from, to, weapon, impact) {
    if (this.fx.length > 165) return;
    const heavy = weapon === 'lance',
      color = heavy ? '#ffca82' : '#83ffde';
    const direction = to.clone().sub(from).normalize();
    // Fixed primitive dimensions keep the shared geometry cache bounded.
    const streak = (width, shade, life) => {
      const mesh = this.mesh('CylinderGeometry', [1, 1, 1, 6], shade, [0, 0, 0], this.root, 0);
      mesh.material = new T.MeshBasicMaterial({
        color: shade,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        blending: T.AdditiveBlending,
      });
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.scale.set(width, from.distanceTo(to), width);
      mesh.position.copy(from).add(to).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), direction);
      this.fx.push({ mesh, ttl: life, life, ownMaterial: true });
    };
    streak(heavy ? 0.07 : 0.025, '#f3fff6', heavy ? 0.14 : 0.085);
    if (!this.settings.reducedMotion) streak(heavy ? 0.2 : 0.085, color, heavy ? 0.22 : 0.13);
    const flash = this.mesh('SphereGeometry', [1, 8, 6], color, from.toArray(), this.root, 2);
    flash.scale.setScalar(heavy ? 0.25 : 0.15);
    flash.castShadow = false;
    this.fx.push({ mesh: flash, ttl: 0.055, life: 0.055 });
    if (!impact) return;
    const sparkCount = this.settings.reducedMotion
      ? 2
      : this.settings.quality === 'low'
        ? 5
        : heavy
          ? 12
          : 8;
    for (let i = 0; i < sparkCount; i++) {
      const mesh = this.mesh('BoxGeometry', [0.06, 0.06, 0.25], color, to.toArray(), this.root, 2);
      const velocity = direction
        .clone()
        .multiplyScalar(-2 - Math.random() * 3)
        .add(
          new T.Vector3((Math.random() - 0.5) * 6, Math.random() * 6, (Math.random() - 0.5) * 6),
        );
      mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), velocity.clone().normalize());
      mesh.castShadow = false;
      this.fx.push({ mesh, velocity, ttl: 0.14 + Math.random() * 0.16, life: 0.3 });
    }
    if (!this.settings.reducedMotion) {
      const ring = this.mesh('TorusGeometry', [1, 0.045, 6, 24], color, to.toArray(), this.root, 2);
      ring.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), direction);
      ring.scale.setScalar(0.12);
      ring.material = ring.material.clone();
      ring.material.transparent = true;
      ring.material.depthWrite = false;
      this.fx.push({ mesh: ring, ttl: 0.18, life: 0.18, ownMaterial: true, impact: true });
    }
  }
  slash(pos, rotation, combo) {
    const mesh = this.mesh(
      'RingGeometry',
      [2, 2.45, 24, 1, 0.2, Math.PI * 1.35],
      combo === 3 ? '#ffca87' : '#aeffe6',
      [pos.x, pos.y + 1.2, pos.z],
      this.root,
      2,
    );
    mesh.material = mesh.material.clone();
    mesh.material.transparent = true;
    mesh.material.opacity = 0.85;
    mesh.material.side = T.DoubleSide;
    mesh.material.depthWrite = false;
    mesh.rotation.set(-Math.PI / 2, 0, rotation + combo * 0.4);
    this.fx.push({ mesh, ttl: 0.2, life: 0.2, ownMaterial: true, slash: true });
  }
  trail(pos) {
    if (this.fx.length > 150) return;
    const mesh = this.box(
      [0.8, 1.7, 0.2],
      [pos.x, pos.y + 1.3, pos.z],
      '#96ffdf',
      this.root,
      1.3,
      0.3,
    );
    mesh.material = mesh.material.clone();
    this.fx.push({ mesh, ttl: 0.18, life: 0.18, ownMaterial: true });
  }
  update(dt, time) {
    if (this.subject && this.sun) {
      const p = this.subject.position;
      this.sun.target.position.set(p.x, 0, p.z - 12);
      this.sun.position.copy(this.sun.target.position).add(new T.Vector3(-30, 60, 65));
    }
    this.dust?.update(time);
    this.atmosphere?.update(time);
    if (this.revealActive)
      for (const panel of this.revealShutters)
        panel.position.x = T.MathUtils.lerp(
          panel.position.x,
          panel.userData.targetX,
          1 - Math.exp(-dt * 1.5),
        );
    if (this.bridge && this.bridgeOpen)
      this.bridge.position.y = T.MathUtils.lerp(this.bridge.position.y, 0, 1 - Math.exp(-dt * 4));
    for (const a of this.animated) {
      if (a.type === 'float' || a.type === 'marker') {
        a.mesh.rotation.y += dt * 0.7;
        a.mesh.position.y =
          (a.type === 'marker' ? 4.2 : a.mesh.parent === this.root ? 3 : 1.6) +
          Math.sin(time * 1.8 + a.offset) * 0.18;
      }
      if (a.type === 'rock') a.mesh.rotation.z += dt * 0.013;
      if (a.type === 'clock') {
        a.mesh.rotation.y += dt * 0.1;
        a.mesh.rotation.z += dt * 0.06;
      }
    }
    if (this.npc) {
      this.animateRobot(this.npc, time, 0);
      if (this.index === 'hub')
        this.npc.userData.rig.arms[0].rotation.x = -0.7 + Math.sin(time * 2) * 0.22;
    }
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.ttl -= dt;
      if (f.velocity) {
        f.mesh.position.addScaledVector(f.velocity, dt);
        f.velocity.y -= dt * 12;
      }
      if (f.wave) f.mesh.scale.setScalar(1 + (1 - f.ttl / f.life) * f.wave);
      if (f.ownMaterial) f.mesh.material.opacity = Math.max(0, f.ttl / f.life) * 0.7;
      if (f.slash) f.mesh.rotation.z += dt * 7;
      if (f.impact) f.mesh.scale.setScalar(0.12 + (1 - f.ttl / f.life) * 0.6);
      if (f.ttl <= 0) {
        this.root.remove(f.mesh);
        if (f.ownMaterial) f.mesh.material.dispose();
        this.fx.splice(i, 1);
      }
    }
  }
  render() {
    if (this.viewer) this.viewer.render();
    else this.pipeline.render();
  }
  dispose() {
    this.reset();
    for (const m of this.materials.values()) m.dispose();
    for (const g of this.geometries.values()) g.dispose();
    for (const t of this.textures.values()) t.dispose();
    this.environmentMap?.dispose();
    this.starGeo?.dispose();
    this.starMat?.dispose();
    this.pipeline.dispose();
    this.renderer.dispose();
  }
}
function stateHasPhase(state) {
  return state.modules.includes('phase');
}
