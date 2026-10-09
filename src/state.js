import { CHAPTERS, EQUIPMENT } from './data.js';
import { CACHES, TRAINING } from './expedition.js';

export const SAVE_KEY = 'alien-body.save.v1';
export const BACKUP_KEY = 'alien-body.save.backup.v1';
export const SETTINGS_KEY = 'alien-body.settings.v1';
export function chapterState() {
  return {
    stage: 0,
    killed: [],
    caches: [],
    helped: false,
    memory: false,
    secret: false,
    tool: false,
    completed: false,
  };
}
export function newState() {
  return {
    version: 1,
    location: 0,
    unlocked: 0,
    chapters: CHAPTERS.map(chapterState),
    modules: [],
    training: [],
    activeModule: null,
    salvage: 0,
    equipment: { chassis: 'scout', weapon: 'pulse', skin: 'ivory' },
    owned: ['scout', 'pulse', 'ivory'],
    companion: false,
    garden: false,
    ending: null,
    playTime: 0,
    kills: 0,
    deaths: 0,
    createdAt: Date.now(),
  };
}
const clampInt = (v, max) => (Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0);
export function validateSave(raw) {
  if (!raw || raw.version !== 1 || !Array.isArray(raw.chapters) || raw.chapters.length !== 4)
    return null;
  const s = newState();
  s.chapters = raw.chapters.map((c, chapter) => ({
    ...chapterState(),
    stage: clampInt(c?.stage, 6),
    caches: [
      ...new Set(
        (Array.isArray(c?.caches) ? c.caches : []).filter((id) =>
          CACHES[chapter].some((cache) => cache.id === id && c?.stage >= cache.stage),
        ),
      ),
    ],
    killed: [
      ...new Set(
        (Array.isArray(c?.killed) ? c.killed : []).filter((id) =>
          /^(relay-[0-2]|module-[0-2]|optional-[0-1]|boss)$/.test(id),
        ),
      ),
    ],
    helped: c?.helped === true && c?.stage >= 3,
    memory: c?.memory === true,
    secret: c?.secret === true,
    tool: c?.tool === true,
    completed: c?.completed === true && c?.stage === 6,
  }));
  // Reconstruct unlocks from sequential completion rather than trusting a stored index.
  for (let i = 0; i < 3; i++) {
    if (s.chapters[i].completed) s.unlocked = i + 1;
    else break;
  }
  for (let i = s.unlocked + 1; i < 4; i++) s.chapters[i] = chapterState();
  // Repair a crash between a guardian defeat and the checkpoint write.
  for (const c of s.chapters) if (c.stage === 4 && c.killed.includes('boss')) c.stage = 5;
  s.training = Array.isArray(raw.training)
    ? [...new Set(raw.training.filter((id) => TRAINING.some((lesson) => lesson.id === id)))]
    : s.chapters[0].stage > 0
      ? TRAINING.map((lesson) => lesson.id)
      : [];
  s.location = raw.location === 'hub' ? 'hub' : Math.min(clampInt(raw.location, 3), s.unlocked);
  for (let i = 0; i <= s.unlocked; i++)
    if (s.chapters[i].stage >= 3 || s.chapters[i].completed) s.modules.push(CHAPTERS[i].module);
  s.activeModule = s.modules.includes(raw.activeModule)
    ? raw.activeModule
    : s.modules.at(-1) || null;
  s.salvage = clampInt(raw.salvage, 100000);
  const ids = Object.values(EQUIPMENT)
    .flat()
    .map((x) => x.id);
  s.owned = [
    ...new Set([
      ...s.owned,
      ...(Array.isArray(raw.owned) ? raw.owned.filter((x) => ids.includes(x)) : []),
    ]),
  ];
  for (const slot of Object.keys(EQUIPMENT)) {
    if (
      EQUIPMENT[slot].some((x) => x.id === raw.equipment?.[slot]) &&
      s.owned.includes(raw.equipment[slot])
    )
      s.equipment[slot] = raw.equipment[slot];
  }
  s.companion = raw.companion === true && s.chapters[0].completed;
  s.garden = s.chapters[1].completed;
  s.ending =
    s.chapters[3].completed && ['share', 'journey'].includes(raw.ending) ? raw.ending : null;
  s.playTime = clampInt(raw.playTime, 1e8);
  s.kills = clampInt(raw.kills, 100000);
  s.deaths = clampInt(raw.deaths, 100000);
  s.createdAt = Number.isFinite(raw.createdAt) ? raw.createdAt : s.createdAt;
  return s;
}
export function readSave(storage) {
  return readSaveResult(storage).state;
}
export function readSaveResult(storage) {
  let foundInvalid = false;
  for (const key of [SAVE_KEY, BACKUP_KEY]) {
    try {
      const raw = storage.getItem(key);
      if (raw === null) continue;
      const value = validateSave(JSON.parse(raw));
      if (value) return { state: value, status: key === BACKUP_KEY ? 'recovered' : 'saved' };
      foundInvalid = true;
    } catch {
      foundInvalid = true;
    }
  }
  return { state: null, status: foundInvalid ? 'invalid' : 'empty' };
}
export function writeSave(storage, state) {
  try {
    const previous = storage.getItem(SAVE_KEY);
    const serialized = JSON.stringify(state);
    if (previous === serialized && storage.available !== false) return true;
    let previousValid = false;
    try {
      previousValid = !!validateSave(JSON.parse(previous));
    } catch {
      /* Keep a good backup when the primary is corrupt. */
    }
    // If backup rotation fails, retain the old primary recovery point.
    if (previousValid && previous !== serialized) storage.setItem(BACKUP_KEY, previous);
    storage.setItem(SAVE_KEY, serialized);
    return true;
  } catch {
    return false;
  }
}
export function advance(state, chapter, stage) {
  const c = state.chapters[chapter];
  if (chapter > state.unlocked || stage !== c.stage + 1 || stage > 6) return false;
  c.stage = stage;
  if (stage === 3) {
    const id = CHAPTERS[chapter].module;
    if (!state.modules.includes(id)) state.modules.push(id);
    state.activeModule = id;
  }
  if (stage === 6 && chapter < 3) completeChapter(state, chapter);
  return true;
}
export function completeChapter(state, chapter, ending) {
  const c = state.chapters[chapter];
  if (c.stage < 6 || chapter > state.unlocked) return false;
  if (chapter === 3 && !['share', 'journey'].includes(ending)) return false;
  if (!c.completed) state.salvage += 60;
  c.completed = true;
  state.unlocked = Math.max(state.unlocked, Math.min(3, chapter + 1));
  if (chapter === 1) state.garden = true;
  if (chapter === 3) state.ending = ending;
  return true;
}
export function equip(state, slot, id) {
  const item = EQUIPMENT[slot]?.find((x) => x.id === id);
  if (!item || (item.chapter !== undefined && !state.chapters[item.chapter].completed))
    return false;
  if (!state.owned.includes(id)) {
    if (state.salvage < item.cost) return false;
    state.salvage -= item.cost;
    state.owned.push(id);
  }
  state.equipment[slot] = id;
  return true;
}
export function equipmentStats(state) {
  return {
    chassis: EQUIPMENT.chassis.find((x) => x.id === state.equipment.chassis),
    weapon: EQUIPMENT.weapon.find((x) => x.id === state.equipment.weapon),
    skin: EQUIPMENT.skin.find((x) => x.id === state.equipment.skin),
  };
}
