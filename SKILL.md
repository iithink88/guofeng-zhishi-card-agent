---
name: guofeng-zhishi-card-agent
description: |
  国风知识卡片智能体：将任意知识点转化为中国风传统主题插画风格的知识卡片。
  由扣子(Coze)工作流转换而来，宣纸为底、朱印落款、楷体标题。
  支持 OpenAI 兼容的 LLM 和图模型，内置国风简笔占位插画兜底。
  零依赖 Node 服务器，双击启动.bat 即用。
---

# 国风知识卡片 · 智能体

## 概述

将任意知识点转化为**中国风传统主题插画风格**的知识卡片。由扣子(Coze)工作流「知识卡片_中国风传统主题插画风格」转换而来。

## 工作流程

1. 用户输入知识点 + 学段（小学/初中/高中）
2. LLM 生成国风卡片文案（标题、释义、要点、口诀、印章文字）
3. （可选）Coze 原版 systemPrompt 驱动生成国风插画提示词 → 图模型生成插画
4. 拼装自包含 HTML 卡片（宣纸底色、朱红印章、楷体标题、墨色正文）
5. 落盘到 output/ + 前端预览 + 下载

## 启动方式

```bash
# 双击 启动.bat（自动探测 Node 运行时）
# 或命令行：
node server.js
```

默认端口 8788，被占用自动 +1。

## 配置

编辑 `.env`（复制 `.env.example`）：

```
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_API_KEY=sk-xxx
LLM_MODEL=deepseek-chat
IMG_BASE_URL=        # 可选
IMG_API_KEY=
IMG_MODEL=
IMG_SIZE=1024x1024
```

## Coze 工作流映射

| Coze 节点 | 本技能对应 |
|-----------|-----------|
| 开始节点（输入知识点） | 前端输入框 |
| 图片提示词（LLM systemPrompt） | `COZE_IMAGE_SYSTEM` 常量 + `callImagePromptLLM()` |
| 图像生成 | `genImage()` 调用图模型 |
| 视频生成（付费） | 舍弃 |
| 结束 | `buildCard()` 拼装 HTML |

## 内置兜底

- ~70 个 SVG 图标库（ICONS）
- 国风简笔占位插画（GF_HERO_PLACEHOLDER）
- 未配 Key 时也能生成完整卡片
