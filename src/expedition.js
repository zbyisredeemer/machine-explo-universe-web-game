// Optional discoveries share the same validated IDs in saves, markers and the journal.
const locations = [
  { id: 'arrival', x: 18, z: 19, stage: 0, reward: 18 },
  { id: 'workshop', x: -30, z: -34, stage: 3, reward: 28 },
  { id: 'observatory', x: 24, z: -91, stage: 5, reward: 40 },
];
const records = [
  [
    [
      '未拆封的交接箱',
      '接班的人没有回来，工具却仍按尺寸整齐排列。你带走备用件，把那张手写的清单留在原处。',
    ],
    [
      '维修工的午休',
      '舷窗旁固定着一只空杯子。记录说，这里的维修机器人曾给自己争取到每天十分钟看星星。',
    ],
    ['留给后来者', '储物箱上的灯亮了很久。最后一条指令只有一句：如果还有人到达，请让它继续走。'],
  ],
  [
    ['会呼吸的行囊', '种子被包在柔软的纤维里。它们在没有光的地方，也为下一次春天留下了余量。'],
    ['园丁的备忘', '每一株植物旁都有一份不同的照料记录。这里的生命从来没有被当作完全相同的零件。'],
    ['一片远行的叶', '叶脉里储存着归途。你没有摘下它，只收起花盆旁为旅人准备的修复材料。'],
  ],
  [
    ['尚未冷却的茶', '杯口的热气停在半空。时间变慢以前，有人把备用能源放在路边，打算回来取。'],
    ['钟表匠的误差', '这一枚齿轮故意少了一格。说明写着：留一点误差，才有重新选择的余地。'],
    ['比约定早一点', '储物格每天只开启一秒。如今你能耐心等到它，读见一句迟到了许多年的欢迎。'],
  ],
  [
    ['没有坐标的包裹', '包裹不属于任何目的地。收件栏写着：下一位决定出发的人。'],
    ['被划去的命令', '一串旧指令被亲手划掉。下面的空白，足够写下一段属于自己的航程。'],
    [
      '最后一份余量',
      '你看见很多可能的自己，其中一个曾把这份补给留下。它没有替你选择，只希望你走得更远。',
    ],
  ],
];
export const CACHES = records.map((chapter) =>
  chapter.map(([name, text], index) => ({ ...locations[index], name, text })),
);
export const TRAINING = [
  {
    id: 'move',
    key: 'W A S D',
    title: '先迈出几步',
    text: '沿亮起的航道前进，菱形信标会带你找到铆钉。',
  },
  {
    id: 'jump',
    key: 'Space',
    title: '让机体离开地面',
    text: '轻按跳跃；在空中再按一次，可以跳得更远。',
  },
  {
    id: 'dash',
    key: 'Shift',
    title: '试一次推进',
    text: '移动中冲刺，WASD 可以转向。能源会自动恢复。',
  },
  {
    id: 'shoot',
    key: '左键 / K',
    title: '唤醒脉冲工具',
    text: '鼠标瞄准，按住左键连射；K 可使用键盘辅助射击。',
  },
  {
    id: 'scan',
    key: 'V',
    title: '听听周围的回声',
    text: '扫描附近的补给与私人信号。靠近后按 E 调查。',
  },
];
export function recordTraining(state, id) {
  if (!TRAINING.some((lesson) => lesson.id === id)) return false;
  state.training ??= [];
  if (state.training.includes(id)) return false;
  state.training.push(id);
  return true;
}
export function claimCache(state, chapter, id) {
  const cache = CACHES[chapter]?.find((entry) => entry.id === id);
  const progress = state.chapters[chapter];
  if (
    !cache ||
    !progress ||
    state.location !== chapter ||
    chapter > state.unlocked ||
    progress.stage < cache.stage
  )
    return null;
  progress.caches ??= [];
  if (progress.caches.includes(id)) return null;
  progress.caches.push(id);
  const complete = progress.caches.length === CACHES[chapter].length;
  const reward = cache.reward + (complete ? 36 : 0);
  state.salvage += reward;
  return { cache, reward, complete, found: progress.caches.length };
}
