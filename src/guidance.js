import { MODULES } from './data.js';
import { ATTACKS } from './encounters.js';

export const ABILITY_INFO = {
  anchor: { effect: '牵引敌人 · 打断蓄能 · 打开护板', range: 23, preview: '23 m 牵引范围' },
  bloom: { effect: '修复自身 · 瘫痪附近敌人', range: 17, preview: '17 m 瘫痪范围 · 同时修复自身' },
  time: {
    effect: '敌人与弹丸减速 · 持续 6 秒',
    range: 24,
    preview: '全场减速 · 24 m 内打开守卫护板',
  },
  phase: {
    effect: '向朝向折跃 · 落点冲击 · 短暂无敌',
    range: 12,
    preview: '沿朝向最多折跃 13 m · 落点冲击 12 m',
  },
};
export const atGate = (g) =>
  !!g.chapter && g.cs.stage === 3 && Math.hypot(g.player.position.x, g.player.position.z + 62) < 15;

// Shared by the F-key action and HUD so "ready" always means castable.
export function abilityState(g) {
  const id = g.state.activeModule,
    module = MODULES[id];
  if (!module || !g.state.modules.includes(id))
    return {
      ready: false,
      reason: 'missing',
      text: '尚未取得模块',
      help: '前往维护舱取得身体模块',
    };
  if (atGate(g) && id !== g.chapter.module)
    return {
      ready: false,
      reason: 'wrong',
      text: '需要' + g.chapter.moduleName,
      help: `按 ${MODULES[g.chapter.module].key} 切换，再按 F 连接通路`,
    };
  if (g.cooldowns.ability > 0)
    return {
      ready: false,
      reason: 'cooldown',
      text: `冷却 ${g.cooldowns.ability.toFixed(1)}s`,
      help: '所有模块共享冷却 · 可继续移动与射击',
    };
  if (g.energy < 30)
    return {
      ready: false,
      reason: 'energy',
      text: `能源不足 · 还差 ${Math.ceil(30 - g.energy)}`,
      help: '需要 30 能源 · 暂停冲刺以恢复',
    };
  return {
    ready: true,
    reason: 'ready',
    text: atGate(g) ? '连接通路' : '可以释放',
    help: ABILITY_INFO[id].effect,
  };
}

export function taskGuidance(g) {
  const objective = g.objective(),
    stage = g.cs?.stage;
  if (!g.chapter)
    return {
      ...objective,
      detail: '前往导航台按 E 选择坐标 · C 打开身体改造',
      progress: '飞船整备',
      key: 'E',
      action: '导航台启航',
    };
  if (stage === 1 || stage === 2) {
    const prefix = stage === 1 ? 'relay' : 'module';
    const remaining = g.actors.filter((e) => e.hp > 0 && e.id.startsWith(prefix));
    if (remaining.length) {
      const enemy =
        remaining.find((e) => e.type === 'beacon') ||
        remaining.reduce((a, b) =>
          a.mesh.position.distanceTo(g.player.position) <
          b.mesh.position.distanceTo(g.player.position)
            ? a
            : b,
        );
      const beacon = enemy.type === 'beacon';
      return {
        ...objective,
        target: enemy.mesh.position,
        name: beacon ? '优先拆除护盾信标' : '剩余巡逻机',
        detail: beacon ? '先拆护盾信标，解除其他敌人的保护' : '解除剩余巡逻机，再靠近设备操作',
        progress: `已清理 ${3 - remaining.length} / 3`,
        key: '左键 / K',
        action: '射击 · L 锁定目标',
      };
    }
    return {
      ...objective,
      detail: stage === 1 ? '干扰已解除 · 靠近中继按 E 修复' : '维护舱已解锁 · 靠近按 E 取得模块',
      progress: '巡逻机已清理',
      key: 'E',
      action: stage === 1 ? '修复中继' : '取得身体模块',
    };
  }
  if (stage === 3) {
    const selected = g.state.activeModule === g.chapter.module;
    const status = abilityState(g);
    return {
      ...objective,
      detail: !selected
        ? `按 ${MODULES[g.chapter.module].key} 选择${g.chapter.moduleName}`
        : !atGate(g)
          ? '靠近通路锚点 · 进入 15 m 连接范围'
          : status.ready
            ? '连接范围内 · 按 F 开启通路'
            : status.help,
      progress: atGate(g) ? '已进入连接范围' : '前往通路锚点',
      key: selected ? 'F' : MODULES[g.chapter.module].key,
      action: selected
        ? atGate(g)
          ? status.text
          : '靠近后连接通路'
        : '切换' + g.chapter.moduleName,
    };
  }
  if (stage === 4) {
    const boss = g.actors.find((e) => e.boss && e.hp > 0);
    return {
      ...objective,
      detail: ATTACKS[g.chapter.id][1],
      progress:
        boss?.exposed > 0
          ? `护板开启 · ${Math.ceil(boss.exposed)}s 输出窗口`
          : '护板闭合 · 主动技能可创造输出窗口',
      key: 'F',
      action: abilityState(g).ready ? '释放身体模块' : abilityState(g).text,
    };
  }
  return {
    ...objective,
    detail:
      stage === 0
        ? '沿菱形信标寻找当地信号 · 靠近后按 E 交谈'
        : stage === 5
          ? '攻击系统已解除 · 前往观察系统按 E 接通'
          : '本章探索完成 · 返回飞船按 E 归航',
    progress: `航程节点 ${stage + 1} / 7`,
    key: 'E',
    action: stage === 0 ? '交谈' : stage === 5 ? '接通观察系统' : '返回飞船',
  };
}

export function interactionHint(g, marker) {
  if (marker.id === 'gate' && g.cs?.stage === 3) {
    const status = abilityState(g),
      wrong = g.state.activeModule !== g.chapter.module;
    return {
      key: wrong ? MODULES[g.chapter.module].key : 'F',
      text: wrong
        ? '切换' + g.chapter.moduleName + '，再按 F 连接'
        : status.ready
          ? '连接' + marker.label
          : status.text,
      blocked: !status.ready,
    };
  }
  if (
    ['relay', 'module'].includes(marker.id) &&
    g.actors.some((e) => e.hp > 0 && e.id.startsWith(marker.id))
  )
    return { key: '左键', text: '设备被封锁 · 先清理巡逻机与护盾信标', blocked: true };
  return { key: 'E', text: marker.label, blocked: false };
}
