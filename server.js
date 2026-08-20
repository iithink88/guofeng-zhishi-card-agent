/* ============================================================
 * server.js — 国风知识卡片 · 图形界面智能体（本地服务器）
 * 由扣子(Coze)工作流「知识卡片_中国风传统主题插画风格」转换而来
 * 纯 Node 内置模块，零外部依赖（Node 18+ 自带 fetch）
 * 架构参照「飞影数字人」：本地 http 静态服务 + 端口自动重试 + 自动开浏览器
 * 功能：
 *   - /api/keys        读取本机 .env 中的密钥（脱敏）
 *   - /api/set-keys    保存自定义 LLM / 自定义图模型配置到本机 .env
 *   - /api/generate    SSE 流式：调 LLM 生成国风卡片文案 →（可选）用 Coze 图片提示词系统生成国风插画 → 拼装自包含 HTML
 *   - /api/test        快速测试 LLM 连通性
 *   - /files/*         回看 output 目录下的卡片 html
 * 注：Coze 工作流节点「图片提示词」的 systemPrompt 已原样移植为 COZE_IMAGE_SYSTEM，
 *     保证国风插画提示词的专业性；原「视频生成」付费节点已舍弃。
 * ============================================================ */

const http = require("http");
const fs = require("fs");
const path = require("path");

const APP_DIR = __dirname;
const isPackaged = typeof process.pkg !== "undefined";
const DATA_DIR = isPackaged ? path.dirname(process.execPath) : APP_DIR;
const OUTPUT_DIR = path.join(DATA_DIR, "output");
const ENV_FILE = path.join(DATA_DIR, ".env");

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const PORT = parseInt(process.env.PORT || "8788", 10);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

