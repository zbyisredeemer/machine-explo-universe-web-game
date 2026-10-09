// Chapter colours are shared by the interface, architectural materials and sky.
export const THEMES = [
  {
    signal: '#47efd7',
    accent: '#ffad64',
    sky: '#081b39',
    horizon: '#20567f',
    deep: '#112744',
    metal: '#346c93',
    deck: '#34628b',
    ground: '#294463',
    sun: '#ffdbc0',
    fill: '#94c8ff',
    planet: ['#152c69', '#248fa5', '#ffb772'],
  },
  {
    signal: '#b9f46c',
    accent: '#ffadca',
    sky: '#092c32',
    horizon: '#2f8275',
    deep: '#133e40',
    metal: '#397e73',
    deck: '#3c7b70',
    ground: '#285648',
    sun: '#ffe9b0',
    fill: '#8be8d6',
    planet: ['#124754', '#3ba780', '#e5f391'],
  },
  {
    signal: '#78c7ff',
    accent: '#e4b7ff',
    sky: '#101d46',
    horizon: '#3f62a4',
    deep: '#1d3157',
    metal: '#557cac',
    deck: '#4b6b9c',
    ground: '#354f7a',
    sun: '#e7ddff',
    fill: '#9adfff',
    planet: ['#253a85', '#649bdc', '#c8b7ef'],
  },
  {
    signal: '#ffcf79',
    accent: '#ff91b4',
    sky: '#301e43',
    horizon: '#92536b',
    deep: '#3e3155',
    metal: '#805d88',
    deck: '#705a80',
    ground: '#554063',
    sun: '#ffdbbb',
    fill: '#bdbbff',
    planet: ['#47275e', '#b06089', '#ffd08d'],
  },
];

export function applyTheme(index = 0) {
  const theme = THEMES[index] || THEMES[0],
    root = document.documentElement;
  root.style.setProperty('--signal', theme.signal);
  root.style.setProperty('--accent', theme.accent);
  root.style.setProperty('--mint', theme.signal);
  root.style.setProperty('--warm', theme.accent);
  root.style.setProperty('--chapter-deep', theme.deep);
  root.style.setProperty('--chapter-metal', theme.metal);
  root.dataset.chapter = String(index);
}
