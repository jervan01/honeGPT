'use strict';
/* =====================================================================
   honeGPT — 轻量 OpenAI 兼容聊天客户端（无框架、无构建步骤）
   ===================================================================== */

/* ---------- 工具 ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o));

const I = {
  menu: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  send: '<svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  stop: '<svg viewBox="0 0 24 24" class="fill"><rect x="6" y="6" width="12" height="12" rx="2.5"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/></svg>',
  refresh: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4"/></svg>',
  bookmark: '<svg viewBox="0 0 24 24"><path d="M7 4h10a1 1 0 011 1v15l-6-4-6 4V5a1 1 0 011-1z"/></svg>',
  sliders: '<svg viewBox="0 0 24 24"><path d="M4 7h9M19 7h1M4 17h1M11 17h9"/><circle cx="16" cy="7" r="2.2"/><circle cx="8" cy="17" r="2.2"/></svg>',
  bot: '<svg viewBox="0 0 24 24"><rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 4v4M9 13v1M15 13v1"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/></svg>',
  chev: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>',
};

/* ---------- 存储 ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem('hone.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('hone.' + k, JSON.stringify(v)); return true; } catch (e) { toast('存储失败：' + e.message); return false; } },
};

const DEFAULT_SETTINGS = {
  baseUrl: 'https://api.openai.com/v1', apiKey: '',
  proxyOn: false, proxyPrefix: '',
  defaultModel: '', models: [],
  theme: 'dark', fontScale: 1,
  stream: true, autoMemory: false, sendOnEnter: false,
};
const DEFAULT_ASSISTANTS = [
  { id: 'default', name: '通用助手', emoji: '🍯', model: '', temperature: 0.7, useMemory: true, ctx: 20,
    prompt: '你是 honeGPT，一个乐于助人、回答准确简洁的 AI 助手。默认使用用户提问所用的语言回答。' },
  { id: 'coder', name: '编程助手', emoji: '💻', model: '', temperature: 0.2, useMemory: true, ctx: 30,
    prompt: '你是资深软件工程师。先给结论和可运行的代码，再简要解释原因；代码使用 Markdown 代码块并标注语言；指出潜在坑点。' },
  { id: 'translator', name: '翻译官', emoji: '🌐', model: '', temperature: 0.3, useMemory: false, ctx: 4,
    prompt: '你是专业翻译。用户输入中文就译成英文，输入其他语言就译成中文。只输出译文，不要解释。' },
  { id: 'writer', name: '写作润色', emoji: '✍️', model: '', temperature: 0.8, useMemory: true, ctx: 12,
    prompt: '你是资深文字编辑。润色用户提供的文字：保持原意，使表达更自然流畅；先给出润色结果，再用要点列出主要改动。' },
];
const STARTERS = ['帮我写一封得体的邮件', '用通俗的话解释一个概念', '给我一个学习计划', '帮我检查并优化这段代码'];

let S = Object.assign({}, DEFAULT_SETTINGS, store.get('settings', {}));
let assistants = store.get('assistants', null) || clone(DEFAULT_ASSISTANTS);
let chats = store.get('chats', []);
let memories = store.get('memories', []);
let cur = null;           // 当前对话（首条消息发出前不会写入历史）
let streaming = null;     // { ctrl }
let stick = true;         // 是否自动滚动到底部

const saveSettings = () => store.set('settings', S);
const saveAssistants = () => store.set('assistants', assistants);
const saveMemories = () => store.set('memories', memories);
const saveChats = () => store.set('chats', chats);

/* ---------- Toast ---------- */
let toastTimer = 0;
function toast(msg, ms = 2200) {
  const t = $('#toast'); if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

/* ---------- 剪贴板 / 外链 ---------- */
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); toast('已复制'); return; }
  } catch (e) { /* 走降级 */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  document.body.appendChild(ta); ta.focus(); ta.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch (e) { /* ignore */ }
  ta.remove(); toast(ok ? '已复制' : '复制失败，请手动选择文本');
}
function openExternal(url) {
  const o = window.__TAURI__ && window.__TAURI__.opener;
  if (o && o.openUrl) o.openUrl(url).catch(() => window.open(url, '_blank'));
  else window.open(url, '_blank');
}

/* =====================================================================
   Markdown（轻量实现，先转义再渲染，避免 XSS）
   ===================================================================== */