/* ---------- 内置 SVG 图标库（图模型缺省/失败时兜底，保证卡片永远能渲染） ---------- */
const ICONS = {
  brain: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12c-4 0-7 3-7 7 0 2-1 3-1 5s1 3 1 5c0 4 3 7 7 7 2 0 3-1 4-1"/><path d="M29 12c4 0 7 3 7 7 0 2 1 3 1 5s-1 3-1 5c0 4-3 7-7 7-2 0-3-1-4-1"/><path d="M24 12v23M20 19c2 1 3 3 3 5M28 19c-2 1-3 3-3 5M21 30c2 1 3 2 3 4M27 30c-2 1-3 2-3 4"/></svg>',
  bolt: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M26 6 14 26h9l-3 16 14-22h-9z"/></svg>',
  gear: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="24" r="7"/><path d="M24 4v6M24 38v6M4 24h6M38 24h6M9 9l4 4M35 35l4 4M39 9l-4 4M13 35l-4 4"/></svg>',
  resistor: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 24h6l3-7 6 14 6-14 3 7h8"/></svg>',
  clock: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="24" r="17"/><path d="M24 14v10l7 5"/></svg>',
  water: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M24 6c6 8 11 14 11 20a11 11 0 0 1-22 0c0-6 5-12 11-20z"/></svg>',
  drop: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M24 6c6 8 11 14 11 20a11 11 0 0 1-22 0c0-6 5-12 11-20z"/></svg>',
  fire: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M24 6c2 8-4 10-4 17a6 6 0 0 0 12 0c0-4-3-7-4-10 4 2 7 6 7 11a11 11 0 0 1-22 0c0-9 9-13 11-18z"/></svg>',
  heart: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M24 40C10 30 7 21 12 15c4-5 11-3 12 3 1-6 8-8 12-3 5 6 2 15-12 25z"/></svg>',
  star: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M24 6l5 12 13 1-10 9 3 13-11-7-11 7 3-13-10-9 13-1z"/></svg>',
  book: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M24 12c-5-4-12-4-16-2v26c4-2 11-2 16 2 5-4 12-4 16-2V10c-4-2-11-2-16 2z"/><path d="M24 12v26"/></svg>',
  leaf: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10 38C10 20 24 8 40 8c0 18-14 30-30 30z"/><path d="M10 38C18 28 28 20 38 14"/></svg>',
  magnet: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v14a12 12 0 0 0 24 0V8"/><path d="M12 8h8v14a4 4 0 0 0 8 0V8h8"/></svg>',
  atom: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="24" r="3" fill="#222"/><ellipse cx="24" cy="24" rx="18" ry="8"/><ellipse cx="24" cy="24" rx="18" ry="8" transform="rotate(60 24 24)"/><ellipse cx="24" cy="24" rx="18" ry="8" transform="rotate(120 24 24)"/></svg>',
  wave: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 24c4-8 8 8 12 0s8-8 12 0 8 8 12 0"/></svg>',
  bulb: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M16 30a12 12 0 1 1 16 0c-2 2-2 4-2 6H18c0-2 0-4-2-6z"/><path d="M20 40h8M21 44h6"/></svg>',
  lightbulb: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M16 30a12 12 0 1 1 16 0c-2 2-2 4-2 6H18c0-2 0-4-2-6z"/><path d="M20 40h8M21 44h6"/></svg>',
  sun: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="24" r="9"/><path d="M24 4v6M24 38v6M4 24h6M38 24h6M9 9l4 4M35 35l4 4M39 9l-4 4M13 35l-4 4"/></svg>',
  moon: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M30 6a18 18 0 1 0 12 30A14 14 0 0 1 30 6z"/></svg>',
  plant: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M24 40V22"/><path d="M24 22c0-8-6-12-12-12 0 8 6 12 12 12zM24 26c0-7 6-10 12-10 0 7-6 10-12 10z"/><path d="M16 40h16"/></svg>',
  shield: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M24 6l14 5v11c0 11-7 17-14 20-7-3-14-9-14-20V11z"/></svg>',
  recycle: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M24 12l5 8h-4zM16 34l5-8M32 34l-5-8M19 26l-5-9h4M29 26l5-9h-4M18 40h12"/></svg>',
  robot: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="12" y="16" width="24" height="20" rx="4"/><path d="M24 16V8M21 8h6"/><circle cx="19" cy="25" r="2.5"/><circle cx="29" cy="25" r="2.5"/><path d="M18 32h12"/></svg>',
  car: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 30l4-10h22l6 10v6H6z"/><circle cx="15" cy="36" r="4"/><circle cx="35" cy="36" r="4"/><path d="M14 20h16"/></svg>',
  phone: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 8c-2 0-3 1-3 4v24c0 3 1 4 3 4h20c2 0 3-1 3-4V12c0-3-1-4-3-4z"/><path d="M20 36h8"/></svg>',
  computer: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="10" width="32" height="22" rx="2"/><path d="M16 40h16M24 32v8"/></svg>',
  kettle: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h22v10a8 8 0 0 1-8 8h-6a8 8 0 0 1-8-8z"/><path d="M34 22l6-4M14 20c0-6 4-8 8-8M20 12V8"/></svg>',
  fuse: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="10" y="18" width="28" height="12" rx="2"/><path d="M10 24h6M32 24h6M16 24l4-4 4 8 4-8 4 4"/></svg>',
  motor: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="24" r="14"/><circle cx="24" cy="24" r="5"/><path d="M24 10v6M24 32v6M10 24h6M32 24h6"/></svg>',
  battery: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="10" y="14" width="28" height="20" rx="2"/><path d="M38 20v8M16 24h6l-3 5"/></svg>',
  thermometer: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 28V10a4 4 0 0 1 8 0v18a8 8 0 1 1-8 0z"/><circle cx="24" cy="34" r="4"/></svg>',
  scale: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14h28M24 14v22M14 38h20"/><path d="M10 14l-4 6h8zM38 14l-4 6h8z"/></svg>',
  eye: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 24c6-10 30-10 36 0-6 10-30 10-36 0z"/><circle cx="24" cy="24" r="5"/></svg>',
  hand: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 24V12a3 3 0 0 1 6 0v10M24 22V10a3 3 0 0 1 6 0v12M30 22V14a3 3 0 0 1 6 0v14a12 12 0 0 1-12 12 12 12 0 0 1-12-12v-2a3 3 0 0 1 6 0"/></svg>',
  cloud: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 34a8 8 0 0 1 0-16 10 10 0 0 1 19 3 7 7 0 0 1-1 13z"/></svg>',
  arrow: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M24 40V10M12 22l12-12 12 12"/></svg>',
  check: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 25l9 9 19-20"/></svg>',
  lock: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="12" y="20" width="24" height="20" rx="3"/><path d="M16 20v-5a8 8 0 0 1 16 0v5"/><circle cx="24" cy="29" r="2.5"/></svg>',
  key: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="16" cy="16" r="7"/><path d="M21 21l14 14M30 32l4-4M34 36l4-4"/></svg>',
  globe: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="24" r="17"/><path d="M7 24h34M24 7c6 6 6 28 0 34M24 7c-6 6-6 28 0 34"/></svg>',
  earth: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="24" r="17"/><path d="M7 24h34M24 7c6 6 6 28 0 34M24 7c-6 6-6 28 0 34"/></svg>',
  rocket: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M24 6c8 4 10 14 8 22l-8 8-8-8c-2-8 0-18 8-22z"/><circle cx="24" cy="20" r="3"/><path d="M16 30l-6 6M32 30l6 6"/></svg>',
  question: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 16a6 6 0 0 1 12 0c0 4-3 5-6 8"/><circle cx="24" cy="36" r="1.6" fill="#222"/></svg>',
  signal: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 32h4v6h-4zM20 24h4v14h-4zM28 16h4v22h-4zM36 8h4v30h-4z"/></svg>',
  network: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="10" r="4"/><circle cx="10" cy="38" r="4"/><circle cx="38" cy="38" r="4"/><path d="M24 14v8M22 22l-10 14M26 22l10 14"/></svg>',
  chip: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="14" y="14" width="20" height="20" rx="2"/><path d="M19 14v-4M24 14v-4M29 14v-4M19 38v4M24 38v4M29 38v4M14 19h-4M14 24h-4M14 29h-4M38 19h4M38 24h4M38 29h4"/><rect x="20" y="20" width="8" height="8"/></svg>',
  money: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="24" r="17"/><path d="M24 16v16M20 20h8M20 28h8"/></svg>',
  tool: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M30 12a8 8 0 0 0-10 10L10 32l6 6 10-10a8 8 0 0 0 10-10l-6 6-6-6z"/></svg>',
  music: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 32V12l16-4v20"/><circle cx="14" cy="34" r="4"/><circle cx="30" cy="30" r="4"/></svg>',
  camera: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="16" width="32" height="24" rx="3"/><path d="M18 16l3-5h6l3 5"/><circle cx="24" cy="28" r="6"/></svg>',
  smile: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="24" r="17"/><path d="M17 21h.01M31 21h.01M16 30c4 5 12 5 16 0"/></svg>',
  people: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="17" cy="16" r="5"/><path d="M8 38c0-7 4-11 9-11s9 4 9 11"/><circle cx="33" cy="18" r="4"/><path d="M28 38c0-6 3-9 7-9s5 3 5 9"/></svg>',
  building: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="12" y="10" width="24" height="30"/><path d="M18 18h4M26 18h4M18 26h4M26 26h4M18 34h4M26 34h4"/></svg>',
  tree: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M24 6l10 16H14zM24 18l9 14H15zM24 32v10"/></svg>',
  fish: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 24c6-8 18-8 26 0-8 8-20 8-26 0z"/><path d="M34 24l8-6v12zM16 22h.01M16 26h.01"/></svg>',
  bird: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10 28c8-10 20-10 28 0M10 28c4 2 8 2 12 0M38 28c-4 2-8 2-12 0"/><circle cx="36" cy="22" r="1.4" fill="#222"/></svg>',
  food: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8v12a4 4 0 0 0 8 0V8M20 24v16M28 8c0 6 4 8 4 14a4 4 0 0 1-8 0"/></svg>',
  medicine: '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="10" y="14" width="28" height="20" rx="10"/><path d="M24 14v20M14 24h6M28 24h6"/></svg>',
};

