// Hostile factions keep warm threat optics; chapter colours identify armour.
export const ENEMY_STYLES = [
  {
    name: '熔炉工业',
    color: '#ed7135',
    accent: '#ffce57',
    light: '#ffb06c',
    trim: '#e2e5d8',
    patrol: ['#ed7135', '#319bba', '#f5c349'],
  },
  {
    name: '植物共生',
    color: '#39b994',
    accent: '#f692b7',
    light: '#d6ff71',
    trim: '#e7efa8',
    patrol: ['#ec839d', '#369f8b', '#9bcf49'],
  },
  {
    name: '冰蓝时钟',
    color: '#4c82d8',
    accent: '#a9dfff',
    light: '#8ce7ff',
    trim: '#dec3ff',
    patrol: ['#7372d5', '#3f9ecb', '#a88dde'],
  },
  {
    name: '玫金相位',
    color: '#a157a0',
    accent: '#ffd180',
    light: '#ffc3e8',
    trim: '#f1a2bf',
    patrol: ['#d96894', '#8e62c2', '#e6ac55'],
  },
];

export function enemyPalette(index, type, boss) {
  const style = ENEMY_STYLES[index];
  return {
    ...style,
    color: boss ? style.color : style.patrol[{ cutter: 0, turret: 1, beacon: 2 }[type] ?? 0],
  };
}

export function decorateEnemy(w, p, r, index, boss, type, palette) {
  const { m } = p,
    trim = w.mat(palette.trim),
    glow = w.mat(palette.light, 0.75),
    scale = boss ? 1 : 0.36;
  const family = p.node(r.body, [0, 0, 0], 'faction-detail');
  r.faction = palette.name;
  r.palette = { paint: palette.color, accent: palette.accent, light: palette.light };
  // All additions are attached to the existing body, leaving leg/tool animation intact.
  if (boss) {
    for (const side of [-1, 1]) {
      p.box([0.58, 0.18, 1.5], [side * 1.44, -0.45, 0.08], m.accent, family);
      for (let n = 0; n < 3; n++)
        p.box(
          [0.06, 0.18, 0.18],
          [side * 1.44, -0.55, -0.48 + n * 0.32],
          m.black,
          family,
        ).rotation.z = side * 0.4;
      p.box([0.48, 0.18, 0.51], [0, -0.25, -0.31], m.accent, r.arms[side < 0 ? 0 : 1]);
    }
  } else {
    // A broad colour band remains visible at gameplay distance.
    const y = type === 'cutter' ? 0.4 : type === 'turret' ? 0.29 : 0.67;
    p.box(
      [type === 'beacon' ? 0.5 : 0.88, 0.07, type === 'cutter' ? 0.9 : 0.44],
      [0, y, 0],
      m.accent,
      family,
    );
    if (type === 'cutter')
      for (const s of [-1, 1]) p.box([0.09, 0.035, 1.05], [s * 0.46, 0.4, 0.04], glow, family);
    if (type === 'turret')
      for (const s of [-1, 1]) p.box([0.12, 0.4, 0.74], [s * 0.59, 0, 0], m.accent, family);
  }
  if (index === 0) {
    // Furnace armour: squared shoulder shields and a striped industrial crest.
    if (boss) {
      for (const side of [-1, 1]) {
        p.box([0.74, 0.78, 0.35], [side * 1.37, 1.1, -0.56], m.paint, family);
        for (let n = 0; n < 3; n++)
          p.box(
            [0.12, 0.54, 0.03],
            [side * 1.37 - 0.22 + n * 0.22, 1.1, -0.75],
            m.accent,
            family,
          ).rotation.z = -0.32;
        p.ring(0.27, 0.045, [side * 1.2, 1.7, 0.5], m.accent, family, 'y');
      }
      p.box([1.3, 0.16, 0.18], [0, 1.86, -0.7], trim, family);
    } else {
      for (let n = 0; n < 3; n++)
        p.box(
          [0.1, 0.025, 0.34],
          [-0.24 + n * 0.24, type === 'cutter' ? 0.45 : 0.34, -0.05],
          m.black,
          family,
        ).rotation.y = -0.4;
      if (type === 'beacon') p.ring(0.48, 0.065, [0, 0.72, 0], m.accent, family, 'y');
    }
  } else if (index === 1) {
    // Leaf armour and seed pods, with pink edges against the green world.
    for (const side of [-1, 1]) {
      const leaf = p.box(
        [scale * 0.47, scale * 1.16, scale * 0.15],
        [side * scale * (boss ? 1.45 : 1.7), boss ? 1.08 : 0.43, 0],
        m.accent,
        family,
      );
      leaf.rotation.z = -side * 0.48;
      p.cylinder(
        scale * 0.18,
        scale * 0.65,
        [side * scale * 1.4, boss ? 0.15 : 0.1, boss ? -0.7 : 0.35],
        trim,
        family,
      );
    }
    if (boss)
      r.vents.forEach((vent, i) => {
        p.box([0.055, 1.53, 0.03], [0, 0.7, 0.23], glow, vent.mesh);
        if (i % 2 === 0) p.box([0.71, 0.13, 0.1], [0, 1.5, 0.15], m.accent, vent.mesh);
      });
    else p.ring(type === 'beacon' ? 0.5 : 0.37, 0.028, [0, 0.5, 0], glow, family, 'y');
  } else if (index === 2) {
    // Clockwork crown and angular blue radiator fins.
    const radius = boss ? 1.36 : type === 'beacon' ? 0.61 : 0.48,
      y = boss ? 0.6 : 0.28,
      z = boss ? -0.85 : -0.48;
    p.ring(radius, boss ? 0.045 : 0.023, [0, y, z], m.accent, family);
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      p.box(
        [scale * 0.11, scale * 0.25, 0.045],
        [Math.sin(a) * radius, y + Math.cos(a) * radius, z - 0.045],
        glow,
        family,
      ).rotation.z = -a;
    }
    for (const side of [-1, 1]) {
      const fin = p.box(
        [scale * 0.22, scale * 0.68, scale * 0.55],
        [side * scale * (boss ? 1.37 : 1.65), boss ? 1.8 : 0.62, 0.08],
        trim,
        family,
      );
      fin.rotation.z = side * 0.23;
    }
  } else {
    // Rose-gold diamond plates and asymmetric antennae identify phase units.
    const size = boss ? 0.66 : 0.25;
    const diamond = p.box(
      [size, size, 0.08],
      [0, boss ? 1.85 : 0.73, boss ? -0.83 : 0],
      m.accent,
      family,
    );
    diamond.rotation.z = Math.PI / 4;
    for (const side of [-1, 1]) {
      const fin = p.box(
        [scale * 0.18, scale * 0.93, scale * 0.46],
        [side * scale * (boss ? 1.25 : 1.65), boss ? 1.65 : 0.58, 0.13],
        trim,
        family,
      );
      fin.rotation.z = -side * 0.4;
    }
    if (boss)
      r.vents.forEach((vent) => p.box([0.035, 2.15, 0.09], [-0.12, 0, -0.4], m.accent, vent.mesh));
    else if (type === 'beacon') {
      const ring = p.ring(0.58, 0.024, [0, 0.12, 0], glow, family);
      ring.rotation.z = Math.PI / 4;
    }
  }
}
