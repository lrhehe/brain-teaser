# 🐣 智慧对对碰 — Brain Teaser Adventure

一款专为 **5-12 岁中国小朋友** 打造的中文脑筋急转弯互动问答游戏。

> 让孩子在玩中学、学中玩 —— 每一道题都是一次思维冒险。

## 项目背景

这个项目的初衷很简单：**给孩子一个边玩边学的工具。**

市面上的儿童教育 App 大多需要付费、广告繁多、或内容质量参差不齐。我们希望做一个 **完全免费、无广告、开箱即用** 的网页小游戏，让孩子可以在浏览器里直接打开玩。

核心理念：
- 🧩 **寓教于乐** — 113 道精选脑筋急转弯，涵盖逻辑推理、数学思维、动物知识、日常常识等题型
- 🗣️ **辅助识字** — 每个汉字都标注拼音，点击即可听发音，让还不认字的孩子也能独立玩
- 🎯 **正向激励** — 答对有彩色纸屑庆祝动画 + 随机英文鼓励语音，答错也温暖鼓励
- 📱 **随时随地** — 纯前端静态部署，手机/平板/电脑均可访问

## 功能特色

### 🎮 游戏机制
- 每轮随机抽取 **5 道题**，避免重复和枯燥
- **先选后交** — 点击选项只高亮选中，点「提交答案」才提交，防止误触
- 答题结束后根据得分给出不同评语（全对 / 大部分对 / 需要加油）

### 📖 拼音与发音系统
- 题目和选项中的每个汉字上方都标注 **拼音**（Ruby 注音）
- **点击任意汉字**即可听到该字的标准发音（含拼音 + 组词，如「shù，大树的树」）
- 发音使用 **阿里通义千问 TTS（Qwen3-TTS-Flash）** 预生成的 MP3 音频，响应快、音质好
- 吉祥物旁的喇叭按钮可朗读整道题

### 🎨 视觉设计
- 毛玻璃质感（Glassmorphism）卡片 + 柔和渐变背景
- 流畅的 Framer Motion 动画（入场、选中、反馈）
- 可爱的小鸡吉祥物陪伴全程
- 答对时 canvas-confetti 彩色纸屑庆祝 🎉

### 🔊 双语反馈
- 答对/答错时播放随机英文鼓励短语（`Awesome!` / `Try Again!`）
- 使用浏览器 Web Speech API，无需额外资源

## 项目结构

```
brain-teaser/
├── src/
│   ├── App.jsx                 # 主游戏逻辑（选题、计分、提交流程）
│   ├── components/
│   │   ├── QuestionCard.jsx    # 题目卡片（拼音标注 + 点字发音）
│   │   ├── AnswerButton.jsx    # 选项按钮（选中态 + 点字发音）
│   │   └── ProgressBar.jsx     # 进度条
│   ├── data/
│   │   ├── questions.json      # 题库（113题 + 逐字发音数据）
│   │   └── questions.js        # JS 导出（含英文反馈短语）
│   └── utils/
│       └── tts.js              # TTS 工具（预生成音频 + Web Speech）
├── scripts/
│   ├── add_questions.mjs       # 批量添加新题目
│   ├── filter_questions.mjs    # 题目筛选/去重
│   ├── generate_pronunciation.mjs  # 用 Qwen LLM 生成逐字拼音数据
│   └── generate_audio.mjs      # 用 Qwen3-TTS 生成 MP3 音频文件
├── public/
│   ├── audio/                  # 1029 个预生成发音 MP3 文件
│   └── mascot.png              # 吉祥物图片
└── docs/                       # Vite 构建输出（GitHub Pages 部署）
```

## 技术要点

### 发音系统的两层架构

项目采用 **预生成音频 + 实时 TTS** 的混合方案：

| 场景 | 方案 | 原因 |
|------|------|------|
| 点击单个汉字 | 预生成 MP3（`/audio/*.mp3`） | 速度快、音质稳定、离线可用 |
| 英文鼓励反馈 | Web Speech API | 无需额外音频文件，短语随机组合 |

汉字发音使用阿里 DashScope API 分两步生成：
1. `generate_pronunciation.mjs` — 调用 Qwen-Plus 大模型为每个汉字生成拼音、组词和 TTS 文本
2. `generate_audio.mjs` — 调用 Qwen3-TTS-Flash 模型将 TTS 文本合成 MP3 音频

### 运行脚本所需的环境变量

```bash
# 阿里 DashScope API Key（用于生成拼音和音频）
export DASHSCOPE_API_KEY=sk-xxx
```

### 数据结构

`questions.json` 中每道题的结构：

```json
{
  "id": 1,
  "type": "logic",
  "text": "什么东西早晨四条腿？",
  "options": [
    { "id": "a", "text": "猫", "isCorrect": false },
    { "id": "b", "text": "人", "isCorrect": true }
  ],
  "pronunciation": {
    "什": {
      "pinyin": "shén",
      "example": "什么的什",
      "ttsText": "shén，什么的什",
      "audioFile": "6aa3d330d36c.mp3"
    }
  }
}
```

### 注意事项

- **音频文件是 Git-tracked 的**：`public/audio/` 目录下有 1029 个 MP3 文件（约数十 MB），clone 时体积较大
- **题库扩展**：新增题目后需依次运行 `generate_pronunciation.mjs` → `generate_audio.mjs` 生成发音数据
- **部署方式**：构建产物输出到 `docs/` 目录，通过 GitHub Pages 自动部署（`vite.config.js` 中 `base: './'`）
- **Web Speech API 兼容性**：英文反馈依赖浏览器 TTS，Chrome/Safari/Edge 支持良好，Firefox 部分支持
- **Tailwind CSS v4**：本项目使用 `@tailwindcss/vite` 插件（v4），配置方式与 v3 不同，无需 `tailwind.config.js`

## 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本（输出到 docs/）
npm run build

# 预览构建结果
npm run preview
```

### 扩展题库

```bash
# 1. 在 add_questions.mjs 中添加新的原始题目，然后运行
node scripts/add_questions.mjs

# 2. 为新题目生成逐字拼音数据
DASHSCOPE_API_KEY=sk-xxx node scripts/generate_pronunciation.mjs

# 3. 生成 MP3 音频文件
DASHSCOPE_API_KEY=sk-xxx node scripts/generate_audio.mjs

# 4. 构建并部署
npm run build
```

## 技术栈

- **框架**：React 19 + Vite 7
- **样式**：Tailwind CSS v4
- **动画**：Framer Motion
- **图标**：Lucide React
- **庆祝特效**：canvas-confetti
- **AI 服务**：阿里 DashScope（Qwen-Plus + Qwen3-TTS-Flash）
- **部署**：GitHub Pages（CI/CD via GitHub Actions）

---

Made with ❤️ for curious little minds.