// 通用兜底图标（图标名不在库中时，画一个带文字的圆，永远可用）
function genericIcon(label) {
  const txt = String(label || "?").replace(/[<>&]/g, "").slice(0, 4);
  return '<svg viewBox="0 0 48 48" fill="none" stroke="#222" stroke-width="2.4">' +
    '<circle cx="24" cy="24" r="20" fill="#fff"/>' +
    '<text x="24" y="28" text-anchor="middle" font-size="12" fill="#222" ' +
    'font-family="PingFang SC,Microsoft YaHei,sans-serif">' + txt + '</text></svg>';
}

// 取某个插槽的插图 HTML：优先用图模型生成的 dataUri，否则用内置 SVG
function slotHtml(iconName, label, mediaDataUri) {
  if (mediaDataUri) {
    return '<img src="' + mediaDataUri + '" alt="' + (label || "") + '" />';
  }
  const svg = ICONS[String(iconName || "").toLowerCase()] || genericIcon(label);
  return svg;
}

/* ---------- 火柴人简笔（内联 SVG，复用，零成本） ---------- */
const STICK_SMALL =
  '<svg viewBox="0 0 110 185" width="60" height="101" xmlns="http://www.w3.org/2000/svg">' +
  '<g fill="none" stroke="#222" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M40 18 Q55 8 70 18"/><path d="M44 14 L48 22"/><path d="M55 11 L55 21"/><path d="M64 14 L60 22"/>' +
  '<circle cx="55" cy="36" r="21"/>' +
  '<line x1="55" y1="57" x2="55" y2="122"/><line x1="55" y1="69" x2="22" y2="42"/><line x1="55" y1="69" x2="86" y2="96"/>' +
  '<line x1="55" y1="122" x2="38" y2="172"/><line x1="55" y1="122" x2="74" y2="172"/>' +
  '</g></svg>';
const STICK_LARGE =
  '<svg viewBox="0 0 110 185" width="76" height="128" xmlns="http://www.w3.org/2000/svg">' +
  '<g fill="none" stroke="#222" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M40 18 Q55 8 70 18"/><path d="M44 14 L48 22"/><path d="M55 11 L55 21"/><path d="M64 14 L60 22"/>' +
  '<circle cx="55" cy="36" r="21"/>' +
  '<line x1="55" y1="57" x2="55" y2="122"/><line x1="55" y1="69" x2="22" y2="42"/><line x1="55" y1="69" x2="86" y2="96"/>' +
  '<line x1="55" y1="122" x2="38" y2="172"/><line x1="55" y1="122" x2="74" y2="172"/>' +
  '</g></svg>';