/*MD-START*/
function inline(s) {
  s = esc(s);
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
  s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" data-ext="1">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/__([^_]+)__/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => '<code>' + codes[i] + '</code>');
  return s;
}
const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
function parseList(lines, i) {
  const first = lines[i].match(LIST_RE);
  const base = first[1].length, ordered = /\d/.test(first[2]);
  const start = ordered ? parseInt(first[2], 10) : 1;
  let html = ordered ? '<ol' + (start !== 1 ? ' start="' + start + '"' : '') + '>' : '<ul>';
  const sameKind = m => /\d/.test(m[2]) === ordered;
  while (i < lines.length) {
    if (!lines[i].trim()) {
      const nx = lines[i + 1] && lines[i + 1].match(LIST_RE);
      if (nx && (nx[1].length > base || (nx[1].length === base && sameKind(nx)))) { i++; continue; }
      break;
    }
    const m = lines[i].match(LIST_RE);
    if (!m || m[1].length < base) break;
    if (m[1].length > base) break;
    if (!sameKind(m)) break;
    let item = inline(m[3]); i++;
    while (i < lines.length) {
      const n = lines[i].match(LIST_RE);
      if (n && n[1].length > base) { const r = parseList(lines, i); item += r.html; i = r.i; }
      else if (!n && /^\s+\S/.test(lines[i])) { item += '<br>' + inline(lines[i].trim()); i++; }
      else break;
    }
    html += '<li>' + item + '</li>';
  }
  html += ordered ? '</ol>' : '</ul>';
  return { html, i };
}
const TBL_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
function mdBlock(t) {
  const lines = t.split('\n'); let html = '', i = 0, m;
  const cells = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
  const stopRe = /^(#{1,6}\s|\s*>|\s*([-*+]|\d+[.)])\s+|\s*(-{3,}|\*{3,}|_{3,})\s*$)/;
  while (i < lines.length) {
    const ln = lines[i];
    if (!ln.trim()) { i++; continue; }
    if ((m = ln.match(/^(#{1,6})\s+(.*)$/))) { html += '<h' + m[1].length + '>' + inline(m[2]) + '</h' + m[1].length + '>'; i++; continue; }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(ln)) { html += '<hr>'; i++; continue; }
    if (/^\s*>/.test(ln)) {
      const q = []; while (i < lines.length && /^\s*>/.test(lines[i])) { q.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
      html += '<blockquote>' + mdBlock(q.join('\n')) + '</blockquote>'; continue;
    }
    if (LIST_RE.test(ln)) { const r = parseList(lines, i); html += r.html; i = r.i; continue; }
    if (ln.includes('|') && i + 1 < lines.length && TBL_SEP.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      const head = cells(ln); i += 2; const rows = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) { rows.push(cells(lines[i])); i++; }
      html += '<div class="tbl"><table><thead><tr>' + head.map(c => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>' +
        rows.map(r => '<tr>' + r.map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
      continue;
    }
    const p = [];
    while (i < lines.length && lines[i].trim() && !stopRe.test(lines[i])) { p.push(lines[i]); i++; }
    if (!p.length) { p.push(lines[i]); i++; }
    html += '<p>' + p.map(inline).join('<br>') + '</p>';
  }
  return html;
}
function codeBlock(lang, code) {
  return '<div class="code"><div class="code-h"><span>' + esc(lang || 'text') + '</span><button class="mini" data-act="copy-code">复制</button></div><pre><code>' + esc(code) + '</code></pre></div>';
}
function md(src) {
  src = String(src || '');
  const re = /```([^\n`]*)\n([\s\S]*?)(```|$)/g;
  let out = '', last = 0, m;
  while ((m = re.exec(src))) {
    out += mdBlock(src.slice(last, m.index));
    out += codeBlock(m[1].trim(), m[2].replace(/\n$/, ''));
    last = re.lastIndex;
    if (m[3] === '') break;
  }
  return out + mdBlock(src.slice(last));
}
function splitThink(t) {
  t = String(t || '');
  const m = t.match(/^\s*<think>([\s\S]*?)(<\/think>|$)/);
  if (!m) return { think: '', answer: t };
  return { think: m[1].trim(), answer: t.slice(m[0].length).replace(/^\s+/, '') };
}
/*MD-END*/

/* =====================================================================
   网络层（Tauri 下走 Rust 侧 HTTP，不受 CORS 限制，并支持流式）
   ===================================================================== */
function netFetch() {
  const t = window.__TAURI__;
  return (t && t.http && t.http.fetch) ? t.http.fetch : window.fetch.bind(window);
}
function apiUrl(path) {
  let base = (S.baseUrl || '').trim().replace(/\/+$/, '').replace(/\/(chat\/completions|models)$/, '');
  if (!/^https?:\/\//i.test(base)) base = 'https://' + base;
  let u = base + path;
  if (S.proxyOn && (S.proxyPrefix || '').trim()) {
    let p = S.proxyPrefix.trim();
    if (!/[\/=]$/.test(p)) p += '/';
    u = p + u;
  }
  return u;
}
function authHeaders(json) {
  const h = { Authorization: 'Bearer ' + (S.apiKey || '').trim() };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}
function errText(t) {
  try { const j = JSON.parse(t); return (j.error && (j.error.message || j.error)) || j.message || t; } catch (e) { return t; }
}
async function readError(r) {
  let t = ''; try { t = await r.text(); } catch (e) { /* ignore */ }
  return 'HTTP ' + r.status + (t ? ' · ' + String(errText(t)).slice(0, 400) : '');
}

async function chatCompletion({ model, messages, temperature, stream, signal, onDelta, onReasoning }) {
  const body = { model, messages, stream: !!stream };
  if (typeof temperature === 'number') body.temperature = temperature;
  const r = await netFetch()(apiUrl('/chat/completions'), { method: 'POST', headers: authHeaders(true), body: JSON.stringify(body), signal });
  if (!r.ok) throw new Error(await readError(r));
  const ctype = (r.headers && r.headers.get && r.headers.get('content-type')) || '';
  if (!stream || /application\/json/i.test(ctype)) {
    const j = await r.json();
    if (j.error) throw new Error(String(j.error.message || JSON.stringify(j.error)));
    const m = (j.choices && j.choices[0] && j.choices[0].message) || {};
    const content = typeof m.content === 'string' ? m.content : '';
    const reasoning = m.reasoning_content || m.reasoning || '';
    if (reasoning && onReasoning) onReasoning(reasoning);
    if (content && onDelta) onDelta(content);
    return { content, reasoning };
  }
  const reader = r.body.getReader(), dec = new TextDecoder();
  let buf = '', content = '', reasoning = '';
  const handle = line => {
    if (!line.startsWith('data:')) return false;
    const d = line.slice(5).trim();
    if (!d) return false;
    if (d === '[DONE]') return true;
    let j; try { j = JSON.parse(d); } catch (e) { return false; }
    if (j.error) throw new Error(String(j.error.message || JSON.stringify(j.error)));
    const dl = j.choices && j.choices[0] && j.choices[0].delta;
    if (!dl) return false;
    const rc = dl.reasoning_content || dl.reasoning;
    if (rc) { reasoning += rc; onReasoning && onReasoning(rc); }
    if (typeof dl.content === 'string' && dl.content) { content += dl.content; onDelta && onDelta(dl.content); }
    return false;
  };
  outer: for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let k;
    while ((k = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, k).replace(/\r$/, ''); buf = buf.slice(k + 1);
      if (handle(line)) break outer;
    }
  }
  if (buf.trim()) handle(buf.trim());
  try { reader.cancel(); } catch (e) { /* ignore */ }
  return { content, reasoning };
}

async function fetchModels() {
  if (!S.apiKey) throw new Error('请先填写 API Key');
  const r = await netFetch()(apiUrl('/models'), { headers: authHeaders(false) });
  if (!r.ok) throw new Error(await readError(r));
  const j = await r.json();
  const arr = (Array.isArray(j) ? j : (j.data || j.models || [])).map(m => typeof m === 'string' ? m : (m.id || m.name || '')).filter(Boolean);
  S.models = Array.from(new Set(arr)).sort((a, b) => a.localeCompare(b));
  saveSettings();
  return S.models;
}

/* =====================================================================
   覆盖层栈（弹出页/对话框/侧栏）与 Android 返回键
   ===================================================================== */
const stack = [];
let afterQ = null, closing = false;
function pushOverlay(el, close) { stack.push({ el, close }); history.pushState({ o: stack.length }, ''); }
function closeTop(after) {
  if (!stack.length) { if (after) after(); return; }
  if (closing) return;
  closing = true; afterQ = after || null; history.back();
}
window.addEventListener('popstate', () => {
  closing = false;
  const o = stack.pop(); if (o) o.close();
  const a = afterQ; afterQ = null; if (a) a();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && stack.length) closeTop(); });

function openSheet({ title, body, footer, onMount }) {
  const el = document.createElement('div'); el.className = 'sheet';
  el.innerHTML = '<div class="sheet-card"><div class="sheet-h"><button class="icon-btn" data-sheet="close" aria-label="返回">' + I.back + '</button><h2>' + esc(title) + '</h2></div>' +
    '<div class="sheet-b">' + body + '</div>' + (footer ? '<div class="sheet-f">' + footer + '</div>' : '') + '</div>';
  $('#sheets').appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
  pushOverlay(el, () => { el.classList.remove('show'); setTimeout(() => el.remove(), 260); });
  el.addEventListener('click', e => {
    if (e.target.closest('[data-sheet="close"]')) closeTop();
    else if (e.target === el && window.innerWidth >= 700) closeTop();
  });
  if (onMount) onMount(el);
  return el;
}
function dialog({ title, message = '', input = null, okText = '确定', cancelText = '取消', danger = false }) {
  return new Promise(res => {
    const el = document.createElement('div'); el.className = 'dlg';
    el.innerHTML = '<div class="dlg-card"><h3>' + esc(title) + '</h3>' + (message ? '<p>' + esc(message) + '</p>' : '') +
      (input !== null ? '<textarea class="field" rows="' + (input.rows || 2) + '" placeholder="' + esc(input.placeholder || '') + '">' + esc(input.value || '') + '</textarea>' : '') +
      '<div class="dlg-b">' + (cancelText ? '<button class="btn" data-r="0">' + esc(cancelText) + '</button>' : '') +
      '<button class="btn ' + (danger ? 'danger' : 'primary') + '" data-r="1">' + esc(okText) + '</button></div></div>';
    $('#sheets').appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    let result = null;
    pushOverlay(el, () => { el.classList.remove('show'); setTimeout(() => el.remove(), 180); res(result); });
    const ta = $('textarea', el); if (ta) { ta.focus(); ta.select(); }
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-r]');
      if (b) { result = b.dataset.r === '1' ? (ta ? ta.value : true) : null; closeTop(); }
      else if (e.target === el) closeTop();
    });
  });
}
const confirmBox = (title, message, okText = '确定', danger = true) => dialog({ title, message, okText, danger }).then(r => !!r);

/* ---------- 侧栏 ---------- */
const isWide = () => window.innerWidth >= 900;
function openDrawer() {
  if (isWide() || $('#drawer').classList.contains('open')) return;
  $('#drawer').classList.add('open'); $('#scrim').classList.add('show');
  renderChatList();
  pushOverlay($('#drawer'), () => { $('#drawer').classList.remove('open'); $('#scrim').classList.remove('show'); });
}
function afterDrawer(fn) { if ($('#drawer').classList.contains('open') && !isWide()) closeTop(fn); else fn(); }

/* =====================================================================
   主题 / 视口
   ===================================================================== */
function applyTheme() {
  const dark = S.theme === 'system' ? matchMedia('(prefers-color-scheme: dark)').matches : S.theme !== 'light';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = dark ? '#0f1115' : '#f5f6f8';
  document.documentElement.style.fontSize = (16 * (S.fontScale || 1)).toFixed(2) + 'px';
}
matchMedia('(prefers-color-scheme: dark)').addEventListener && matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (S.theme === 'system') applyTheme(); });
function fitViewport() {
  const vv = window.visualViewport;
  if (vv) { document.documentElement.style.setProperty('--app-h', vv.height + 'px'); window.scrollTo(0, 0); }
}
if (window.visualViewport) { visualViewport.addEventListener('resize', () => { fitViewport(); scrollBottom(); }); visualViewport.addEventListener('scroll', fitViewport); }

/* =====================================================================
   对话数据
   ===================================================================== */
const getAssistant = id => assistants.find(a => a.id === id) || assistants[0];
const curAssistant = () => getAssistant(cur.assistantId);
const effModel = chat => chat.model || getAssistant(chat.assistantId).model || S.defaultModel || '';

function newChat(aid) {
  if (streaming) stopStream();
  const id = getAssistant(aid || (cur && cur.assistantId) || store.get('lastAssistant', 'default')).id;
  cur = { id: uid(), title: '新对话', assistantId: id, model: '', createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
  stick = true; renderAll();
}
function openChat(id) {
  const c = chats.find(x => x.id === id); if (!c) return;
  if (streaming) stopStream();
  cur = c; stick = true; renderAll(); scrollBottom(true);
}
function persistCur() {
  if (!cur.messages.length) return;
  if (!chats.includes(cur)) chats.unshift(cur);
  cur.updatedAt = Date.now();
  saveChats();
}

/* ---------- 渲染：顶栏 / 消息 / 侧栏 ---------- */
function renderAll() { renderHeader(); renderMessages(); renderChatList(); updateComposer(); }
function renderHeader() {
  const a = curAssistant(), m = effModel(cur);
  $('#asstEmoji').textContent = a.emoji || '🤖';
  $('#asstName').textContent = a.name;
  $('#modelChip').textContent = (m || '未选择模型') + ' ▾';
}
function emptyHtml() {
  const a = curAssistant();
  const need = !S.apiKey;
  return '<div class="empty"><div class="big">' + esc(a.emoji || '🍯') + '</div><h1>我是「' + esc(a.name) + '」</h1>' +
    '<p>' + (need ? '先去设置里填写 API 地址和密钥吧' : '有什么可以帮你？') + '</p>' +
    (need ? '<button class="btn primary" data-act="open-settings">打开设置</button>' :
      '<div class="starters">' + STARTERS.map(s => '<button class="starter" data-act="starter" data-t="' + esc(s) + '">' + esc(s) + '</button>').join('') + '</div>') + '</div>';
}
function actionsHtml(m, i, isLast) {
  const b = (act, ic, tip) => '<button class="act" data-act="' + act + '" title="' + tip + '" aria-label="' + tip + '">' + ic + '</button>';
  if (m.role === 'user') return b('copy-msg', I.copy, '复制') + b('edit-msg', I.edit, '编辑') + b('del-msg', I.trash, '删除');
  return b('copy-msg', I.copy, '复制') + (isLast ? b('regen', I.refresh, '重新生成') : '') + b('remember', I.bookmark, '存入记忆') + b('del-msg', I.trash, '删除');
}
function msgHtml(m, i, isLast) {
  if (m.role === 'user') return '<div class="msg user" data-i="' + i + '"><div class="bubble">' + esc(m.content) + '</div><div class="actions">' + actionsHtml(m, i) + '</div></div>';
  return '<div class="msg ai" data-i="' + i + '"><div class="who">' + esc(m.model || '') + '</div>' +
    '<details class="think" hidden><summary>思考过程</summary><div class="md think-body"></div></details>' +
    '<div class="md answer"></div><div class="err" hidden></div><div class="stopped" hidden>已停止</div>' +
    '<div class="actions">' + actionsHtml(m, i, isLast) + '</div></div>';
}
function fillAi(el, m) {
  const sp = splitThink(m.content || '');
  const reasoning = [m.reasoning, sp.think].filter(Boolean).join('\n');
  const det = $('details.think', el), body = $('.think-body', el);
  det.hidden = !reasoning; if (reasoning) body.innerHTML = md(reasoning);
  $('.answer', el).innerHTML = md(sp.answer);
  const er = $('.err', el); er.hidden = !m.error; er.textContent = m.error || '';
  $('.stopped', el).hidden = !m.stopped;
}
function renderMessages() {
  const box = $('#messages');
  if (!cur.messages.length) { box.innerHTML = emptyHtml(); return; }
  box.innerHTML = cur.messages.map((m, i) => msgHtml(m, i, i === cur.messages.length - 1)).join('');
  $$('.msg.ai', box).forEach(el => fillAi(el, cur.messages[+el.dataset.i]));
}
function lastMsgEl() { const l = $$('#messages .msg'); return l[l.length - 1]; }
function scrollBottom(force) { const c = $('#chat'); if (c && (force || stick)) c.scrollTop = c.scrollHeight; }
$('#chat').addEventListener('scroll', () => { const c = $('#chat'); stick = c.scrollHeight - c.scrollTop - c.clientHeight < 140; }, { passive: true });

function groupName(t) {
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const day = 86400000, x = t - d0.getTime();
  if (x >= 0) return '今天'; if (x >= -day) return '昨天'; if (x >= -7 * day) return '最近 7 天'; return '更早';
}
function renderChatList() {
  const q = ($('#chatSearch').value || '').trim().toLowerCase();
  let list = chats.slice().sort((a, b) => b.updatedAt - a.updatedAt);
  if (q) list = list.filter(c => c.title.toLowerCase().includes(q) || c.messages.some(m => (m.content || '').toLowerCase().includes(q)));
  if (!list.length) { $('#chatList').innerHTML = '<div class="none">' + (q ? '没有匹配的对话' : '还没有历史对话') + '</div>'; return; }
  let html = '', g = '';
  for (const c of list) {
    const gn = groupName(c.updatedAt);
    if (gn !== g) { g = gn; html += '<div class="grp">' + gn + '</div>'; }
    html += '<div class="ci' + (cur && c.id === cur.id ? ' on' : '') + '" data-act="open-chat" data-id="' + c.id + '"><span class="ci-e">' + esc(getAssistant(c.assistantId).emoji || '🤖') + '</span>' +
      '<span class="ci-t">' + esc(c.title) + '</span>' +
      '<button class="icon-btn sm" data-act="rename-chat" data-id="' + c.id + '" aria-label="重命名">' + I.edit + '</button>' +
      '<button class="icon-btn sm" data-act="del-chat" data-id="' + c.id + '" aria-label="删除">' + I.trash + '</button></div>';
  }
  $('#chatList').innerHTML = html;
}
$('#chatSearch').addEventListener('input', renderChatList);

/* ---------- 输入框 ---------- */
const input = $('#input');
function autosize() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, window.innerHeight * 0.38) + 'px'; }
function updateComposer() {
  const btn = $('#sendBtn');
  if (streaming) { btn.innerHTML = I.stop; btn.disabled = false; btn.dataset.act = 'stop'; btn.setAttribute('aria-label', '停止'); }
  else { btn.innerHTML = I.send; btn.disabled = !input.value.trim(); btn.dataset.act = 'send'; btn.setAttribute('aria-label', '发送'); }
}
input.addEventListener('input', () => { autosize(); updateComposer(); });
input.addEventListener('focus', () => setTimeout(() => scrollBottom(true), 250));
input.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && (S.sendOnEnter || e.ctrlKey || e.metaKey)) { e.preventDefault(); doSend(); }
});

/* =====================================================================
   发送 / 生成
   ===================================================================== */
function doSend() {
  const t = input.value.trim(); if (!t || streaming) return;
  const cmd = t.match(/^\/(remember|记住)\s+([\s\S]+)/i);
  if (cmd) { addMemory(cmd[2].trim()); input.value = ''; autosize(); updateComposer(); return; }
  if (!S.apiKey.trim() || !S.baseUrl.trim()) { toast('请先在设置中填写 API 地址和密钥'); openSettings(); return; }
  if (!effModel(cur)) { toast('请先选择模型'); pickChatModel(); return; }
  input.value = ''; autosize();
  cur.messages.push({ role: 'user', content: t, t: Date.now() });
  if (cur.messages.length === 1) cur.title = t.replace(/\s+/g, ' ').slice(0, 30);
  store.set('lastAssistant', cur.assistantId);
  persistCur(); stick = true; renderMessages(); renderChatList(); runAssistant();
}
function buildMessages(chat) {
  const a = getAssistant(chat.assistantId);
  let sys = (a.prompt || '').trim();
  if (a.useMemory && memories.length) sys += '\n\n## 关于用户的长期记忆（仅在相关时自然地使用，不要主动复述）\n' + memories.map(m => '- ' + m.text).join('\n');
  sys += '\n\n当前日期：' + new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  let hist = chat.messages.filter(m => !m.error && (m.content || '').trim()).map(m => ({ role: m.role, content: m.role === 'assistant' ? splitThink(m.content).answer : m.content }));
  hist = hist.slice(-Math.max(1, a.ctx || 20));
  while (hist.length && hist[0].role !== 'user') hist.shift();
  return [{ role: 'system', content: sys }, ...hist];
}
async function runAssistant() {
  const chat = cur, a = getAssistant(chat.assistantId), model = effModel(chat);
  const msg = { role: 'assistant', content: '', reasoning: '', model, t: Date.now() };
  chat.messages.push(msg); renderMessages();
  const el = lastMsgEl(); el.classList.add('streaming');
  const ctrl = new AbortController(); streaming = { ctrl }; updateComposer(); scrollBottom(true);
  let raf = 0;
  const paint = () => { raf = 0; if (cur === chat && el.isConnected) { fillAi(el, msg); scrollBottom(); } };
  const kick = () => { if (!raf) raf = requestAnimationFrame(paint); };
  let userText = '';
  for (let k = chat.messages.length - 2; k >= 0; k--) if (chat.messages[k].role === 'user') { userText = chat.messages[k].content; break; }
  try {
    await chatCompletion({
      model, messages: buildMessages(chat), temperature: a.temperature, stream: S.stream, signal: ctrl.signal,
      onDelta: d => { msg.content += d; kick(); }, onReasoning: d => { msg.reasoning += d; kick(); },
    });
    if (!msg.content && !msg.reasoning) msg.error = '模型没有返回内容';
  } catch (e) {
    if (ctrl.signal.aborted) msg.stopped = true;
    else msg.error = String((e && e.message) || e);
  } finally {
    if (raf) cancelAnimationFrame(raf);
    streaming = null; el.classList.remove('streaming');
    if (cur === chat) { renderMessages(); scrollBottom(); }
    persistCur(); renderChatList(); updateComposer();
  }
  if (!msg.error && !msg.stopped && S.autoMemory && a.useMemory && msg.content) extractMemory(model, userText, splitThink(msg.content).answer);
}
function stopStream() { if (streaming) streaming.ctrl.abort(); }

async function extractMemory(model, userText, reply) {
  try {
    const sys = '你是记忆提取器。从对话中提取关于用户的、长期有用的稳定信息或偏好（如称呼、职业、所在地、技术栈、语言/风格偏好、长期目标）。忽略一次性问题和临时内容。' +
      '只输出 JSON 字符串数组，例如 ["用户是后端工程师，常用 Go"]；没有可记的内容则输出 []。每条不超过 40 字，不要重复已有记忆：\n' + (memories.map(m => '- ' + m.text).join('\n') || '（暂无）');
    const r = await chatCompletion({ model, temperature: 0, stream: false, messages: [{ role: 'system', content: sys }, { role: 'user', content: '用户说：' + userText + '\n\n助手回答：' + reply.slice(0, 1500) }] });
    const m = r.content.match(/\[[\s\S]*\]/); if (!m) return;
    const arr = JSON.parse(m[0]).filter(x => typeof x === 'string' && x.trim());
    let n = 0; for (const t of arr) if (!memories.some(x => x.text === t.trim())) { memories.push({ id: uid(), text: t.trim().slice(0, 200), t: Date.now() }); n++; }
    if (n) { saveMemories(); toast('已自动记住 ' + n + ' 条'); }
  } catch (e) { /* 自动记忆失败不打扰用户 */ }
}
function addMemory(text) {
  text = (text || '').trim(); if (!text) return false;
  if (memories.some(m => m.text === text)) { toast('已经记住过了'); return false; }
  memories.push({ id: uid(), text: text.slice(0, 300), t: Date.now() }); saveMemories(); toast('已存入记忆'); return true;
}

/* =====================================================================
   模型选择器
   ===================================================================== */
function openModelPicker({ current, allowDefault, onPick, title = '选择模型' }) {
  let q = '', vendor = '';
  openSheet({
    title,
    body: '<div class="search"><span data-icon="search"></span><input id="mq" placeholder="搜索，空格分隔多个关键词" autocomplete="off" autocapitalize="off" spellcheck="false"></div>' +
      '<div class="chips" id="mchips"></div><div id="mlist"></div>',
    footer: '<button class="btn" id="mrefresh">刷新列表</button><button class="btn primary" id="mcustom">使用输入的名称</button>',
    onMount(el) {
      $$('[data-icon]', el).forEach(x => x.innerHTML = I[x.dataset.icon]);
      const inp = $('#mq', el), list = $('#mlist', el), chips = $('#mchips', el);
      const vendorOf = id => id.split(/[\/\-:_. ]/)[0].toLowerCase();
      const draw = () => {
        const cnt = {}; S.models.forEach(id => { const v = vendorOf(id); if (v.length > 1) cnt[v] = (cnt[v] || 0) + 1; });
        const tops = Object.keys(cnt).filter(k => cnt[k] >= 2).sort((a, b) => cnt[b] - cnt[a]).slice(0, 12);
        chips.innerHTML = S.models.length ? ['全部', ...tops].map(v => '<button class="chip' + ((v === '全部' && !vendor) || v === vendor ? ' on' : '') + '" data-v="' + esc(v === '全部' ? '' : v) + '">' + esc(v) + '</button>').join('') : '';
        const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
        const arr = S.models.filter(id => { const l = id.toLowerCase(); return (!vendor || l.includes(vendor)) && terms.every(t => l.includes(t)); });
        let html = '';
        if (allowDefault && !terms.length && !vendor) html += '<button class="mrow' + (!current ? ' on' : '') + '" data-id=""><span>跟随默认模型' + (S.defaultModel ? '（' + esc(S.defaultModel) + '）' : '') + '</span>' + (!current ? I.check : '') + '</button>';
        html += arr.slice(0, 300).map(id => '<button class="mrow' + (id === current ? ' on' : '') + '" data-id="' + esc(id) + '"><span>' + esc(id) + '</span>' + (id === current ? I.check : '') + '</button>').join('');
        if (arr.length > 300) html += '<div class="hint">仅显示前 300 个，请输入关键词继续筛选</div>';
        if (!S.models.length) html += '<div class="hint">还没有模型列表。点下方「刷新列表」从服务端拉取，或直接输入模型名后点「使用输入的名称」。</div>';
        else if (!arr.length) html += '<div class="hint">没有匹配项。可点「使用输入的名称」直接使用 “' + esc(q) + '”。</div>';
        list.innerHTML = html;
      };
      const refresh = async () => {
        const b = $('#mrefresh', el); b.disabled = true; b.textContent = '刷新中…';
        try { const m = await fetchModels(); toast('获取到 ' + m.length + ' 个模型'); draw(); }
        catch (e) { toast('获取失败：' + e.message, 3500); }
        b.disabled = false; b.textContent = '刷新列表';
      };
      inp.addEventListener('input', () => { q = inp.value.trim(); draw(); });
      chips.addEventListener('click', e => { const c = e.target.closest('.chip'); if (c) { vendor = c.dataset.v; draw(); } });
      list.addEventListener('click', e => { const r = e.target.closest('.mrow'); if (r) closeTop(() => onPick(r.dataset.id)); });
      $('#mrefresh', el).addEventListener('click', refresh);
      $('#mcustom', el).addEventListener('click', () => { const v = inp.value.trim(); if (!v) { toast('先在搜索框输入模型名'); return; } closeTop(() => onPick(v)); });
      draw();
      if (!S.models.length && S.apiKey) refresh();
    },
  });
}
function pickChatModel() {
  openModelPicker({ current: cur.model || '', allowDefault: true, title: '本次对话使用的模型', onPick: id => { cur.model = id; if (cur.messages.length) persistCur(); renderHeader(); } });
}

/* =====================================================================
   助手
   ===================================================================== */
function startChatWith(id) {
  if (cur.messages.length === 0) { cur.assistantId = id; cur.model = ''; renderAll(); }
  else newChat(id);
}
function openAssistantPicker() {
  openSheet({
    title: '选择助手',
    body: assistants.map(a => '<button class="list-item' + (a.id === cur.assistantId ? ' on' : '') + '" data-id="' + a.id + '"><span class="em">' + esc(a.emoji) + '</span><span class="tx"><b>' + esc(a.name) + '</b><small>' + esc(a.model || ('默认 · ' + (S.defaultModel || '未选择'))) + '</small></span></button>').join('') +
      '<div class="hint">选择助手会开启一个新对话（当前对话为空时直接切换）。</div>',
    footer: '<button class="btn" id="manage">管理助手</button>',
    onMount(el) {
      el.addEventListener('click', e => {
        const b = e.target.closest('.list-item'); if (b) closeTop(() => startChatWith(b.dataset.id));
        if (e.target.closest('#manage')) closeTop(() => openAssistants());
      });
    },
  });
}
function openAssistants() {
  const draw = el => {
    $('.sheet-b', el).innerHTML = assistants.map(a => '<button class="list-item" data-id="' + a.id + '"><span class="em">' + esc(a.emoji) + '</span><span class="tx"><b>' + esc(a.name) + '</b><small>' + esc(a.model || '跟随默认模型') + ' · ' + (a.useMemory ? '含记忆' : '不用记忆') + '</small></span>' + I.edit + '</button>').join('');
  };
  openSheet({
    title: '助手管理', body: '', footer: '<button class="btn primary" id="newA">新建助手</button>',
    onMount(el) {
      draw(el); el._redraw = () => draw(el);
      el.addEventListener('click', e => {
        const b = e.target.closest('.list-item'); if (b) editAssistant(b.dataset.id, el);
        if (e.target.closest('#newA')) editAssistant(null, el);
      });
    },
  });
}
function editAssistant(id, parent) {
  const isNew = !id;
  const a = isNew ? { id: uid(), name: '新助手', emoji: '🤖', model: '', temperature: 0.7, useMemory: true, ctx: 20, prompt: '' } : clone(getAssistant(id));
  openSheet({
    title: isNew ? '新建助手' : '编辑助手',
    body: '<div class="card"><div class="col"><label>图标与名称</label><div class="two" style="gap:.5rem"><input class="field emoji-in" id="ae" maxlength="4" style="flex:none;width:4.4rem"><input class="field" id="an" placeholder="助手名称"></div></div>' +
      '<div class="col"><label>系统提示词</label><textarea class="field" id="ap" rows="7" placeholder="描述这个助手的角色、风格与限制"></textarea></div>' +
      '<div class="col"><label>使用的模型</label><button class="pick" id="am"><span></span>' + I.chev + '</button><small>留空则跟随「设置」里的默认模型。不同助手可以绑定不同模型。</small></div>' +
      '<div class="col"><label>温度：<b id="atv"></b></label><input type="range" id="at" min="0" max="2" step="0.1"><small>越低越严谨稳定，越高越有创意。</small></div>' +
      '<div class="row"><span>使用长期记忆<small>把「记忆」里的内容注入到系统提示词</small></span><input type="checkbox" class="sw" id="amem"></div>' +
      '<div class="col"><label>携带的历史消息条数：<b id="acv"></b></label><input type="range" id="ac" min="2" max="60" step="2"><small>越多越连贯，但更耗 token。</small></div></div>',
    footer: (isNew ? '' : '<button class="btn danger" id="adel">删除</button>') + '<button class="btn primary" id="asave">保存</button>',
    onMount(el) {
      $('#ae', el).value = a.emoji; $('#an', el).value = a.name; $('#ap', el).value = a.prompt;
      $('#at', el).value = a.temperature; $('#amem', el).checked = a.useMemory; $('#ac', el).value = a.ctx;
      const showM = () => { $('#am span', el).innerHTML = a.model ? esc(a.model) : '<span class="muted">跟随默认模型</span>'; };
      const showT = () => { $('#atv', el).textContent = (+a.temperature).toFixed(1); $('#acv', el).textContent = a.ctx; };
      showM(); showT();
      $('#at', el).addEventListener('input', e => { a.temperature = +e.target.value; showT(); });
      $('#ac', el).addEventListener('input', e => { a.ctx = +e.target.value; showT(); });
      $('#am', el).addEventListener('click', () => openModelPicker({ current: a.model, allowDefault: true, title: '助手使用的模型', onPick: id => { a.model = id; showM(); } }));
      $('#asave', el).addEventListener('click', () => {
        a.emoji = $('#ae', el).value.trim() || '🤖'; a.name = $('#an', el).value.trim() || '未命名助手';
        a.prompt = $('#ap', el).value; a.useMemory = $('#amem', el).checked;
        const k = assistants.findIndex(x => x.id === a.id);
        if (k >= 0) assistants[k] = a; else assistants.push(a);
        saveAssistants(); toast('已保存');
        closeTop(() => { if (parent && parent.isConnected && parent._redraw) parent._redraw(); renderHeader(); });
      });
      const del = $('#adel', el);
      if (del) del.addEventListener('click', async () => {
        if (assistants.length <= 1) { toast('至少保留一个助手'); return; }
        if (!(await confirmBox('删除助手', '确定删除「' + a.name + '」吗？已有对话会改用第一个助手。', '删除'))) return;
        assistants = assistants.filter(x => x.id !== a.id); saveAssistants();
        chats.forEach(c => { if (c.assistantId === a.id) c.assistantId = assistants[0].id; }); saveChats();
        if (cur.assistantId === a.id) cur.assistantId = assistants[0].id;
        closeTop(() => { if (parent && parent.isConnected && parent._redraw) parent._redraw(); renderAll(); });
      });
    },
  });
}

/* =====================================================================
   记忆
   ===================================================================== */
function openMemory() {
  openSheet({
    title: '长期记忆',
    body: '<div class="addrow"><input class="field" id="mnew" placeholder="手动添加一条记忆，例如：我是后端工程师" maxlength="300"><button class="btn primary" id="madd">添加</button></div><div id="mlist2"></div>' +
      '<div class="hint">启用了「使用长期记忆」的助手会在每次对话时读取这些内容。你也可以：<br>· 在聊天里输入 <b>/记住 内容</b><br>· 点击助手消息下方的书签图标<br>· 在设置里开启「自动记忆」，让模型自己提炼</div>',
    footer: '<button class="btn danger" id="mclear">清空全部</button>',
    onMount(el) {
      const list = $('#mlist2', el);
      const draw = () => {
        list.innerHTML = memories.length ? memories.slice().reverse().map(m => '<div class="mem" data-id="' + m.id + '"><div class="tx">' + esc(m.text) + '</div>' +
          '<button class="icon-btn sm" data-m="edit" aria-label="编辑">' + I.edit + '</button><button class="icon-btn sm" data-m="del" aria-label="删除">' + I.trash + '</button></div>').join('') : '<div class="none">还没有记忆</div>';
      };
      draw();
      const add = () => { const i = $('#mnew', el); if (addMemory(i.value)) { i.value = ''; draw(); } };
      $('#madd', el).addEventListener('click', add);
      $('#mnew', el).addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) add(); });
      list.addEventListener('click', async e => {
        const b = e.target.closest('[data-m]'); if (!b) return;
        const id = b.closest('.mem').dataset.id, m = memories.find(x => x.id === id); if (!m) return;
        if (b.dataset.m === 'del') { memories = memories.filter(x => x.id !== id); saveMemories(); draw(); }
        else { const v = await dialog({ title: '编辑记忆', input: { value: m.text, rows: 3 }, okText: '保存' }); if (v && v.trim()) { m.text = v.trim(); saveMemories(); draw(); } }
      });
      $('#mclear', el).addEventListener('click', async () => {
        if (!memories.length) return;
        if (await confirmBox('清空记忆', '确定删除全部 ' + memories.length + ' 条记忆吗？', '清空')) { memories = []; saveMemories(); draw(); }
      });
    },
  });
}

/* =====================================================================
   设置 / 备份
   ===================================================================== */
function openSettings() {
  const sw = (id, t, s) => '<div class="row"><span>' + t + (s ? '<small>' + s + '</small>' : '') + '</span><input type="checkbox" class="sw" id="' + id + '"></div>';
  openSheet({
    title: '设置',
    body:
      '<div class="sec">API 连接</div><div class="card">' +
      '<div class="col"><label>API 地址（Base URL）</label><input class="field" id="sUrl" placeholder="https://api.openai.com/v1" autocapitalize="off" spellcheck="false"><small>填到 /v1 为止，例如 DeepSeek 填 https://api.deepseek.com，OpenRouter 填 https://openrouter.ai/api/v1</small></div>' +
      '<div class="col"><label>API Key</label><div class="addrow" style="margin:0"><input class="field" id="sKey" type="password" placeholder="sk-..." autocapitalize="off" spellcheck="false"><button class="btn" id="sEye">显示</button></div></div>' +
      sw('sProxyOn', '代理加速前缀', '开启后请求会变成「前缀 + 原始地址」') +
      '<div class="col" id="proxyBox"><input class="field" id="sProxy" placeholder="https://proxy.example.com/" autocapitalize="off" spellcheck="false"><small>例：前缀 https://p.example.com/ 实际请求 https://p.example.com/https://api.openai.com/v1/chat/completions</small></div>' +
      '<div class="col"><label>默认模型</label><button class="pick" id="sModel"><span></span>' + I.chev + '</button><button class="btn" id="sFetch">测试连接并拉取模型列表</button></div></div>' +
      '<div class="sec">对话</div><div class="card">' +
      sw('sStream', '流式输出', '边生成边显示；若服务端不支持可关闭') +
      sw('sAuto', '自动记忆', '每轮回复后额外调用一次模型提炼长期记忆（会多消耗 token）') +
      sw('sEnter', 'Enter 键发送', '关闭时 Enter 换行，用右侧按钮发送；Ctrl+Enter 始终可发送') + '</div>' +
      '<div class="sec">外观</div><div class="card">' +
      '<div class="col"><label>主题</label><div class="two"><button class="btn" data-th="dark">深色</button><button class="btn" data-th="light">浅色</button><button class="btn" data-th="system">跟随系统</button></div></div>' +
      '<div class="col"><label>字体大小：<b id="sFsv"></b></label><input type="range" id="sFs" min="0.85" max="1.4" step="0.05"></div></div>' +
      '<div class="sec">数据</div><div class="card"><div class="col"><button class="btn" id="sBackup">备份 / 恢复</button><button class="btn danger" id="sWipe">清空所有对话</button></div></div>' +
      '<div class="hint">所有数据（含 API Key）仅保存在本机，请求只发往你填写的地址。</div>',
    onMount(el) {
      $$('[data-icon]', el).forEach(x => x.innerHTML = I[x.dataset.icon]);
      const f = id => $('#' + id, el);
      f('sUrl').value = S.baseUrl; f('sKey').value = S.apiKey; f('sProxyOn').checked = S.proxyOn; f('sProxy').value = S.proxyPrefix;
      f('sStream').checked = S.stream; f('sAuto').checked = S.autoMemory; f('sEnter').checked = S.sendOnEnter; f('sFs').value = S.fontScale;
      const showModel = () => { f('sModel').firstElementChild.innerHTML = S.defaultModel ? esc(S.defaultModel) : '<span class="muted">点击选择</span>'; };
      const showProxy = () => { f('proxyBox').style.display = S.proxyOn ? '' : 'none'; };
      const showTheme = () => $$('[data-th]', el).forEach(b => b.classList.toggle('primary', b.dataset.th === S.theme));
      const showFs = () => { f('sFsv').textContent = Math.round(S.fontScale * 100) + '%'; };
      showModel(); showProxy(); showTheme(); showFs();
      const bind = (id, key, ev = 'input', get = x => x.value) => f(id).addEventListener(ev, e => { S[key] = get(e.target); saveSettings(); });
      bind('sUrl', 'baseUrl'); bind('sKey', 'apiKey'); bind('sProxy', 'proxyPrefix');
      bind('sStream', 'stream', 'change', x => x.checked); bind('sAuto', 'autoMemory', 'change', x => x.checked); bind('sEnter', 'sendOnEnter', 'change', x => x.checked);
      f('sProxyOn').addEventListener('change', e => { S.proxyOn = e.target.checked; saveSettings(); showProxy(); });
      f('sEye').addEventListener('click', () => { const k = f('sKey'); const show = k.type === 'password'; k.type = show ? 'text' : 'password'; f('sEye').textContent = show ? '隐藏' : '显示'; });
      f('sFs').addEventListener('input', e => { S.fontScale = +e.target.value; saveSettings(); applyTheme(); showFs(); });
      $$('[data-th]', el).forEach(b => b.addEventListener('click', () => { S.theme = b.dataset.th; saveSettings(); applyTheme(); showTheme(); }));
      f('sModel').addEventListener('click', () => openModelPicker({ current: S.defaultModel, allowDefault: false, title: '默认模型', onPick: id => { S.defaultModel = id; saveSettings(); showModel(); renderHeader(); } }));
      f('sFetch').addEventListener('click', async () => {
        const b = f('sFetch'); b.disabled = true; b.textContent = '连接中…';
        try { const m = await fetchModels(); toast('连接成功，共 ' + m.length + ' 个模型'); }
        catch (e) { toast('连接失败：' + e.message, 4000); }
        b.disabled = false; b.textContent = '测试连接并拉取模型列表';
      });
      f('sBackup').addEventListener('click', openBackup);
      f('sWipe').addEventListener('click', async () => {
        if (!(await confirmBox('清空所有对话', '将删除全部 ' + chats.length + ' 个历史对话，无法恢复。', '清空'))) return;
        chats = []; saveChats(); closeTop(() => newChat());
      });
    },
  });
}
function openBackup() {
  openSheet({
    title: '备份与恢复',
    body: '<div class="hint">导出内容包含设置（不含 API Key）、助手、记忆和全部对话。复制保存到安全的地方；恢复时把内容粘贴到下方再点「导入」。</div>' +
      '<textarea class="field" id="bk" rows="10" spellcheck="false" placeholder="导出的 JSON 会显示在这里，或把备份粘贴到这里"></textarea>',
    footer: '<button class="btn" id="bkExp">导出并复制</button><button class="btn primary" id="bkImp">导入</button>',
    onMount(el) {
      $('#bkExp', el).addEventListener('click', () => {
        const s = Object.assign({}, S); delete s.apiKey; delete s.models;
        const txt = JSON.stringify({ app: 'honeGPT', v: 1, settings: s, assistants, memories, chats });
        $('#bk', el).value = txt; copyText(txt);
      });
      $('#bkImp', el).addEventListener('click', async () => {
        let d; try { d = JSON.parse($('#bk', el).value); } catch (e) { toast('不是有效的 JSON'); return; }
        if (!d || d.app !== 'honeGPT') { toast('这不是 honeGPT 的备份'); return; }
        if (!(await confirmBox('导入备份', '将覆盖现有助手与记忆，并合并对话。继续吗？', '导入', false))) return;
        if (d.settings) { const k = S.apiKey; S = Object.assign({}, S, d.settings, { apiKey: k }); saveSettings(); applyTheme(); }
        if (Array.isArray(d.assistants) && d.assistants.length) { assistants = d.assistants; saveAssistants(); }
        if (Array.isArray(d.memories)) { memories = d.memories; saveMemories(); }
        if (Array.isArray(d.chats)) { const have = new Set(chats.map(c => c.id)); d.chats.forEach(c => { if (!have.has(c.id)) chats.push(c); }); saveChats(); }
        toast('导入完成'); closeTop(() => { cur = null; newChat(); });
      });
    },
  });
}

/* =====================================================================
   全局事件
   ===================================================================== */
function msgIndex(el) { const m = el.closest('.msg'); return m ? +m.dataset.i : -1; }
document.addEventListener('click', async e => {
  const link = e.target.closest('a[data-ext]');
  if (link) { e.preventDefault(); openExternal(link.getAttribute('href')); return; }
  if (e.target.id === 'scrim') { closeTop(); return; }
  const a = e.target.closest('[data-act]'); if (!a) return;
  const act = a.dataset.act;
  switch (act) {
    case 'drawer': openDrawer(); break;
    case 'close-drawer': closeTop(); break;
    case 'new-chat': afterDrawer(() => { if (cur.messages.length) newChat(); else renderAll(); input.focus(); }); break;
    case 'open-chat': afterDrawer(() => openChat(a.dataset.id)); break;
    case 'open-settings': afterDrawer(openSettings); break;
    case 'open-assistants': afterDrawer(openAssistants); break;
    case 'open-memory': afterDrawer(openMemory); break;
    case 'pick-assistant': openAssistantPicker(); break;
    case 'pick-model': pickChatModel(); break;
    case 'send': doSend(); break;
    case 'stop': stopStream(); break;
    case 'starter': input.value = a.dataset.t; autosize(); updateComposer(); doSend(); break;
    case 'rename-chat': {
      e.stopPropagation();
      const c = chats.find(x => x.id === a.dataset.id); if (!c) break;
      const v = await dialog({ title: '重命名对话', input: { value: c.title, rows: 1 }, okText: '保存' });
      if (v && v.trim()) { c.title = v.trim().slice(0, 60); saveChats(); renderChatList(); }
      break;
    }
    case 'del-chat': {
      e.stopPropagation();
      const c = chats.find(x => x.id === a.dataset.id); if (!c) break;
      if (!(await confirmBox('删除对话', '确定删除「' + c.title + '」吗？', '删除'))) break;
      chats = chats.filter(x => x !== c); saveChats();
      if (cur === c) newChat(); else renderChatList();
      break;
    }
    case 'copy-code': { const c = a.closest('.code'); copyText($('code', c).textContent); break; }
    case 'copy-msg': { const i = msgIndex(a); if (i >= 0) copyText(splitThink(cur.messages[i].content).answer || cur.messages[i].content); break; }
    case 'remember': { const i = msgIndex(a); if (i >= 0) addMemory(splitThink(cur.messages[i].content).answer.slice(0, 300)); break; }
    case 'del-msg': {
      const i = msgIndex(a); if (i < 0 || streaming) break;
      cur.messages.splice(i, 1);
      if (!cur.messages.length) { chats = chats.filter(x => x !== cur); saveChats(); } else persistCur();
      renderMessages(); renderChatList(); break;
    }
    case 'edit-msg': {
      const i = msgIndex(a); if (i < 0 || streaming) break;
      input.value = cur.messages[i].content; cur.messages.splice(i); persistCur();
      if (!cur.messages.length) { chats = chats.filter(x => x !== cur); saveChats(); }
      renderMessages(); renderChatList(); autosize(); updateComposer(); input.focus(); break;
    }
    case 'regen': {
      if (streaming) break;
      const i = msgIndex(a); if (i < 0) break;
      if (!S.apiKey.trim()) { openSettings(); break; }
      if (!effModel(cur)) { pickChatModel(); break; }
      cur.messages.splice(i); persistCur(); stick = true; runAssistant(); break;
    }
  }
});

/* =====================================================================
   启动：默认打开一个新对话
   ===================================================================== */
$$('[data-icon]').forEach(x => x.innerHTML = I[x.dataset.icon]);
applyTheme(); fitViewport();
// 清理上次异常退出时遗留的半截消息标记
chats.forEach(c => c.messages.forEach(m => { if (m.role === 'assistant' && !m.content && !m.error) m.error = '上次生成被中断'; }));
newChat(store.get('lastAssistant', 'default'));
