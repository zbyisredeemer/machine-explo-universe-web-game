import * as T from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { THEMES } from './theme.js';

class ContactPass extends GTAOPass {
  _overrideVisibility() {
    super._overrideVisibility();
    // Glass, atmosphere shells and attack telegraphs must not occlude opaque
    // surfaces in the normal/depth pass.
    this.scene.traverse((object) => {
      if (
        object.isMesh &&
        object.visible &&
        (object.material?.transparent || object.userData.skyBackdrop)
      ) {
        object.visible = false;
        this._visibilityCache.push(object);
      }
    });
  }
  dispose() {
    super.dispose();
    this.gtaoMaterial.dispose();
    this.blendMaterial.dispose();
  }
}

export class VisualPipeline {
  constructor(renderer, scene, camera, settings) {
    this.settings = settings;
    this.renderer = renderer;
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.contact = new ContactPass(
      scene,
      camera,
      512,
      512,
      undefined,
      { radius: 0.65, thickness: 0.3, distanceFallOff: 1, samples: 8, screenSpaceRadius: false },
      { samples: 8, radius: 4 },
    );
    this.contact.blendIntensity = 0.55;
    this.composer.addPass(this.contact);
    this.bloom = new UnrealBloomPass(new T.Vector2(innerWidth, innerHeight), 0.34, 0.55, 1.35);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.antialias = new ShaderPass(FXAAShader);
    this.composer.addPass(this.antialias);
    this.scene = scene;
    this.camera = camera;
    this.configure();
  }
  configure() {
    this.enabled = this.settings.quality !== 'low';
    const limit = this.enabled ? 1.5 : 1;
    const ratio = Math.min(
      devicePixelRatio,
      limit,
      Math.sqrt(2300000 / (innerWidth * innerHeight)),
    );
    this.renderer.setPixelRatio(ratio);
    this.renderer.shadowMap.enabled = this.enabled;
    this.composer.setPixelRatio(ratio);
    this.resize();
  }
  resize() {
    const ratio = Math.min(
      devicePixelRatio,
      this.enabled ? 1.5 : 1,
      Math.sqrt(2300000 / (innerWidth * innerHeight)),
    );
    if (this.renderer.getPixelRatio() !== ratio) {
      this.renderer.setPixelRatio(ratio);
      this.composer.setPixelRatio(ratio);
    }
    this.composer.setSize(innerWidth, innerHeight);
    this.antialias.uniforms.resolution.value.set(
      1 / (innerWidth * ratio),
      1 / (innerHeight * ratio),
    );
    this.contact.setSize(
      Math.max(1, Math.round(innerWidth * ratio * 0.5)),
      Math.max(1, Math.round(innerHeight * ratio * 0.5)),
    );
  }
  render() {
    if (this.enabled) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    for (const pass of this.composer.passes) pass.dispose?.();
    this.composer.dispose();
  }
}

// Shared, deterministic micro-surfaces preserve the chapter palette.
export function surfaceTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#d1d1d1';
  ctx.fillRect(0, 0, 256, 256);
  let seed = 7919;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
  for (let i = 0; i < 5000; i++) {
    const v = 130 + random() * 100;
    ctx.fillStyle = `rgba(${v},${v},${v},.16)`;
    ctx.fillRect(random() * 256, random() * 256, 1 + random() * 5, 1);
  }
  for (let i = 0; i < 32; i++) {
    ctx.strokeStyle = '#7b807e22';
    ctx.beginPath();
    const x = random() * 256,
      y = random() * 256;
    ctx.moveTo(x, y);
    ctx.lineTo(x + random() * 20, y + random() * 2);
    ctx.stroke();
  }
  const texture = new T.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.repeat.set(3, 3);
  texture.anisotropy = 4;
  return texture;
}

