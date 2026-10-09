import * as T from 'three';

// Shared geometry/material caches keep repeated travel bounded; accents never block shots.
export class ChapterAtmosphere {
  constructor(world, index) {
    this.world = world;
    this.index = index;
    this.mechanisms = [];
    const color = ['#ffb46a', '#c2f79b', '#89dafa', '#edbaff'][index];
    for (const z of [12, -36, -92, -137])
      for (const side of [-1, 1]) {
        const group = new T.Group();
        group.position.set(side * 33, 0, z);
        world.root.add(group);
        world.mesh('CylinderGeometry', [1.8, 2.3, 0.25, 24], '#142535', [0, 0.1, 0], group);
        const moving = new T.Group();
        moving.position.y = index === 1 ? 4 : 6;
        group.add(moving);
        if (index === 0) {
          world.box([0.4, 6, 0.4], [0, 3, 0], '#456170', group);
          const rim = world.ring(2, 0.13, '#7c9baa', [0, 0, 0], moving);
          rim.rotation.y = Math.PI / 2;
          for (let i = 0; i < 4; i++) {
            const blade = world.box([0.16, 2.8, 0.48], [0, 0, 0], '#9b8062', moving);
            blade.rotation.x = (i * Math.PI) / 2;
          }
          world.mesh('SphereGeometry', [0.24, 8, 6], color, [0, 0, 0], moving, 2);
        } else if (index === 1) {
          for (let i = 0; i < 5; i++) {
            const leaf = world.mesh(
              'SphereGeometry',
              [1, 12, 8],
              i % 2 ? '#5b8764' : '#86bd83',
              [0, 0, 0],
              moving,
            );
            leaf.scale.set(0.48, 2.8, 0.24);
            leaf.rotation.z = i * Math.PI * 0.4;
            leaf.position.set(Math.sin(i * Math.PI * 0.4), Math.cos(i * Math.PI * 0.4), 0);
          }
          world.mesh('SphereGeometry', [0.65, 12, 8], color, [0, 0, 0.3], moving, 0.65);
        } else if (index === 2) {
          world.box([0.3, 10, 0.3], [0, 5, 0], '#56798d', group);
          for (let i = 0; i < 3; i++) {
            const ring = world.ring(1.3 + i * 0.5, 0.045, color, [0, 0, 0], moving, 0.65);
            ring.rotation.set(i * 0.6, i * 0.4, 0);
          }
          world.mesh('OctahedronGeometry', [0.6, 0], '#cadfec', [0, 0, 0], moving, 0.15);
        } else {
          for (let i = 0; i < 3; i++) {
            const crystal = world.mesh(
              'OctahedronGeometry',
              [1, 0],
              i % 2 ? '#8b7cb9' : '#c5abd4',
              [Math.sin(i * 2.1) * 1.3, Math.cos(i * 2.1), 0],
              moving,
              0.3,
            );
            crystal.scale.set(0.6, 2.2, 0.6);
            crystal.rotation.z = i * 0.8;
          }
        }
        const ring = world.ring(2.3, 0.035, color, [0, 0.27, 0], group, 0.8);
        ring.rotation.x = Math.PI / 2;
        this.mechanisms.push({ group, moving, height: moving.position.y, phase: z * 0.1 + side });
      }
    const key = 'chapter-motes-' + index;
    if (!world.geometries.has(key)) {
      let seed = 71 + index;
      const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
        return (seed >>> 0) / 4294967296;
      };
      const positions = Array.from({ length: 180 }, () => [
        (random() - 0.5) * 70,
        1 + random() * 18,
        32 - random() * 190,
      ]).flat();
      const geometry = new T.BufferGeometry();
      geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
      world.geometries.set(key, geometry);
      world.materials.set(
        key,
        new T.PointsMaterial({
          color,
          size: index === 1 ? 0.14 : 0.08,
          transparent: true,
          opacity: 0.5,
          depthWrite: false,
          blending: T.AdditiveBlending,
        }),
      );
    }
    this.motes = new T.Points(world.geometries.get(key), world.materials.get(key));
    world.root.add(this.motes);
  }
  update(time) {
    const { quality, reducedMotion } = this.world.settings;
    this.motes.visible = quality !== 'low';
    this.motes.position.y = reducedMotion ? 0 : Math.sin(time * 0.15) * 1.2;
    for (const [index, item] of this.mechanisms.entries()) {
      item.group.visible = quality !== 'low' || index % 2 === 0;
      if (reducedMotion) {
        item.moving.rotation.set(0, 0, 0);
        item.moving.position.y = item.height;
        continue;
      }
      if (this.index === 0) item.moving.rotation.x = time * 0.55;
      else {
        item.moving.rotation.y = Math.sin(time * 0.17 + item.phase) * 0.35;
        item.moving.position.y = item.height + Math.sin(time * 0.45 + item.phase) * 0.35;
      }
    }
  }
}
