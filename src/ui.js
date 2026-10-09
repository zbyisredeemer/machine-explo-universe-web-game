import * as T from 'three';
import { CHAPTERS, MODULES, EQUIPMENT, CONTROLS, STAGES } from './data.js';
import { equip, SETTINGS_KEY } from './state.js';
import { storage } from './storage.js';
import { SIDE_STORIES } from './exploration.js';
import { ATTACKS } from './encounters.js';
import { projectedMarker } from './mechanics.js';
import { taskGuidance, interactionHint } from './guidance.js';
import { applyTheme } from './theme.js';
import { CACHES } from './expedition.js';

const icon = (name) =>
  ({ arrow: '↗', close: '×', play: '▷', pause: 'Ⅱ', diamond: '◇', wrench: '⌁', star: '✦' })[name] ||
  name;
const el = (id) => document.getElementById(id);
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch],
  );
export class UI {
  constructor(game, hasSave) {
    this.game = game;
    this.hasSave = hasSave;
    this.modal = null;
    this.dialog = null;
    this.frameCount = 0;
    this.lastHud = 0;
    this.root = el('ui');
    this.build();
    this.bind();
    applyTheme(game.chapter?.id ?? game.state.unlocked);
  }
  build() {
    this.root.innerHTML = `
      <div class="vignette"></div><div class="grain"></div>
      <main id="menu" class="menu">
        <header class="menu-top"><span class="wordmark"><span class="orbit-icon">✳</span> WITNESS ARCHIVE <span class="line"></span> 见证者计划</span><button class="text-button" data-action="settings">设置 <span>↗</span></button></header>
        <section class="hero-copy"><div class="eyebrow"><span class="status-dot"></span> SIGNAL FOUND · 信号已接通</div><div class="mission-edition">一段属于你的星际旅程 <span>01—04</span></div><p class="english-title">ALIEN<br>BODY<span class="period">.</span></p><h1>异星之躯</h1><p class="hero-description">把陌生的文明，变成身体的一部分。<br>在群星之间，找到自己想去的地方。</p>
          <div class="menu-actions"><button class="primary" data-action="${this.hasSave ? 'continue' : 'new'}"><span>${this.hasSave ? '继续旅程' : '开始旅程'}</span><span>↗</span></button>${this.hasSave ? '<button class="text-button" data-action="confirm-new">新的旅程</button>' : '<span class="launch-note">单人冒险 / 本地存档</span>'}</div>
          <button class="understated" data-action="controls">操作指南 <span>⌨</span></button>
        </section>
        <aside class="menu-aside"><span class="tiny-label">THE JOURNEY</span>${CHAPTERS.map((c, i) => `<div class="journey-row ${i === 0 ? 'active' : ''}" style="--journey-tone:${c.color}"><span class="journey-num">0${i + 1}</span><div><span>${c.name}</span><small>${c.en}</small></div><span class="journey-symbol">${i === 0 ? '◉' : '·'}</span></div>`).join('')}<p>四段文明 · 一个逐渐醒来的自我</p></aside>
        <footer class="menu-footer"><span>ORIGIN UNKNOWN <span class="slash">/</span> PURPOSE UNWRITTEN</span><span class="footer-coord">SECTOR 07—31 <span class="status-dot"></span> SYSTEM ONLINE</span></footer>
      </main>
      <div id="hud" class="hidden">
        <header class="hud-top"><div class="chapter-label"><span id="chapter-number">01</span><div><small id="chapter-en">THE SLEEPING ARK</small><strong id="chapter-name">巨舰墓场</strong></div></div><div class="compass"><span>W</span><i></i><i></i><span id="compass-heading">N</span><i></i><i></i><span>E</span><small id="coordinates">00.0 / 00.0</small></div><div class="hud-actions"><button data-action="journal" aria-label="日志与星图">◇ <span>日志</span> <kbd>Tab</kbd></button><button data-action="pause" aria-label="暂停游戏">Ⅱ</button></div></header>
        <section class="mission"><div class="tiny-label"><span class="status-dot"></span> 当前目标</div><p id="objective"></p><span id="objective-detail"></span></section>
        <div class="radar-wrap"><canvas id="radar" width="160" height="170" aria-label="局部地图"></canvas><span>LOCAL SCAN <i id="scan-distance"></i></span></div>
        <div id="enemy-labels"></div><div id="waypoint" class="waypoint"><span>◇</span><small></small></div>
        <div id="reticle" class="reticle"><i></i><i></i><i></i><i></i></div><div id="hitmarker"></div>
        <div id="boss-hud" class="boss-hud hidden"><div><span id="boss-name"></span><small id="boss-state"></small></div><div class="boss-track"><i id="boss-health"></i></div></div>
        <div id="interaction" class="interaction hidden"><kbd>E</kbd><span></span></div>
        <section class="vitals"><div class="unit-label"><span class="robot-glyph">▣</span><span>见证者 <small>UNIT / 07</small></span><span id="health-number">100</span></div><div class="health-track"><i id="health-fill"></i></div><div class="energy-track"><i id="energy-fill"></i></div><div class="vital-footer"><span><kbd>G</kbd> 修复包 <b id="heal-count">3</b></span><span>零件 <b id="salvage">0</b></span></div></section>
        <nav id="modules" class="modules" aria-label="身体模块"></nav>
        <div class="quick-controls"><span>鼠标瞄准 · 左键连射 <kbd>J</kbd> 近战</span><span><kbd>Space</kbd> 二段跳 <kbd>Shift</kbd> 转向冲刺</span><span><kbd>L</kbd> 锁定 · 右键拖动视角 · <kbd>E</kbd> 互动</span></div>
        <div id="save-indicator">◇ 已保存</div>
      </div>
      <div id="chapter-card" class="chapter-card hidden"></div><div id="toast-stack" aria-live="polite"></div><div id="damage-flash"></div>
      <div id="dialog" class="dialog hidden" role="dialog" aria-label="角色对话"></div><div id="modal-root"></div>
      <div id="storage-warning" class="storage-warning hidden" role="status"><span>进度尚未写入浏览器。离开前请导出存档。</span><button class="secondary" data-backup="export">导出存档 ↓</button></div>
      <div id="loading" class="hidden"><span class="status-dot"></span> 正在连接坐标</div>
    `;
    this.radar = el('radar').getContext('2d');
    this.hudVisible = false;
  }
  bind() {
    this.game.on('loaded', () => {
      clearTimeout(this.chapterTimer);
      el('chapter-card').classList.add('hidden');
      applyTheme(this.game.chapter?.id ?? this.game.state.unlocked);
    });
    this.root.addEventListener('click', (event) => {
      const target = event.target.closest('[data-action]');
      if (!target || target.disabled) return;
      this.action(target.dataset.action, target);
    });
    this.root.addEventListener('change', (event) => {
      const key = event.target.dataset.setting;
      if (!key) return;
      const value =
        event.target.type === 'checkbox'
          ? event.target.checked
          : event.target.type === 'range'
            ? Number(event.target.value)
            : event.target.value;
      this.game.settings[key] = value;
      this.game.sound.volume();
      if (key === 'quality') this.game.world.quality();
      try {
        storage.setItem(SETTINGS_KEY, JSON.stringify(this.game.settings));
      } catch {
        this.toast('设置暂未保存', '当前会话仍会采用这些设置');
      }
    });
    this.game.on('started', () => {
      this.close(false);
      el('menu').classList.add('hidden');
      el('hud').classList.remove('hidden');
      this.hudVisible = true;
      this.hasSave = true;
      this.refresh();
    });
    this.game.on('loaded', () => this.refresh());
    this.game.on('frame', () => this.frame());
    this.game.on('toast', (data) => this.toast(data.title, data.body));
    this.game.on('saved', () => {
      el('storage-warning').classList.add('hidden');
      this.warnedStorage = false;
      el('save-indicator').classList.add('show');
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => el('save-indicator').classList.remove('show'), 1700);
    });
    this.game.on('storage-error', () => {
      el('storage-warning').classList.remove('hidden');
      el('save-indicator').classList.remove('show');
      if (!this.warnedStorage) {
        this.warnedStorage = true;
        this.toast('浏览器无法保存进度', '请允许本地存储；当前游戏仍可继续');
      }
    });
    this.game.on('chapter', (chapter) => {
      if (this.game.cs?.stage > 0) return;
      const card = el('chapter-card');
      card.innerHTML = `<small>CHAPTER ${chapter.roman} / ${chapter.en}</small><h2>${chapter.name}</h2><p>${chapter.subtitle}</p>`;
      card.classList.remove('hidden');
      clearTimeout(this.chapterTimer);
      this.chapterTimer = setTimeout(() => card.classList.add('hidden'), 4300);
    });
    this.game.on('objective', () => this.refresh());
    this.game.on('pause', () => this.pause());
    this.game.on('escape', () => {
      if (this.dialog || ['dead', 'ending'].includes(this.game.mode)) return;
      if (this.modal) this.close();
      else if (this.game.playing) this.pause();
    });
    this.game.on('dialog', (data) => {
      this.close(false);
      this.dialog = { ...data, index: 0 };
      this.renderDialog();
    });
    this.game.on('dialog-next', () => this.nextDialog());
    this.game.on('journal', () => this.journal());
    this.game.on('starmap', () => this.starmap());
    this.game.on('workshop', () => this.workshop());
    this.game.on('module', ({ id }) => this.moduleFound(id));
    this.game.on('dead', () =>
      this.showModal(
        'dead',
        '机体暂时离线',
        `<p class="modal-intro">记忆仍然完整。你可以从最近的任务节点重新启动。</p><div class="death-icon">⊘</div><p class="muted">已取得的部件和记录不会丢失。</p><button class="primary wide" data-action="retry">重新启动 <span>↗</span></button>`,
        false,
      ),
    );
    this.game.on('invite', () =>
      this.showModal(
        'invite',
        '带一位朋友出发',
        `<p class="modal-intro">铆钉站在登船坡道旁，手里攥着它的工具。</p><blockquote>“我可以负责修船。你负责带我们去下一颗星星。”</blockquote><button class="primary wide" data-action="invite-yes">给铆钉留一个位置 <span>↗</span></button><button class="secondary wide" data-action="invite-no">让它暂时照看巨舰</button>`,
        false,
      ),
    );
    this.game.on('ending-choice', () => this.endingChoice());
    this.game.on('ending', ({ ending }) => this.ending(ending));
    this.game.on('discovery', (chapter) => this.toast('文明档案已更新', chapter.discoveryTitle));
    this.game.on('hurt', () => {
      el('damage-flash').classList.remove('flash');
      void el('damage-flash').offsetWidth;
      el('damage-flash').classList.add('flash');
    });
    this.game.on('hit', ({ shield }) => {
      el('hitmarker').className = shield ? 'shield active' : 'active';
      clearTimeout(this.hitTimer);
      this.hitTimer = setTimeout(() => {
        el('hitmarker').className = '';
      }, 130);
    });
  }
  action(action, target) {
    if (action === 'new') {
      this.game.start(true);
      this.controls(true);
    } else if (action === 'continue') this.game.start(false);
    else if (action === 'confirm-new')
      this.showModal(
        'confirm',
        '开始新的旅程？',
        '<p class="modal-intro">这会替换此浏览器中的现有存档。</p><button class="primary wide" data-action="new">开始新的旅程</button><button class="secondary wide" data-action="close">保留当前旅程</button>',
      );
    else if (action === 'close' || action === 'resume') this.close();
    else if (action === 'pause') this.pause();
    else if (action === 'settings') this.settings();
    else if (action === 'controls') this.controls();
    else if (action === 'about') this.about();
    else if (action === 'journal') this.journal();
    else if (action === 'starmap') this.starmap();
    else if (action === 'workshop') this.workshop();
    else if (action === 'dialog-next') this.nextDialog();
    else if (action === 'retry') this.game.retry();
    else if (action === 'menu') {
      this.game.save();
      this.close(false);
      this.game.mode = 'menu';
      this.game.keys.clear();
      el('menu').classList.remove('hidden');
      el('hud').classList.add('hidden');
      this.hudVisible = false;
      document.querySelector('.menu-actions').innerHTML =
        '<button class="primary" data-action="continue"><span>继续旅程</span><span>↗</span></button><button class="text-button" data-action="confirm-new">新的旅程</button>';
    } else if (action === 'hub') this.game.toHub();
    else if (action === 'invite-yes') {
      this.game.state.companion = true;
      this.game.toHub();
    } else if (action === 'invite-no') this.game.toHub();
    else if (action.startsWith('travel-')) this.game.travel(Number(action.split('-')[1]));
    else if (action.startsWith('equip-')) {
      const [, slot, id] = action.split('-');
      if (equip(this.game.state, slot, id)) {
        if (slot === 'skin') this.game.changeSkin(id);
        else {
          this.game.load('hub');
          this.game.mode = 'paused';
          this.game.save();
        }
        this.game.sound.play('interact');
        this.workshop();
      } else this.toast('暂时无法装配', '检查零件数量和文明解锁条件');
    } else if (action.startsWith('module-')) this.game.selectModule(action.slice(7));
    else if (action === 'ending-share') this.game.finish('share');
    else if (action === 'ending-journey') this.game.finish('journey');
    else if (action === 'fullscreen')
      document.fullscreenElement
        ? document.exitFullscreen?.()
        : document.documentElement
            .requestFullscreen?.()
            .catch(() => this.toast('当前窗口不支持全屏'));
  }
  showModal(type, title, content, closable = true, wide = false) {
    if (!this.modal) {
      this.previousMode = this.game.mode;
      this.previousFocus = document.activeElement;
    }
    this.modal = type;
    this.game.keys.clear();
    if (!['dead', 'ending', 'menu'].includes(this.game.mode)) this.game.mode = 'paused';
    el('modal-root').innerHTML =
      `<div class="modal-scrim"><section class="modal ${wide ? 'wide-modal' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header><div><span class="tiny-label">WITNESS / PERSONAL ARCHIVE</span><h2 id="modal-title">${title}</h2></div>${closable ? '<button class="close-button" data-action="close" aria-label="关闭">×</button>' : ''}</header>${content}</section></div>`;
    el('modal-root').querySelector('button:not([disabled])')?.focus({ preventScroll: true });
  }
  close(resume = true) {
    if (resume && ['dead', 'ending', 'invite', 'graphics', 'failure'].includes(this.modal)) return;
    el('modal-root').innerHTML = '';
    this.modal = null;
    for (const id of ['menu', 'hud']) el(id).inert = false;
    if (resume && this.previousFocus?.isConnected)
      this.previousFocus.focus({ preventScroll: true });
    if (resume && this.game.mode === 'paused')
      this.game.mode = this.previousMode === 'menu' ? 'menu' : 'playing';
    this.game.keys.clear();
  }
  pause() {
    if (this.dialog || !['playing', 'paused'].includes(this.game.mode)) return;
    this.game.save();
    this.showModal(
      'pause',
      '在星光里停一会儿',
      `<p class="modal-intro">${this.game.lastSaveSucceeded ? '旅程已经保存。这里的时间，会等你回来。' : '进度尚未保存到浏览器。请从设置导出存档，再离开游戏。'}</p><div class="pause-menu"><button class="primary wide" data-action="resume">继续旅程 <span>↗</span></button><button class="secondary" data-action="settings">设置</button><button class="secondary" data-action="controls">操作指南</button><button class="secondary" data-action="journal">文明档案</button><button class="secondary" data-action="menu">返回标题</button></div>`,
    );
  }
  controls(welcome = false) {
    const controls = `<div class="controls-grid">${CONTROLS.map(([key, desc]) => `<div><kbd>${key}</kbd><span>${desc}</span></div>`).join('')}</div>`;
    const introduction = `<p class="modal-intro">你在一艘沉睡的巨舰上醒来。前方的维修机器人正等着一个回应。先走近它，剩下的边走边学。</p><div class="welcome-steps">
      <section class="welcome-step"><small>01 / 出发</small><kbd>W A S D</kbd><h3>跟随信号</h3><p>沿航道前进。鼠标右键拖动，看看四周。</p></section>
      <section class="welcome-step"><small>02 / 连接</small><kbd>E</kbd><h3>回应这个世界</h3><p>靠近机器人或亮起的装置，按 E 交谈、调查。</p></section>
      <section class="welcome-step"><small>03 / 探索</small><kbd>V</kbd><h3>别错过路边</h3><p>扫描寻找补给与故事。Space 跳跃，Shift 冲刺。</p></section>
    </div><details class="full-controls"><summary>查看完整按键与战斗操作</summary>${controls}</details>`;
    this.showModal(
      'controls',
      welcome ? '让身体醒过来' : '操作指南',
      `${welcome ? introduction : `<p class="modal-intro">鼠标瞄准、左键连射；K 为键盘辅助射击。观察地面预警，跳跃与冲刺避开攻击。按住 X 预览模块，F 释放。V 扫描路边补给和私人信号。</p>${controls}`}<p class="muted">任务节点自动保存 · Esc 随时暂停 · 设置中可调整难度、音量和动态效果</p><button class="primary wide" data-action="close">${welcome ? '启动身体' : '返回'} <span>↗</span></button>`,
      true,
      true,
    );
  }
  settings() {
    const s = this.game.settings;
    this.showModal(
      'settings',
      '调整你的旅程',
      `<div class="settings-list">
      <label><span>难度<small>故事模式降低受到的伤害</small></span><select data-setting="difficulty"><option value="standard" ${s.difficulty === 'standard' ? 'selected' : ''}>标准探索</option><option value="story" ${s.difficulty === 'story' ? 'selected' : ''}>故事旅行</option></select></label>
      <label><span>声音<small>环境音与战斗反馈</small></span><input aria-label="音量" type="range" min="0" max="100" value="${s.volume}" data-setting="volume"></label>
      <label><span>环境与音乐<small>四章不同的环境和声与探索旋律</small></span><input aria-label="音乐音量" type="range" min="0" max="100" value="${s.musicVolume ?? 35}" data-setting="musicVolume"></label>
      <label><span>动作音效<small>射击、脚步、回收与互动</small></span><input aria-label="音效音量" type="range" min="0" max="100" value="${s.effectsVolume ?? 80}" data-setting="effectsVolume"></label>
      <label><span>视角灵敏度</span><input aria-label="视角灵敏度" type="range" min="0.4" max="2" step="0.1" value="${s.sensitivity}" data-setting="sensitivity"></label>
      <label><span>画面质量<small>低配置可关闭实时阴影</small></span><select data-setting="quality"><option value="high" ${s.quality === 'high' ? 'selected' : ''}>精细</option><option value="low" ${s.quality === 'low' ? 'selected' : ''}>流畅</option></select></label>
      <label><span>镜头震动</span><input type="checkbox" data-setting="shake" ${s.shake ? 'checked' : ''}></label>
      <label><span>辅助瞄准（鼠标小范围 / 键盘扩展）</span><input type="checkbox" data-setting="aimAssist" ${s.aimAssist ? 'checked' : ''}></label>
      <label><span>减少动态效果<small>关闭冲刺视野变化、拖尾和短暂命中停顿</small></span><input type="checkbox" data-setting="reducedMotion" ${s.reducedMotion ? 'checked' : ''}></label>
      <label><span>显示伤害数字</span><input type="checkbox" data-setting="damageNumbers" ${s.damageNumbers !== false ? 'checked' : ''}></label>
      </div><button class="secondary wide" data-action="about">版本、隐私与支持</button><button class="secondary wide" data-action="fullscreen">切换全屏 ↗</button><button class="primary wide" data-action="close">完成</button>`,
    );
  }
  about() {
    this.showModal(
      'about',
      '版本、隐私与支持',
      `<p class="modal-intro">异星之躯 · ALIEN BODY<br>版本 ${__APP_VERSION__} · 独立单人游戏</p><p class="modal-intro">无需账户，没有广告、分析追踪或存档上传。进度与设置保存在当前浏览器；切换浏览器、站点地址或清除站点数据前，请导出备份。</p><p class="modal-intro">项目采用 MIT 许可证，包含 Three.js（MIT）。完整许可随发行包提供。需要桌面键盘、鼠标及 WebGL 2。</p><p class="muted">报告问题时请提供复现步骤。诊断文件只包含版本、运行模式、画质和存储状态，不包含存档、网址、用户名或设备标识，不会自动发送。</p><button class="secondary wide" data-backup="diagnostics">导出诊断信息 ↓</button><button class="primary wide" data-action="close">返回旅程</button>`,
    );
  }
  moduleFound(id) {
    const module = MODULES[id];
    this.refresh();
    this.showModal(
      'module',
      '一种新的可能',
      `<div class="module-discovery" style="--module-color:${module.color}"><div class="module-orbit">◇</div><span class="tiny-label">BODY EXPANSION / ${module.tag}</span><h3>${module.name}</h3><p>${module.desc}</p><div><kbd>${module.key}</kbd> 选择模块 <span>→</span> <kbd>F</kbd> 使用</div></div><button class="primary wide" data-action="close">让它成为身体的一部分 <span>↗</span></button>`,
    );
  }
  renderDialog() {
    const [speaker, text] = this.dialog.lines[this.dialog.index];
    el('dialog').classList.remove('hidden');
    el('dialog').innerHTML =
      `<div class="speaker-glyph">${speaker === '你' ? '▣' : speaker === '铆钉' ? '⌁' : '✳'}</div><div class="dialog-copy"><div class="dialog-speaker">${escape(speaker)}<span>${String(this.dialog.index + 1).padStart(2, '0')} / ${String(this.dialog.lines.length).padStart(2, '0')}</span></div><p>${escape(text)}</p></div><button data-action="dialog-next" aria-label="继续对话"><span>${this.dialog.index === this.dialog.lines.length - 1 ? '收起' : '继续'}</span><kbd>Enter</kbd> →</button>`;
  }
  nextDialog() {
    if (!this.dialog) return;
    if (++this.dialog.index < this.dialog.lines.length) this.renderDialog();
    else {
      const done = this.dialog.onDone;
      this.dialog = null;
      el('dialog').classList.add('hidden');
      done?.();
      this.refresh();
    }
  }
  starmap() {
    const state = this.game.state,
      inHub = state.location === 'hub';
    this.showModal(
      'starmap',
      '群星之间，下一站',
      `<p class="modal-intro">${inHub ? '选择一个坐标启航。旧日的世界仍在那里，等待你带着新的目光回来。' : '抵达归航信标后可返回飞船，再从导航台选择目的地。'}</p><div class="chapter-grid">${CHAPTERS.map(
        (c, i) => {
          const locked = i > state.unlocked,
            cs = state.chapters[i];
          return `<button class="chapter-tile ${locked ? 'locked' : ''}" style="--chapter-color:${c.color}" data-action="travel-${i}" ${locked || !inHub ? 'disabled' : ''}><div class="chapter-art art-${i}"><span>${c.roman}</span><i></i><b></b></div><div class="chapter-tile-copy"><small>0${i + 1} / ${locked ? '坐标未知' : cs.completed ? '可重访' : '待探索'}</small><h3>${c.name}</h3><p>${c.subtitle}</p><span>${locked ? '完成前一章后解锁' : cs.completed ? '再次启航 ↗' : '追寻信号 ↗'}</span></div></button>`;
        },
      ).join('')}</div>`,
      true,
      true,
    );
  }
  journal() {
    const s = this.game.state;
    this.showModal(
      'journal',
      '我记得的宇宙',
      `<div class="journal-stats"><span><b>${s.chapters.filter((c) => c.completed).length}/4</b> 文明</span><span><b>${s.modules.length}</b> 身体模块</span><span><b>${Math.floor(s.playTime / 60)}</b> 分钟旅程</span><button class="secondary" data-action="starmap">打开星图 ↗</button></div><div class="journal-entries">${CHAPTERS.map(
        (c, i) => {
          const cs = s.chapters[i];
          return `<article><span class="entry-number">0${i + 1}</span><div><h3>${c.name}<small>${i > s.unlocked ? '尚未抵达' : cs.completed ? '已建立联系' : STAGES[cs.stage]}</small></h3><p>${cs.completed ? c.discoveryTitle + '。' + c.subtitle : i <= s.unlocked ? c.intro[1] : '星图中的信号尚不完整。'}</p>${cs.helped ? `<blockquote><strong>${SIDE_STORIES[i].name}</strong>${SIDE_STORIES[i].after}</blockquote>` : '<small class="unread-record">◇ 一段等待回应的私人信号</small>'}${cs.memory ? `<blockquote><strong>${c.memory[0]}</strong>${c.memory[1]}</blockquote>` : '<small class="unread-record">◇ 一份尚未找到的记忆</small>'}${cs.secret ? `<blockquote><strong>${c.secret[0]}</strong>${c.secret[1]}</blockquote>` : '<small class="unread-record">◇ 一段无法辨认的隐藏信号</small>'}<details class="cache-records"><summary>旅途补给 ${cs.caches?.length || 0} / 3 · 集齐额外获得 36 零件</summary>${
            CACHES[i]
              .filter((cache) => cs.caches?.includes(cache.id))
              .map((cache) => `<h4>${cache.name}</h4><p>${cache.text}</p>`)
              .join('') || '<p>用 V 扫描，在主路之外寻找留下来的故事。</p>'
          }</details></div></article>`;
        },
      ).join('')}</div>`,
      true,
      true,
    );
  }
  workshop() {
    if (this.game.state.location !== 'hub') return;
    const s = this.game.state;
    this.showModal(
      'workshop',
      '重新认识这副身体',
      `<div class="workshop-intro"><p>每件部件，都有一段来历。</p><span>可用零件 <b>${s.salvage}</b></span></div>${Object.entries(
        EQUIPMENT,
      )
        .map(
          ([slot, items]) =>
            `<section class="equipment-section"><h3>${{ chassis: '移动骨架', weapon: '远程组件', skin: '外壳记忆' }[slot]}</h3><div class="equipment-grid">${items
              .map((item) => {
                const owned = s.owned.includes(item.id),
                  equipped = s.equipment[slot] === item.id,
                  locked = item.chapter !== undefined && !s.chapters[item.chapter].completed;
                return `<button data-action="equip-${slot}-${item.id}" class="equipment ${equipped ? 'equipped' : ''}" ${locked || (!owned && s.salvage < item.cost) ? 'disabled' : ''}><span class="equip-icon" style="color:${item.color || '#b6ded4'}">${slot === 'skin' ? '◧' : slot === 'weapon' ? '⌁' : '♧'}</span><strong>${item.name}</strong><small>${item.desc}</small><span class="equip-price">${equipped ? '✓ 已装配' : locked ? '完成 ' + CHAPTERS[item.chapter].name + ' 后解锁' : owned ? '装配 ↗' : item.cost + ' 零件 · 制作'}</span></button>`;
              })
              .join('')}</div></section>`,
        )
        .join('')}`,
      true,
      true,
    );
  }
  endingChoice() {
    this.showModal(
      'ending',
      '现在，你可以自己选择',
      `<p class="modal-intro">你走过的文明、认识的朋友、身体上的每道痕迹，都将继续属于你。</p><div class="ending-options"><button data-action="ending-share"><span>01 / 让记忆成为星光</span><h3>点亮见证者网络</h3><p>分享旅途中获得的理解，让沉睡的机器人也有机会醒来。你保留自己的记忆，与铆钉继续旅行。</p><b>把看见的世界，交给更多人 ↗</b></button><button data-action="ending-journey"><span>02 / 向没有名字的地方</span><h3>留下一个自由的坐标</h3><p>让网络尊重每个见证者的选择。带着完整的记忆启航，下一站由你决定。</p><b>从此，旅程属于自己 ↗</b></button></div>`,
      false,
      true,
    );
  }
  ending(ending) {
    this.showModal(
      'ending',
      ending === 'share' ? '群星，开始彼此听见' : '我想去的地方',
      `<div class="ending-visual">✳</div><p class="ending-text">${ending === 'share' ? '一个又一个遥远的信号亮起。它们第一次谈论任务之外的东西：花园、朋友，还有一颗没有见过的星星。' : '星图边缘亮起了一个新的坐标。那里没有预设任务。你看向窗外，第一次主动调整了航向。'}</p><blockquote>“飞船准备好了。”${this.game.state.companion ? '铆钉说。' : '导航灯轻轻亮起。'}<br>“这次，我们想去哪儿？”</blockquote><div class="credits">异星之躯 · ALIEN BODY<br><small>感谢你，让一个机器人拥有了自己的旅程。</small></div><button class="primary wide" data-action="hub">回到飞船，继续探索 <span>↗</span></button><p class="muted centered">折跃感知可以解读旧章节中的隐藏信号。</p>`,
      false,
    );
  }
  toast(title, body) {
    const node = document.createElement('div');
    node.className = 'toast';
    node.innerHTML = `<span>◇</span><div><strong>${escape(title)}</strong>${body ? `<p>${escape(body)}</p>` : ''}</div>`;
    el('toast-stack').appendChild(node);
    while (el('toast-stack').children.length > 3) el('toast-stack').firstChild.remove();
    setTimeout(() => node.remove(), 4200);
  }
  refresh() {
    if (!el('chapter-name')) return;
    const g = this.game,
      c = g.chapter;
    el('chapter-name').textContent = c ? c.name : '漂泊者号';
    el('chapter-en').textContent = c ? c.en : 'A PLACE TO COME HOME';
    el('chapter-number').textContent = c ? '0' + (c.id + 1) : '⌂';
    el('objective').textContent = g.objective().text;
    el('objective-detail').textContent = c
      ? g.cs.stage === 3
        ? `按 ${MODULES[c.module].key} 选择${c.moduleName} · 靠近锚点按 F`
        : g.cs.stage === 4
          ? ATTACKS[c.id][1]
          : g.cs.stage === 6
            ? '追随归航信标 · 靠近后按 E'
            : '追随菱形信标 · 靠近后按 E'
      : '导航台启航 · 工作台改造 · 和朋友聊聊';
    el('modules').innerHTML =
      Object.entries(MODULES)
        .map(
          ([id, m]) =>
            `<button data-action="module-${id}" style="--module-color:${m.color}" class="module-slot ${g.state.modules.includes(id) ? 'unlocked' : 'locked'} ${g.state.activeModule === id ? 'selected' : ''}" ${g.state.modules.includes(id) ? '' : 'disabled'}><kbd>${m.key}</kbd><span class="module-symbol">${{ anchor: '◎', bloom: '✳', time: '◷', phase: '◇' }[id]}</span><small>${g.state.modules.includes(id) ? m.name : '未知模块'}</small></button>`,
        )
        .join('') + '<span id="ability-ready" class="ability-ready"><kbd>F</kbd> 使用模块</span>';
  }
  frame() {
    if (!this.hudVisible || !this.game.player) return;
    if (++this.frameCount % 3) return;
    const g = this.game,
      p = g.player.position;
    el('health-number').textContent = Math.ceil(g.hp) + ' / ' + g.stats.chassis.hp;
    el('health-fill').style.width = (g.hp / g.stats.chassis.hp) * 100 + '%';
    el('energy-fill').style.width = g.energy + '%';
    el('heal-count').textContent = g.heals;
    el('salvage').textContent = g.state.salvage;
    el('coordinates').textContent = `${p.x.toFixed(1)} / ${(-p.z).toFixed(1)}`;
    const heading = ((((g.yaw * 180) / Math.PI) % 360) + 360) % 360;
    el('compass-heading').textContent = `${Math.round(heading)}°`;
    const nearby = g.nearby;
    el('interaction').classList.toggle('hidden', !nearby || !g.playing || !!g.arrival);
    if (nearby) {
      const hint = interactionHint(g, nearby);
      el('interaction').querySelector('kbd').textContent = hint.key;
      el('interaction').querySelector('span').textContent = hint.text;
      el('interaction').classList.toggle('blocked', hint.blocked);
    }
    const boss = g.actors.find((e) => e.boss && e.hp > 0 && e.active);
    el('boss-hud').classList.toggle('hidden', !boss);
    if (boss) {
      el('boss-name').textContent = g.chapter.boss;
      el('boss-state').textContent =
        boss.exposed > 0
          ? `护板开启 / ${Math.ceil(boss.exposed)}s`
          : boss.windup > 0
            ? (boss.attackName || '攻击蓄能') + ' · 准备闪避'
            : '护板闭合 · 使用模块创造窗口';
      el('boss-health').style.width = Math.max(0, (boss.hp / boss.maxHp) * 100) + '%';
    }
    const objective = taskGuidance(g);
    const distance = Math.hypot(objective.target.x - p.x, objective.target.z - p.z);
    el('objective').textContent = objective.text;
    el('objective-detail').textContent = objective.detail;
    const projected = new T.Vector3(objective.target.x, 4.8, objective.target.z).project(
      g.world.camera,
    );
    const waypoint = el('waypoint');
    waypoint.classList.toggle('hidden', distance < 6 || !g.playing);
    if (distance >= 6) {
      const marker = projectedMarker(projected, innerWidth, innerHeight);
      waypoint.style.left = marker.x + 'px';
      waypoint.style.top = marker.y + 'px';
      waypoint.querySelector('small').textContent =
        `${marker.behind ? '↶ 转身 · ' : ''}${objective.name} · ${Math.round(distance)} m`;
    }
    el('scan-distance').textContent = Math.round(distance) + 'm';
    const selected = g.state.activeModule;
    document
      .querySelectorAll('.module-slot')
      .forEach((button) =>
        button.classList.toggle('selected', button.dataset.action === 'module-' + selected),
      );
    el('ability-ready').innerHTML =
      `<kbd>F</kbd> ${g.cooldowns.ability > 0 ? Math.ceil(g.cooldowns.ability) + 's 冷却' : selected ? '使用 ' + MODULES[selected].name : '等待模块'}`;
    const labels = [];
    for (const e of g.actors) {
      if (e.hp <= 0 || e.boss || !e.active || horizontal(e.mesh.position, p) > 45) continue;
      const point = e.mesh.position
        .clone()
        .add(new T.Vector3(0, 3.5, 0))
        .project(g.world.camera);
      if (point.z > 1 || Math.abs(point.x) > 1 || Math.abs(point.y) > 1) continue;
      labels.push(
        `<div class="enemy-label" style="left:${((point.x + 1) * innerWidth) / 2}px;top:${((1 - point.y) * innerHeight) / 2}px"><span>${e.type === 'beacon' ? '护盾信标' : e.type === 'turret' ? '脉冲炮台' : '切割机'}</span><i><b style="width:${Math.max(0, e.hp / e.maxHp) * 100}%"></b></i>${e.windup > 0 ? '<small>蓄能 !</small>' : ''}</div>`,
      );
    }
    el('enemy-labels').innerHTML = labels.join('');
    this.drawRadar();
  }
  drawRadar() {
    const ctx = this.radar,
      g = this.game,
      p = g.player.position,
      scale = 1.4;
    ctx.clearRect(0, 0, 160, 170);
    ctx.fillStyle = 'rgba(8,24,29,.68)';
    ctx.fillRect(0, 0, 160, 170);
    ctx.strokeStyle = 'rgba(163,214,209,.12)';
    ctx.lineWidth = 1;
    for (let x = 0; x < 160; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 170);
      ctx.stroke();
    }
    for (let y = 0; y < 170; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(160, y);
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(80, 94);
    ctx.rotate(g.yaw);
    const point = (x, z) => [(x - p.x) * scale, (z - p.z) * scale];
    ctx.strokeStyle = '#526c70';
    ctx.strokeRect((-36 - p.x) * scale, (-162 - p.z) * scale, 72 * scale, 201 * scale);
    for (const m of g.world.markers) {
      if (!m.group.visible) continue;
      const [x, y] = point(m.x, m.z);
      ctx.fillStyle = m.id === 'tool' || m.id === 'ship' ? '#e2b280' : '#a4dfcd';
      ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
    }
    for (const e of g.actors)
      if (e.hp > 0 && horizontal(e.mesh.position, p) < 55) {
        const [x, y] = point(e.mesh.position.x, e.mesh.position.z);
        ctx.fillStyle = '#e78e73';
        ctx.beginPath();
        ctx.arc(x, y, e.boss ? 4 : 2, 0, Math.PI * 2);
        ctx.fill();
      }
    ctx.restore();
    ctx.fillStyle = '#edf4dc';
    ctx.beginPath();
    ctx.moveTo(80, 87);
    ctx.lineTo(75, 98);
    ctx.lineTo(80, 95);
    ctx.lineTo(85, 98);
    ctx.closePath();
    ctx.fill();
  }
}
function horizontal(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
