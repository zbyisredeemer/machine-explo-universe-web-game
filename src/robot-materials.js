import * as T from 'three';

export function robotMaterials(world, palette) {
  const {
    color,
    accent = '#b77a48',
    light = '#86d9cc',
  } = typeof palette === 'string' ? { color: palette } : palette;
  if (!world.textures.has('robot-metal-micro')) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#d5d5d5';
    ctx.fillRect(0, 0, 512, 512);
    let seed = 735;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      return (seed >>> 0) / 4294967296;
    };
    for (let i = 0; i < 13000; i++) {
      const n = 145 + random() * 95;
      ctx.fillStyle = `rgba(${n},${n},${n},.18)`;
      ctx.fillRect(random() * 512, random() * 512, 1 + random() * 9, 0.6);
    }
    for (let i = 0; i < 34; i++) {
      ctx.strokeStyle = `rgba(45,45,45,${0.04 + random() * 0.1})`;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      const x = random() * 512,
        y = random() * 512;
      ctx.moveTo(x, y);
      ctx.lineTo(x + random() * 70, y + random() * 6);
      ctx.stroke();
    }
    const texture = new T.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    texture.anisotropy = 4;
    world.textures.set('robot-metal-micro', texture);
  }
  const micro = world.textures.get('robot-metal-micro');
  const make = (key, settings) => {
    key = 'robot-pbr-' + key;
    if (!world.materials.has(key)) world.materials.set(key, new T.MeshPhysicalMaterial(settings));
    return world.materials.get(key);
  };
  return {
    paint: make('paint-' + color, {
      color,
      metalness: 0.68,
      roughness: 0.37,
      roughnessMap: micro,
      bumpMap: micro,
      bumpScale: 0.006,
      clearcoat: 0.28,
      clearcoatRoughness: 0.32,
      envMapIntensity: 1.8,
    }),
    accent: make('accent-' + accent, {
      color: accent,
      metalness: 0.48,
      roughness: 0.4,
      roughnessMap: micro,
      clearcoat: 0.3,
      envMapIntensity: 1.5,
    }),
    edge: make('edge', {
      color: '#b6bfc0',
      metalness: 0.94,
      roughness: 0.26,
      roughnessMap: micro,
      envMapIntensity: 1.9,
    }),
    steel: make('steel', {
      color: '#62717a',
      metalness: 0.88,
      roughness: 0.3,
      roughnessMap: micro,
      envMapIntensity: 2,
    }),
    black: make('black', {
      color: '#151d23',
      metalness: 0.65,
      roughness: 0.34,
      roughnessMap: micro,
      envMapIntensity: 1.3,
    }),
    rubber: make('rubber', {
      color: '#11191e',
      metalness: 0,
      roughness: 0.86,
      bumpMap: micro,
      bumpScale: 0.015,
    }),
    copper: make('copper', {
      color: '#b77a48',
      metalness: 0.83,
      roughness: 0.35,
      roughnessMap: micro,
      envMapIntensity: 1.6,
    }),
    glass: make('glass', {
      color: '#0c242e',
      metalness: 0.55,
      roughness: 0.1,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      envMapIntensity: 3,
    }),
    led: make('led-' + light, {
      color: light,
      emissive: light,
      emissiveIntensity: 1.2,
      metalness: 0.4,
      roughness: 0.2,
    }),
    amber: make('amber', {
      color: '#d4a564',
      emissive: '#f5a452',
      emissiveIntensity: 0.65,
      metalness: 0.45,
      roughness: 0.3,
    }),
  };
}
