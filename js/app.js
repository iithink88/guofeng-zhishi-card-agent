/* 国风知识卡片 · 前端逻辑 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const el = {
    topic: $("topic"), chips: $("chips"), grade: $("grade"), mode: $("mode"), modeTip: $("modeTip"),
    pbar: $("pbar"), stepLabel: $("stepLabel"), log: $("log"),
    resultEmpty: $("resultEmpty"), preview: $("preview"), resultBtns: $("resultBtns"),
    dlBtn: $("dlBtn"), newBtn: $("newBtn"),
    clearBtn: $("clearBtn"), genBtn: $("genBtn"),
    setBtn: $("setBtn"), setOverlay: $("setOverlay"), setX: $("setX"),
    llm_base: $("llm_base"), llm_key: $("llm_key"), llm_model: $("llm_model"),
    llm_provider: $("llm_provider"), llmKeyLink: $("llmKeyLink"),
    img_base: $("img_base"), img_key: $("img_key"), img_model: $("img_model"), img_size: $("img_size"),
    img_provider: $("img_provider"), imgKeyLink: $("imgKeyLink"),
    saveBtn: $("saveBtn"), testBtn: $("testBtn"), testImgBtn: $("testImgBtn"), toast: $("toast"),
  };

  let curGrade = "初中";
  let curMode = "svg";
  let lastHtml = "";

  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.toast.classList.remove("show"), 2200);
  }

  function logLine(msg) {
    if (el.log.querySelector(".empty")) el.log.innerHTML = "";
    const d = document.createElement("div");
    d.textContent = "• " + msg;
    el.log.appendChild(d);
    el.log.scrollTop = el.log.scrollHeight;
  }

  function setProgress(pct, label) {
    el.pbar.style.width = Math.max(0, Math.min(100, pct)) + "%";
    if (label) el.stepLabel.textContent = label;
  }

  /* ---------- 示例 chips ---------- */
  el.chips.addEventListener("click", (e) => {
    const c = e.target.closest(".chip");
    if (c) { el.topic.value = c.dataset.t; el.topic.focus(); }
  });

  /* ---------- 分段选择 ---------- */
  function bindSeg(box, cb) {
    box.addEventListener("click", (e) => {
      const b = e.target.closest(".seg-btn");
      if (!b) return;
      box.querySelectorAll(".seg-btn").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      cb(b.dataset.v);
    });
  }
  bindSeg(el.grade, (v) => { curGrade = v; });
  bindSeg(el.mode, (v) => {
    curMode = v;
    el.modeTip.textContent = v === "image"
      ? "AI 图片模式：会用你配置的「图模型」生成每一张插图，更生动但会消耗额度；未配置或失败时自动退回简笔图标。"
      : "简笔模式用内置矢量图标，秒出图、零成本、永远能渲染。想用 AI 画图请在右上角 ⚙ 配置「图模型」。";
  });

  /* ---------- 设置弹窗 ---------- */
  function openSet() { el.setOverlay.classList.add("show"); loadKeys(); }
  function closeSet() { el.setOverlay.classList.remove("show"); }
  el.setBtn.addEventListener("click", openSet);
  el.setX.addEventListener("click", closeSet);
  el.setOverlay.addEventListener("click", (e) => { if (e.target === el.setOverlay) closeSet(); });

  /* ---------- 常用大模型 / 图模型服务商预设 ---------- */
  const LLM_PROVIDERS = {
    openai:     { base: "https://api.openai.com/v1",                     model: "gpt-4o-mini",                     keyUrl: "https://platform.openai.com/api-keys" },
    deepseek:   { base: "https://api.deepseek.com/v1",                  model: "deepseek-chat",                   keyUrl: "https://platform.deepseek.com/api_keys" },
    dashscope:  { base: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus",                  keyUrl: "https://dashscope.console.aliyun.com/apiKey" },
    zhipu:      { base: "https://open.bigmodel.cn/api/paas/v4",         model: "glm-4-flash",                     keyUrl: "https://open.bigmodel.cn/usercenter/apikeys" },
    moonshot:   { base: "https://api.moonshot.cn/v1",                   model: "moonshot-v1-8k",                  keyUrl: "https://platform.moonshot.cn/console/api-keys" },
    siliconflow:{ base: "https://api.siliconflow.cn/v1",                model: "Qwen/Qwen2.5-7B-Instruct",        keyUrl: "https://cloud.siliconflow.cn/account/ak" },
    volcengine: { base: "https://ark.cn-beijing.volces.com/api/v3",    model: "doubao-seed-1.6-250615",          keyUrl: "https://console.volcengine.com/ark/region/ark_cn-beijing/apiKey" },
    hunyuan:    { base: "https://api.hunyuan.cloud.tencent.com/v1",     model: "hunyuan-lite",                    keyUrl: "https://console.cloud.tencent.com/hunyuan/api-key" },
    ollama:     { base: "http://localhost:11434/v1",                    model: "llama3",                          keyUrl: "" },
  };
  const IMG_PROVIDERS = {
    openai:      { base: "https://api.openai.com/v1",                   model: "gpt-image-1",     size: "1024x1024", keyUrl: "https://platform.openai.com/api-keys" },
    siliconflow: { base: "https://api.siliconflow.cn/v1",              model: "Kwai-Kolors/Kolors", size: "1024x1024", keyUrl: "https://cloud.siliconflow.cn/account/ak" },
    dashscope:   { base: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "wanx2.1-t2i-turbo", size: "1024x1024", keyUrl: "https://dashscope.console.aliyun.com/apiKey" },
    volcengine:  { base: "https://ark.cn-beijing.volces.com/api/v3",   model: "",                 size: "1024x1024", keyUrl: "https://console.volcengine.com/ark/region/ark_cn-beijing/apiKey" },
  };

  function applyProvider(which, key) {
    const map = which === "llm" ? LLM_PROVIDERS : IMG_PROVIDERS;
    const p = map[key];
    const baseEl = which === "llm" ? el.llm_base : el.img_base;
    const modelEl = which === "llm" ? el.llm_model : el.img_model;
    const sizeEl = el.img_size;
    const linkEl = which === "llm" ? el.llmKeyLink : el.imgKeyLink;
    if (!p || key === "custom") { linkEl.style.display = "none"; return; }
    baseEl.value = p.base;
    if (!modelEl.value.trim() && p.model) modelEl.value = p.model;
    if (which === "img" && p.size && !sizeEl.value.trim()) sizeEl.value = p.size;
    if (p.keyUrl) {
      linkEl.href = p.keyUrl;
      linkEl.textContent = "🔗 去该服务商官网获取 API Key";
      linkEl.style.display = "inline-block";
    } else {
      linkEl.style.display = "none";
    }
  }

  function matchProvider(map, baseUrl) {
    if (!baseUrl) return "custom";
    const b = String(baseUrl).replace(/\/+$/, "");
    for (const key in map) {
      if (map[key].base && map[key].base.replace(/\/+$/, "") === b) return key;
    }
    return "custom";
  }

  el.llm_provider.addEventListener("change", (e) => applyProvider("llm", e.target.value));
  el.img_provider.addEventListener("change", (e) => applyProvider("img", e.target.value));

  async function loadKeys() {
    try {
      const r = await fetch("/api/keys");
      const j = await r.json();
      if (!j.keys) return;
      const k = j.keys;
      // 非密钥配置：原样回填 + 识别服务商
      if (k.LLM_BASE_URL) { el.llm_base.value = k.LLM_BASE_URL; el.llm_provider.value = matchProvider(LLM_PROVIDERS, k.LLM_BASE_URL); }
      if (k.LLM_MODEL) el.llm_model.value = k.LLM_MODEL;
      if (k.IMG_BASE_URL) { el.img_base.value = k.IMG_BASE_URL; el.img_provider.value = matchProvider(IMG_PROVIDERS, k.IMG_BASE_URL); }
      if (k.IMG_MODEL) el.img_model.value = k.IMG_MODEL;
      if (k.IMG_SIZE) el.img_size.value = k.IMG_SIZE;
      // API Key 为脱敏值：仅提示已保存，不回显明文（留空保存则保留原值）
      if (k.LLM_API_KEY) el.llm_key.placeholder = "已保存：" + k.LLM_API_KEY + "（留空则不改）";
      if (k.IMG_API_KEY) el.img_key.placeholder = "已保存：" + k.IMG_API_KEY + "（留空则不改）";
    } catch (e) { /* 忽略 */ }
  }

  el.saveBtn.addEventListener("click", async () => {
    const keys = {
      LLM_BASE_URL: el.llm_base.value.trim(),
      LLM_API_KEY: el.llm_key.value.trim(),
      LLM_MODEL: el.llm_model.value.trim(),
      IMG_BASE_URL: el.img_base.value.trim(),
      IMG_API_KEY: el.img_key.value.trim(),
      IMG_MODEL: el.img_model.value.trim(),
      IMG_SIZE: el.img_size.value.trim(),
    };
    // 去除空值，避免清掉其它已保存项
    Object.keys(keys).forEach((k) => { if (!keys[k]) delete keys[k]; });
    const r = await fetch("/api/set-keys", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keys }),
    });
    const j = await r.json();
    if (j.ok) { toast("✅ 已保存"); setTimeout(closeSet, 600); }
    else toast("保存失败：" + (j.error || ""));
  });

  el.testBtn.addEventListener("click", async () => {
    el.testBtn.textContent = "测试中…";
    el.testBtn.disabled = true;
    try {
      const r = await fetch("/api/test", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          llm_base: el.llm_base.value.trim(), llm_key: el.llm_key.value.trim(), llm_model: el.llm_model.value.trim(),
        }),
      });
      const j = await r.json();
      toast(j.ok ? "✅ " + (j.msg || "连通成功") : "❌ " + (j.error || "失败"));
    } catch (e) {
      toast("❌ 测试异常：连不上本地服务。请确认已双击「启动.bat」，且浏览器自动打开了 http://127.0.0.1:8788（" + e.message + "）");
    }
    finally { el.testBtn.textContent = "测试 LLM 连通"; el.testBtn.disabled = false; }
  });

  el.testImgBtn.addEventListener("click", async () => {
    el.testImgBtn.textContent = "测试中…";
    el.testImgBtn.disabled = true;
    try {
      const r = await fetch("/api/test-image", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          img_base: el.img_base.value.trim(), img_key: el.img_key.value.trim(),
          img_model: el.img_model.value.trim(), img_size: el.img_size.value.trim(),
        }),
      });
      const j = await r.json();
      toast(j.ok ? "✅ " + (j.msg || "图像模型连通成功") : "❌ " + (j.error || "失败"));
    } catch (e) {
      toast("❌ 测试异常：连不上本地服务。请确认已双击「启动.bat」，且浏览器自动打开了 http://127.0.0.1:8788（" + e.message + "）");
    }
    finally { el.testImgBtn.textContent = "测试图像模型连通"; el.testImgBtn.disabled = false; }
  });

  /* ---------- 生成（SSE） ---------- */
  let generating = false;
  el.genBtn.addEventListener("click", generate);

  async function generate() {
    if (generating) return;
    const topic = el.topic.value.trim();
    if (!topic) { toast("请先输入知识点～"); el.topic.focus(); return; }

    generating = true;
    el.genBtn.disabled = true;
    el.genBtn.textContent = "生成中…";
    el.log.innerHTML = "";
    setProgress(2, "准备中…");
    lastHtml = "";

    try {
      const resp = await fetch("/api/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, grade: curGrade, mode: curMode }),
      });
      if (!resp.ok) {
        let msg = "生成失败";
        try { const j = await resp.json(); msg = j.error || msg; } catch (e) {}
        logLine("❌ " + msg);
        toast("❌ " + msg);
        return;
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          handleSSE(block);
        }
      }
    } catch (e) {
      logLine("❌ 网络错误：" + e.message);
      toast("❌ 网络错误");
    } finally {
      generating = false;
      el.genBtn.disabled = false;
      el.genBtn.textContent = "🚀 开始生成";
    }
  }

  function handleSSE(block) {
    let event = "message", data = "";
    block.split("\n").forEach((line) => {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data += line.slice(5).trim();
    });
    if (!data) return;
    let obj;
    try { obj = JSON.parse(data); } catch (e) { return; }

    if (event === "log") logLine(obj.msg);
    else if (event === "progress") setProgress(obj.pct, obj.label);
    else if (event === "done") showResult(obj);
    else if (event === "error") { logLine("❌ " + obj.msg); toast("❌ " + obj.msg); }
  }

  function showResult(obj) {
    lastHtml = obj.html || "";
    el.resultEmpty.classList.add("hidden");
    el.preview.classList.remove("hidden");
    el.resultBtns.classList.remove("hidden");
    el.preview.srcdoc = lastHtml;
  }

  /* ---------- 下载 / 新窗口 ---------- */
  el.dlBtn.addEventListener("click", () => {
    if (!lastHtml) return;
    const blob = new Blob([lastHtml], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (el.topic.value.trim() || "知识卡片") + ".html";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast("⬇ 已开始下载");
  });

  el.newBtn.addEventListener("click", () => {
    if (!lastHtml) return;
    const w = window.open("", "_blank");
    if (w) { w.document.open(); w.document.write(lastHtml); w.document.close(); }
    else toast("浏览器拦截了弹窗，请允许后重试");
  });

  /* ---------- 清空 ---------- */
  el.clearBtn.addEventListener("click", () => {
    el.topic.value = "";
    el.log.innerHTML = '<span class="empty">等待生成…</span>';
    setProgress(0, "还没开始～");
    el.resultEmpty.classList.remove("hidden");
    el.preview.classList.add("hidden");
    el.resultBtns.classList.add("hidden");
    el.preview.srcdoc = "";
    lastHtml = "";
    toast("已清空");
  });
})();