export function deckTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#a4acac';
  ctx.fillRect(0, 0, 512, 512);
  let seed = 1024;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
  for (let i = 0; i < 7500; i++) {
    const value = 120 + random() * 85;
    ctx.fillStyle = `rgba(${value},${value},${value},.11)`;
    ctx.fillRect(random() * 512, random() * 512, 1 + random() * 8, 1);
  }
  ctx.strokeStyle = '#737c7e';
  ctx.lineWidth = 3;
  ctx.strokeRect(11, 11, 490, 490);
  ctx.lineWidth = 1;
  ctx.strokeRect(19, 19, 474, 474);
  for (const x of [29, 483])
    for (const y of [29, 483]) {
      ctx.fillStyle = '#566568';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#c1c7c2';
      ctx.fillRect(x - 2, y - 1, 4, 1);
    }
  ctx.fillStyle = '#626f7188';
  ctx.font = '12px monospace';
  ctx.fillText('WITNESS / STRUCTURAL PLATE 07', 32, 475);
  for (let i = 0; i < 8; i++) ctx.fillRect(420 + i * 6, 454, 3, 18);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function planetTexture(index) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d'),
    data = ctx.createImageData(512, 256);
  const colors = THEMES[index].planet.map((hex) =>
    [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)),
  );
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 512; x++) {
      const a = (x / 512) * Math.PI * 2,
        b = (y / 256) * Math.PI;
      const n =
        Math.sin(b * 24 + Math.sin(a * 3) * 1.8 + Math.sin(a * 11 + b * 8) * 0.3) * 0.19 +
        Math.sin(b * 71 + Math.sin(a * 7) * 2) * 0.055 +
        Math.sin(a * 17 + b * 39) * 0.035;
      const t = Math.max(0, Math.min(0.999, 0.5 + n + Math.pow(Math.abs(Math.cos(b)), 10) * 0.3));
      const k = t < 0.5 ? 0 : 1,
        f = (t % 0.5) * 2;
      const i = (y * 512 + x) * 4;
      for (let c = 0; c < 3; c++) data.data[i + c] = colors[k][c] * (1 - f) + colors[k + 1][c] * f;
      data.data[i + 3] = 255;
    }
  ctx.putImageData(data, 0, 0);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}

export function atmosphereMaterial(color) {
  return new T.ShaderMaterial({
    uniforms: { tint: { value: new T.Color(color) } },
    vertexShader: `varying vec3 vNormal;varying vec3 vPosition;void main(){vec4 p=modelViewMatrix*vec4(position,1.);vNormal=normalize(normalMatrix*normal);vPosition=p.xyz;gl_Position=projectionMatrix*p;}`,
    fragmentShader: `uniform vec3 tint;varying vec3 vNormal;varying vec3 vPosition;void main(){float f=pow(1.-abs(dot(normalize(vNormal),normalize(-vPosition))),3.);gl_FragColor=vec4(tint*1.4,f*.7);}`,
    transparent: true,
    blending: T.AdditiveBlending,
    depthWrite: false,
    side: T.BackSide,
  });
}

export function skyMaterial(theme) {
  return new T.ShaderMaterial({
    uniforms: {
      zenith: { value: new T.Color(theme.sky) },
      horizon: { value: new T.Color(theme.horizon) },
      glow: { value: new T.Color(theme.accent) },
    },
    vertexShader: `varying vec3 skyDirection;void main(){skyDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform vec3 zenith;uniform vec3 horizon;uniform vec3 glow;varying vec3 skyDirection;
      void main(){vec3 d=normalize(skyDirection);float h=smoothstep(-.12,.75,d.y);
      vec3 colour=mix(horizon,zenith,h);float cloud=sin(d.x*8.+d.z*4.+sin(d.y*9.)*1.2)*.5+.5;
      float band=exp(-pow((d.y-.21-d.x*.16)*7.,2.))*pow(cloud,3.);
      colour+=glow*band*.075;gl_FragColor=vec4(colour,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
    side: T.BackSide,
    depthWrite: false,
    depthTest: false,
  });
}

export class Dust {
  constructor(root, color) {
    const positions = new Float32Array(480 * 3);
    for (let i = 0; i < 480; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 95;
      positions[i * 3 + 1] = Math.random() * 22;
      positions[i * 3 + 2] = 35 - Math.random() * 200;
    }
    this.geometry = new T.BufferGeometry();
    this.geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
    this.material = new T.PointsMaterial({
      color,
      size: 0.065,
      transparent: true,
      opacity: 0.5,
      blending: T.AdditiveBlending,
      depthWrite: false,
    });
    this.mesh = new T.Points(this.geometry, this.material);
    root.add(this.mesh);
  }
  update(time) {
    this.mesh.position.x = Math.sin(time * 0.05) * 2;
    this.mesh.position.y = Math.sin(time * 0.14) * 0.4;
  }
  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