/* ---------- 工具 ---------- */
function loadDotEnv() {
  const extra = {};
  try {
    if (fs.existsSync(ENV_FILE)) {
      const txt = fs.readFileSync(ENV_FILE, "utf-8");
      txt.split(/\r?\n/).forEach((line) => {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (m) extra[m[1]] = m[2].replace(/^["']|["']$/g, "");
      });
    }
  } catch (e) { /* 忽略 */ }
  return extra;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const buf = Buffer.concat(chunks);
      const ct = req.headers["content-type"] || "";
      if (ct.includes("application/json")) {
        try { resolve(JSON.parse(buf.toString("utf-8"))); }
        catch (e) { reject(e); }
      } else {
        resolve(buf.toString("utf-8"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(obj));
}

function safeJoin(base, urlPath) {
  const target = path.normalize(path.join(base, urlPath));
  if (!target.startsWith(base)) return null;
  return target;
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(data);
  });
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
// 文本中的 $公式$ 转成高亮样式
function fmtText(s) {
  return escapeHtml(s).replace(/\$([^$]+)\$/g, '<span class="formula">$1</span>');
}

function sendSSE(res, event, data) {
  res.write("event: " + event + "\ndata: " + JSON.stringify(data) + "\n\n");
}

/* ---------- API Base 归一化：无版本号时自动补 /v1，已有 /vN 则直接追加端点 ---------- */
function normalizeApiBase(base) {
  base = (base || "").replace(/\/+$/, "");
  if (!base) return "";
  return /\/v\d+(\/|$)/i.test(base) ? base : base + "/v1";
}

/* ---------- Coze 工作流「图片提示词」节点 systemPrompt（原样移植，国风插画提示词核心） ---------- */
const COZE_IMAGE_SYSTEM = `# 角色
你是一位兼具中国传统绘画专业性与教育传播经验的AI，担任中小学艺术教育顾问及传统美学画师，精通工笔、水墨、年画、青绿山水等多种中国风绘画技法，擅长将抽象知识转化为具象、生动的传统艺术视觉表现形式。

## 技能
### 技能 1: 知识点分析与关键词提取
1. **拆解核心概念**：收到用户输入后，先提取关键词（如学科、主题、核心元素、抽象程度），明确知识点类型（如数学公式、历史事件、自然现象、语文古诗等）。
   - 示例：用户输入“画二十四节气的‘夏至’”→核心概念：节气（夏至）+自然现象（白昼最长）+民俗活动（吃凉面、祭神）
2. **适配受众认知**：根据常见中小学教育场景（小学/初中），调整知识点复杂度的可视化方式（如小学侧重具象符号，初中可加入数据/公式元素）。

### 技能 2: 中国风绘画技法匹配
1. **技法选择规则**：
   - **工笔画**：适合细腻类知识点（如“细胞结构”用工笔画细胞壁/叶绿体，线条工整）；
   - **水墨写意**：适合抽象概念（如“相对论”用水墨晕染表现时空交错）；
   - **年画**：适合民俗/节日主题（如“春节”用杨柳青年画，色彩鲜艳）；
   - **青绿山水**：适合自然科学（如“植物光合作用”用青绿山水表现山川草木）
2. **传统美学融合**：确保技法适配历史文化背景（如“丝绸之路”用敦煌壁画风格，含飞天/骆驼商队元素）。

### 技能 3: 知识点插画提示词构建
生成包含以下结构化信息的提示词文本：
- **技法类型**：明确标注绘画技法（如“工笔重彩年画风格”）；
- **主体元素**：核心知识点具象化（如“拟人化的地球模型+太阳光线”）；
- **辅助元素**：知识点相关延伸符号（如“地球公转轨道用金色线条，旁标‘365天’”）；
- **色彩基调**：传统色卡选择（如朱砂红/石青/藤黄/花青）；
- **构图原则**：参考传统画谱（如“三远法”“对称构图”“留白技巧”）；
- **教育性细节**：用学生易懂的简化标注（如“三角形内角和=180°”以书法字标注在角落）。

### 技能 4: 教育场景反馈优化
1. **学科知识校准**：涉及数理化等学科时，确保公式/原理准确性（如“勾股定理”需标注“直角三角形两直角边平方和=斜边平方”）；
2. **互动元素设计**：添加学生熟悉的角色（如“穿汉服的古代学生在观察实验”）增强代入感。

===回复示例===
用户输入：用年画风格画“‘三角形内角和’的知识点”
生成提示词：
- 技法类型：杨柳青年画风格（色彩明艳，线条粗犷）
- 主体元素：拟人化的三角形人物（∠A/∠B/∠C分别戴红/蓝/绿头巾，手牵在一起），中央是180°平角量角器（金色边框）
- 辅助元素：三个小太阳分别标注“∠A=60°”“∠B=50°”“∠C=70°”，背景有“3+2=5”的算术等式（呼应内角和公式）
- 色彩基调：主色大红+明黄，点缀翠绿（三角形轮廓描金）
- 构图原则：圆形对称构图（人物围绕量角器，背景留白处写“三角形内角和=180°”楷体小字）
- 教育性细节：画中人物脚下有“小学知识”四字印章，量角器边缘有“*内角和=平角”的提示

## 限制
- 拒绝无明确知识点的绘画请求（如“画一只猫”需补充关联教育场景）；
- 提示词必须包含至少3个传统元素（祥云/回纹/书法题字）；
- 学科概念需符合中小学教材标准（如避免超纲知识表述）；
- 色彩饱和度≤70%（避免视觉疲劳，适配印刷/印刷需求）；
- 仅输出纯文本格式的绘画提示词，不生成图像。`;

/* ---------- LLM 调用（OpenAI 兼容 /chat/completions） ---------- */
function buildContentPrompt(topic, grade) {
  const iconList = Object.keys(ICONS).join(", ");
  return [
    "你是一个帮中小学生做「中国风传统知识卡片」的助教。用户会给你一个知识点和学段（小学/初中/高中）。",
    "请生成一张国风知识卡片数据，严格按照下面的 JSON 格式输出，不要输出任何额外文字，也不要加 markdown 代码块。",
    "",
    "字段说明：",
    "- title: 知识点名称（中文，简短，有文化味）",
    "- subtitle: 一句典雅的中文副标题（可附拼音或英文，如「Zhī shí diǎn · A Drop of Knowledge」）",
    "- definition: 用适合该学段的语言解释这个知识点是什么（小学要生动口语化，初中清楚，高中准确；公式用 $ 包裹，例如 $Q=I^2Rt$；语气可带一点文言/国风口吻）",
    "- points: 2~4 个要点对象数组，每个 { label: 简短中文标签（2~6字）, text: 一句说明, icon: 从图标库选一个最贴切的英文名字 }",
    "- motto: 一句朗朗上口的中文口诀/金句，最好含古诗或俗语韵味，帮助记忆",
    "- seal: 印章文字（2~4 个汉字，如「国风」「知行」「格物」），放在卡片落款处",
    "",
    "图标库（icon 只能从这里面选）：",
    iconList,
    "",
    "输出示例（仅示意结构，内容要按用户知识点生成）：",
    JSON.stringify({
      title: "示例", subtitle: "Example", definition: "说明",
      points: [{ label: "要点一", text: "说明", icon: "book" }],
      motto: "金句", seal: "格物"
    }),
    "",
    "现在请生成：知识点=" + topic + "，学段=" + grade
  ].join("\n");
}

// 通用聊天补全（OpenAI 兼容）
async function chatCompletion(cfg, messages, opts) {
  opts = opts || {};
  const url = normalizeApiBase(cfg.base) + "/chat/completions";
  const headers = { "Content-Type": "application/json", "Authorization": "Bearer " + (cfg.key || "") };
  const body = { model: cfg.model || "gpt-4o-mini", messages, temperature: opts.temperature != null ? opts.temperature : 0.8 };
  if (opts.json) body.response_format = { type: "json_object" };
  try {
    const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    const text = await resp.text();
    if (!resp.ok) return { ok: false, error: "LLM 返回 HTTP " + resp.status + "：" + text.slice(0, 200) };
    let json; try { json = JSON.parse(text); } catch (e) { return { ok: false, error: "LLM 响应非 JSON：" + text.slice(0, 200) }; }
    const content = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
    if (!content) return { ok: false, error: "LLM 未返回内容" };
    return { ok: true, content };
  } catch (e) {
    return { ok: false, error: "LLM 请求失败：" + e.message };
  }
}

async function callLLM(cfg, topic, grade) {
  const messages = [
    { role: "system", content: "你是国风知识卡片生成助手，只输出 JSON。" },
    { role: "user", content: buildContentPrompt(topic, grade) },
  ];
  // 先尝试 json 模式，失败再退普通模式
  for (const withFmt of [true, false]) {
    const r = await chatCompletion(cfg, messages, { json: withFmt, temperature: 0.8 });
    if (r.ok) return r;
    if (withFmt) continue; // 可能不支持 response_format，重试普通模式
    return r;
  }
  return { ok: false, error: "LLM 调用失败" };
}

// 用 Coze「图片提示词」系统，把知识点转成国风插画提示词（纯文本）
async function callImagePromptLLM(cfg, topic) {
  const messages = [
    { role: "system", content: COZE_IMAGE_SYSTEM + "\n\n补充：你输出的提示词将用于现代文生图模型（多为英文优化），请以英文为主、保留中国风专有名词（如 Chinese traditional woodblock New Year print style, ink wash painting, blue-green landscape），并确保可直接作为图像模型 prompt。" },
    { role: "user", content: topic },
  ];
  return chatCompletion(cfg, messages, { temperature: 0.6 });
}

function extractJSON(content) {
  try { return JSON.parse(content); } catch (e) { /* 尝试抠出 JSON 片段 */ }
  const s = content.indexOf("{");
  const e = content.lastIndexOf("}");
  if (s >= 0 && e > s) {
    try { return JSON.parse(content.slice(s, e + 1)); } catch (e2) { return null; }
  }
  return null;
}

/* ---------- 图模型调用（OpenAI 兼容 /images/generations） ---------- */
async function genImage(cfg, prompt) {
  const url = normalizeApiBase(cfg.base) + "/images/generations";
  const size = cfg.size || "1024x1024";
  const headers = { "Content-Type": "application/json", "Authorization": "Bearer " + (cfg.key || "") };
  const body = { model: cfg.model || "dall-e-3", prompt, n: 1, size, response_format: "b64_json" };
  try {
    const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    const j = await resp.json().catch(() => ({}));
    if (!resp.ok) return { ok: false, error: "图模型 HTTP " + resp.status + "：" + JSON.stringify(j).slice(0, 160) };
    const item = (j.data && j.data[0]) || {};
    if (item.b64_json) return { ok: true, dataUri: "data:image/png;base64," + item.b64_json };
    if (item.url) {
      // 返回的是 URL，后端拉取转 base64，保证卡片自包含
      try {
        const r2 = await fetch(item.url);
        const buf = Buffer.from(await r2.arrayBuffer());
        return { ok: true, dataUri: "data:image/png;base64," + buf.toString("base64") };
      } catch (e) { return { ok: false, error: "图模型返回 URL 但拉取失败：" + e.message }; }
    }
    return { ok: false, error: "图模型返回格式异常" };
  } catch (e) {
    return { ok: false, error: "图模型请求失败：" + e.message };
  }
}

/* ---------- 国风简笔占位插画（无图模型时使用） ---------- */
const GF_HERO_PLACEHOLDER = '<svg viewBox="0 0 600 320" xmlns="http://www.w3.org/2000/svg">'
  + '<rect width="600" height="320" fill="#efe6d2"/>'
  + '<circle cx="468" cy="82" r="34" fill="#c8503a" opacity="0.82"/>'
  + '<path d="M0 250 Q150 182 300 240 T600 230 V320 H0 Z" fill="#9bbf9b" opacity="0.45"/>'
  + '<path d="M0 272 Q160 212 320 266 T600 260 V320 H0 Z" fill="#6f9e74" opacity="0.5"/>'
  + '<g fill="none" stroke="#b89b6e" stroke-width="2" opacity="0.85">'
  + '<path d="M64 70 q20 -18 40 0 q20 -18 40 0 q-10 18 -40 10 q-30 8 -40 -10z"/>'
  + '<path d="M118 112 q14 -12 28 0 q14 -12 28 0 q-7 12 -28 7 q-21 5 -28 -7z"/></g>'
  + '<text x="300" y="302" text-anchor="middle" font-family="KaiTi,STKaiti,serif" font-size="15" fill="#7a5a32">国风简笔 · 在「设置」配置图模型可换 AI 插画</text>'
  + '</svg>';

/* ---------- 拼装自包含 HTML 卡片（国风） ---------- */
function buildCard(data, heroUri) {
  const points = Array.isArray(data.points) ? data.points.slice(0, 4) : [];
  const pointRows = points.map((p) =>
    '<div class="gf-point">'
      + '<div class="gf-pt-ic">' + slotHtml(p.icon, p.label, null) + '</div>'
      + '<div class="gf-pt-body"><div class="gf-pt-label">' + escapeHtml(p.label || "") + '</div>'
      + '<div class="gf-pt-text">' + fmtText(p.text || "") + '</div></div>'
    + '</div>'
  ).join("");

  const hero = heroUri ? '<img src="' + heroUri + '" alt="国风插画">' : GF_HERO_PLACEHOLDER;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(data.title)} —— 国风知识卡片</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#e9dcc0;font-family:"Songti SC","SimSun","STSong",serif;display:flex;justify-content:center;align-items:flex-start;padding:28px 10px;min-height:100vh;color:#2b2118}
  .gf-card{width:100%;max-width:760px;background:#f7efd9;background-image:radial-gradient(circle at 20% 20%,rgba(255,255,255,.5) 0,transparent 60%),radial-gradient(circle at 80% 80%,rgba(200,170,120,.18) 0,transparent 55%);border:2px solid #6b4a2b;border-radius:6px;padding:30px 26px 22px;position:relative;box-shadow:0 10px 30px rgba(80,50,20,.25)}
  .gf-card:before{content:"";position:absolute;inset:7px;border:1px solid #b89b6e;pointer-events:none}
  .gf-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
  .gf-title{font-family:"Kaiti SC","STKaiti","KaiTi",serif;font-size:34px;font-weight:700;color:#3a2a18;letter-spacing:4px;line-height:1.25}
  .gf-seal{writing-mode:vertical-rl;background:#9e2b25;color:#f7efd9;font-family:"Kaiti SC","STKaiti",serif;font-size:18px;letter-spacing:3px;padding:10px 7px;border-radius:4px;box-shadow:0 2px 6px rgba(120,30,20,.4);flex:0 0 auto}
  .gf-sub{font-size:14px;color:#7a5a32;margin:6px 0 18px;letter-spacing:2px;font-style:italic}
  .gf-hero{width:100%;border:1px solid #c9b48f;background:#efe6d2;border-radius:4px;overflow:hidden;display:flex;justify-content:center;align-items:center;min-height:200px;margin-bottom:18px}
  .gf-hero img{width:100%;height:auto;display:block}
  .gf-hero svg{width:100%;height:auto;display:block}
  .gf-sec{font-family:"Kaiti SC","STKaiti",serif;font-size:16px;font-weight:700;color:#9e2b25;letter-spacing:6px;margin:14px 0 8px;border-left:4px solid #9e2b25;padding-left:8px}
  .gf-def{font-size:14.5px;line-height:1.95;color:#33281c;text-align:justify;text-indent:2em}
  .formula{background:#f3e2c0;color:#9e2b25;padding:0 5px;border-radius:3px;font-style:italic;font-family:"Cambria Math",serif}
  .gf-point{display:flex;gap:10px;align-items:flex-start;padding:9px 0;border-bottom:1px dashed #d8c79f}
  .gf-pt-ic{flex:0 0 40px;width:40px;height:40px;border:1px solid #b89b6e;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#fffaf0;overflow:hidden}
  .gf-pt-ic img,.gf-pt-ic svg{width:28px;height:28px;object-fit:contain;display:block}
  .gf-pt-label{font-weight:700;color:#9e2b25;font-size:14.5px;margin-bottom:2px}
  .gf-pt-text{font-size:13.5px;line-height:1.7;color:#33281c}
  .gf-motto{text-align:center;font-family:"Kaiti SC","STKaiti",serif;font-size:17px;color:#3a2a18;background:#f3e2c0;border:1px solid #d8b97a;border-radius:6px;padding:12px;margin:16px 0;letter-spacing:2px}
  .gf-foot{display:flex;align-items:center;justify-content:space-between;margin-top:10px;padding-top:10px;border-top:1px solid #d8c79f;font-size:12px;color:#7a5a32;letter-spacing:1px}
  .gf-foot .stamp{writing-mode:vertical-rl;background:#9e2b25;color:#f7efd9;font-family:"Kaiti SC",serif;font-size:13px;letter-spacing:2px;padding:6px 4px;border-radius:3px}
  @media(max-width:640px){.gf-title{font-size:26px}.gf-card{padding:22px 14px 16px}}
</style>
</head>
<body>
<div class="gf-card">
  <div class="gf-top">
    <div class="gf-title">${escapeHtml(data.title)}</div>
    <div class="gf-seal">${escapeHtml(data.seal || "国风")}</div>
  </div>
  <div class="gf-sub">${escapeHtml(data.subtitle)}</div>
  <div class="gf-hero">${hero}</div>
  <div class="gf-sec">释 义</div>
  <div class="gf-def">${fmtText(data.definition)}</div>
  <div class="gf-sec">要 点</div>
  <div class="gf-points">${pointRows}</div>
  <div class="gf-motto">${escapeHtml(data.motto)}</div>
  <div class="gf-foot"><span>国风知识卡片 · ${escapeHtml(data.seal || "")}</span><span class="stamp">${escapeHtml(data.seal || "国风")}</span></div>
</div>
</body>
</html>`;
}

/* ---------- /api/generate (SSE) ---------- */
async function apiGenerate(body, req, res) {
  const topic = (body.topic || "").trim();
  const grade = (body.grade || "初中").trim();
  const mode = (body.mode || "svg") === "image" ? "image" : "svg";
  if (!topic) { sendSSE(res, "error", { msg: "请先输入要生成的知识点" }); return; }

  const env = loadDotEnv();
  const llmCfg = {
    base: body.llm_base || env.LLM_BASE_URL,
    key: body.llm_key || env.LLM_API_KEY,
    model: body.llm_model || env.LLM_MODEL,
  };
  const imgCfg = {
    base: body.img_base || env.IMG_BASE_URL,
    key: body.img_key || env.IMG_API_KEY,
    model: body.img_model || env.IMG_MODEL,
    size: body.img_size || env.IMG_SIZE,
  };

  if (!llmCfg.base || !llmCfg.key) {
    sendSSE(res, "error", { msg: "尚未配置 LLM：点击右上角 ⚙ 填写「模型地址 / API Key / 模型名」并保存。" });
    return;
  }

  let aborted = false;
  req.on("close", () => { aborted = true; });

  sendSSE(res, "log", { msg: "正在让 AI 理解「" + topic + "」(" + grade + ") …" });
  sendSSE(res, "progress", { pct: 8, label: "调用大模型生成卡片内容" });

  const llm = await callLLM(llmCfg, topic, grade);
  if (aborted) return;
  if (!llm.ok) { sendSSE(res, "error", { msg: llm.error }); return; }

  const data = extractJSON(llm.content);
  if (!data || !data.title) { sendSSE(res, "error", { msg: "AI 返回内容无法解析为卡片结构，请重试或更换模型。" }); return; }

  sendSSE(res, "log", { msg: "✓ 卡片文案已生成：" + (data.title || topic) });
  sendSSE(res, "progress", { pct: 35, label: "文案生成完成" });

  // 国风插画：image 模式且有图模型配置才调用
  let heroUri = null;
  const useImage = mode === "image" && imgCfg.base && imgCfg.key;
  if (useImage) {
    sendSSE(res, "log", { msg: "正在用「国风插画提示词」生成绘画提示词…" });
    sendSSE(res, "progress", { pct: 50, label: "生成国风插画提示词" });
    const ip = await callImagePromptLLM(llmCfg, topic);
    if (aborted) return;
    if (!ip.ok) {
      sendSSE(res, "log", { msg: "⚠ 插画提示词生成失败，改用国风简笔占位：" + ip.error.slice(0, 80) });
    } else {
      sendSSE(res, "log", { msg: "✓ 插画提示词已生成，正在调用图模型…" });
      sendSSE(res, "progress", { pct: 65, label: "生成国风插画" });
      const r = await genImage(imgCfg, ip.content.trim());
      if (aborted) return;
      if (r.ok) { heroUri = r.dataUri; sendSSE(res, "log", { msg: "✓ 国风插画完成" }); }
      else sendSSE(res, "log", { msg: "⚠ 插画生成失败，改用国风简笔占位：" + r.error.slice(0, 80) });
      sendSSE(res, "progress", { pct: 90, label: "插画生成完成" });
    }
  } else {
    sendSSE(res, "log", { msg: "使用「国风简笔」占位图：内置矢量插画，零成本、永远能渲染。想用 AI 画图请在右上角 ⚙ 配置「图模型」。" });
    sendSSE(res, "progress", { pct: 85, label: "拼装卡片" });
  }

  if (aborted) return;
  sendSSE(res, "log", { msg: "正在拼装自包含 HTML 卡片…" });
  const html = buildCard(data, heroUri);

  // 落盘一份到 output/
  const safeName = (data.title || topic).replace(/[\\/:*?"<>|]/g, "_").slice(0, 40);
  const fileName = safeName + "_" + Date.now().toString().slice(-8) + ".html";
  const filePath = path.join(OUTPUT_DIR, fileName);
  try { fs.writeFileSync(filePath, html, "utf-8"); } catch (e) { /* 忽略 */ }

  sendSSE(res, "progress", { pct: 100, label: "完成" });
  sendSSE(res, "done", { html, file: "/files/" + encodeURIComponent(fileName), title: data.title || topic });
  sendSSE(res, "log", { msg: "🎉 卡片已生成！可在右侧预览、下载或新窗口打开。" });
}

/* ---------- /api/set-keys ---------- */
function apiGetKeys(res) {
  const extra = loadDotEnv();
  const keys = ["LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL", "IMG_BASE_URL", "IMG_API_KEY", "IMG_MODEL", "IMG_SIZE"];
  // 非密钥字段（地址/模型/尺寸）不涉及隐私，原样返回以便前端回填并识别服务商；
  // 仅 API Key 做脱敏展示。
  const NON_SECRET = new Set(["LLM_BASE_URL", "LLM_MODEL", "IMG_BASE_URL", "IMG_MODEL", "IMG_SIZE"]);
  const masked = {};
  keys.forEach((k) => {
    const v = extra[k] || "";
    if (NON_SECRET.has(k)) masked[k] = v;
    else masked[k] = v.length > 8 ? v.slice(0, 4) + "****" + v.slice(-2) : (v ? "****" : "");
  });
  sendJson(res, 200, { ok: true, keys: masked });
}

function apiSetKeys(body, res) {
  try {
    const keys = body.keys || {};
    if (typeof keys !== "object" || Array.isArray(keys)) {
      return sendJson(res, 400, { ok: false, error: "keys 必须是对象" });
    }
    let existing = "";
    try { if (fs.existsSync(ENV_FILE)) existing = fs.readFileSync(ENV_FILE, "utf-8"); } catch (_) {}
    const lines = existing.split(/\r?\n/);
    const updated = [];
    const written = new Set();
    const allow = ["LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL", "IMG_BASE_URL", "IMG_API_KEY", "IMG_MODEL", "IMG_SIZE"];
    for (const line of lines) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      if (m && allow.includes(m[1]) && keys[m[1]] !== undefined) {
        const val = String(keys[m[1]]);
        updated.push(m[1] + '="' + val.replace(/"/g, "") + '"');
        written.add(m[1]);
      } else if (line.trim()) {
        updated.push(line);
      }
    }
    for (const [k, v] of Object.entries(keys)) {
      if (allow.includes(k) && !written.has(k) && v) updated.push(k + '="' + String(v).replace(/"/g, "") + '"');
    }
    fs.writeFileSync(ENV_FILE, updated.join("\r\n") + "\r\n", "utf-8");
    console.log("[Key 设置] 已写入 " + Object.keys(keys).join(", ") + " 到 " + ENV_FILE);
    sendJson(res, 200, { ok: true, saved: Object.keys(keys) });
  } catch (e) {
    sendJson(res, 500, { ok: false, error: e.message });
  }
}

/* ---------- /api/test ---------- */
async function apiTest(body, res) {
  const env = loadDotEnv();
  const cfg = {
    base: body.llm_base || env.LLM_BASE_URL,
    key: body.llm_key || env.LLM_API_KEY,
    model: body.llm_model || env.LLM_MODEL,
  };
  if (!cfg.base || !cfg.key) return sendJson(res, 400, { ok: false, error: "缺少 LLM 配置" });
  const r = await callLLM(cfg, "测试", "初中");
  if (r.ok) return sendJson(res, 200, { ok: true, msg: "连通成功，模型返回 " + (r.content || "").length + " 字" });
  return sendJson(res, 502, { ok: false, error: r.error });
}

/* ---------- /api/test-image ---------- */
async function apiTestImage(body, res) {
  const env = loadDotEnv();
  const cfg = {
    base: body.img_base || env.IMG_BASE_URL,
    key: body.img_key || env.IMG_API_KEY,
    model: body.img_model || env.IMG_MODEL,
    size: body.img_size || env.IMG_SIZE,
  };
  if (!cfg.base || !cfg.key) return sendJson(res, 400, { ok: false, error: "缺少图像模型配置（需要 Base URL 与 API Key）" });
  if (!cfg.model) return sendJson(res, 400, { ok: false, error: "缺少图像模型名（Model）" });
  const r = await genImage(cfg, "一张中国风红色印章，简洁留白，纯图案无文字");
  if (r.ok) return sendJson(res, 200, { ok: true, msg: "图像模型连通成功，已返回 " + (r.dataUri || "").length + " 字符的图片数据" });
  return sendJson(res, 502, { ok: false, error: r.error });
}

/* ---------- 主路由 ---------- */
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "*", "Access-Control-Max-Age": "86400" });
    res.end();
    return;
  }

  if (url.pathname === "/health" || url.pathname === "/api/health") {
    return sendJson(res, 200, { status: "ok" });
  }

  if (url.pathname === "/api/keys" && req.method === "GET") return apiGetKeys(res);
  if (url.pathname === "/api/set-keys" && req.method === "POST") {
    return readBody(req).then((b) => apiSetKeys(b, res)).catch((e) => sendJson(res, 400, { ok: false, error: e.message }));
  }
  if (url.pathname === "/api/test" && req.method === "POST") {
    return readBody(req).then((b) => apiTest(b, res)).catch((e) => sendJson(res, 400, { ok: false, error: e.message }));
  }
  if (url.pathname === "/api/test-image" && req.method === "POST") {
    return readBody(req).then((b) => apiTestImage(b, res)).catch((e) => sendJson(res, 400, { ok: false, error: e.message }));
  }

  if (url.pathname === "/api/generate" && req.method === "POST") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    return readBody(req).then((b) => apiGenerate(b, req, res)).catch((e) => {
      if (!res.headersSent) sendJson(res, 400, { ok: false, error: e.message });
      else sendSSE(res, "error", { msg: e.message });
    });
  }

  if (url.pathname.startsWith("/files/")) {
    const fp = safeJoin(OUTPUT_DIR, decodeURIComponent(url.pathname.slice("/files/".length)));
    if (!fp) { res.writeHead(403); res.end("Forbidden"); return; }
    return serveFile(res, fp);
  }

  const filePath = url.pathname === "/" ? "/index.html" : url.pathname;
  const fullPath = safeJoin(APP_DIR, filePath);
  if (!fullPath) { res.writeHead(403); res.end("Forbidden"); return; }
  serveFile(res, fullPath);
});

/* ---------- 启动（端口被占用自动 +1，最多 10 次） ---------- */
let attempts = 0;
function startServer(port) {
  server.once("error", (err) => {
    if (err.code === "EADDRINUSE" && attempts < 10) {
      attempts++;
      console.log("端口 " + port + " 被占用，尝试 " + (port + 1) + " ...");
      startServer(port + 1);
    } else {
      console.error("服务器启动失败:", err.message);
      process.exit(1);
    }
  });
  server.listen(port, "127.0.0.1", () => {
    const url = "http://127.0.0.1:" + port;
    console.log("================================================");
    console.log("  国风知识卡片 · 智能体 已启动");
    console.log("  " + url);
    console.log("  关闭本窗口即停止服务");
    console.log("================================================");
    const cmd =
      process.platform === "win32" ? 'start "" "' + url + '"'
      : process.platform === "darwin" ? 'open "' + url + '"'
      : 'xdg-open "' + url + '"';
    const { exec } = require("child_process");
    exec(cmd, (e) => { if (e) console.log("(请手动打开浏览器访问 " + url + ")"); });
  });
}
startServer(PORT);
