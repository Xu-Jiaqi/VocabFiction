# VocabFiction

[English](README.md) | [中文](README.zh-CN.md)

> 一个好故事驱动的英语词汇自然积累工具 — 读小说，学单词，无需背。

VocabFiction 将小说转化为对话体英语阅读体验，目标词汇在故事中自然出现。本仓库现在整合了 Expo/React Native 移动端和 FastAPI 后端，后端负责词表、阅读进度和生成流程相关 API。

## 功能

- **对话体阅读** — 点击屏幕逐句推进，对话气泡 + 居中叙述，像刷聊天 App 一样读故事
- **内置作品** —《败犬女主太多了！》预置 3 集对话体 + 1 章传统阅读英文版
- **词汇在语境中** — 目标词首次出现加粗+中文释义；后续复现仅加粗，可点击查词
- **两级查词** — 点击单词 → 释义小窗 → 再点 → 详细词典面板（音标、多义项、词形变化）
- **离线词典** — 内置 339,000 词条的英汉词典 (ECDICT)，无需网络
- **集末词汇面板** — 回顾本集遇见的所有词汇，支持拖动展开/收起
- **双阅读模式** — 对话体 / 传统（段落式）
- **字体大小可调** — 小 / 中 / 大
- **上传自己的小说** — 支持 .txt 小说和词表上传；上传小说会转为 UTF-8 原文保存、绑定词表并显示在书架上（生成管线即将完成）

## 快速开始

### 准备

- 安装 [Node.js](https://nodejs.org/) 18 以上版本
- 在 iPhone 或 Android 手机上安装 [Expo Go](https://expo.dev/go)
- 后端开发需要 Python 3.10

### 用 Expo Go 运行

1. **克隆仓库**

```bash
git clone https://github.com/Xu-Jiaqi/VocabFiction.git
cd VocabFiction
```

2. **安装依赖**

```bash
npm install
```

3. **启动开发服务器**

```bash
npx expo start --tunnel
```

4. **在手机上打开**

- 打开手机上的 **Expo Go**
- 点击 **"Enter URL manually"**（手动输入 URL）
- 输入终端中显示的地址（例如 `exp://abc123.ngrok.io:8081`）
- 或者用 Expo Go 扫描终端中显示的二维码

应用加载后，你会看到书架页面，点击内置作品即可开始阅读！

> **提示：** `--tunnel` 参数会通过 ngrok 创建公网 URL，即使手机和电脑不在同一网络也能连接。如果在同一 Wi-Fi 下，直接用 `npx expo start` 即可。

### 首次启动

首次启动时，应用会将离线词典（39MB）复制到设备存储中，加载画面可能需要几秒钟。后续启动无需等待。

### 运行后端

后端位于 `ELBackend/`，API 前缀为 `http://127.0.0.1:8000/api/v1`。

```bash
cd ELBackend
python3.10 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

使用生成相关接口前，将 `ELBackend/.env.example` 复制为 `ELBackend/.env`，并填写 LLM endpoint 配置。

## 实现状态

### ✅ 已实现

| 功能 | 说明 |
|------|------|
| 内置作品 | 《败犬女主太多了！》3 集对话体 + 1 章传统阅读 |
| 对话体阅读 | 点击推进、左右气泡、居中叙述、入场动画 |
| 传统阅读 | 段落式排版，纯文本章节阅读 |
| 书架 | 作品列表，显示标题 + 绑定词表名称 |
| 进度持久化 | 记住当前集数和消息位置 |
| 集数切换 | 标题栏 ← → 切换 |
| 词汇内联展示 | 首次：粗体+释义；复习：粗体可点击 |
| 词汇小窗 | 在词附近弹出，点击进入详细面板 |
| 词典面板 | 音标、多义项、词形变化（过去式、复数等） |
| 离线词典 | ECDICT 33.9 万词条，lemma 还原（went → go） |
| 集末词汇面板 | 词汇列表，可拖动收起/展开，点击切面板 |
| 字体大小 | 小/中/大，阅读界面实际生效 |
| 阅读模式 | 对话体 / 传统 |
| API 设置 | 地址、密钥（安全存储）、模型、连接测试 |
| 拆分上传页 | 词表/小说分别上传，支持 .txt 文件选择器和粘贴文字；小说只保存 UTF-8 `plain.txt` + `meta.json` 并记录 `works.word_list_id` |
| 上传作品管理 | 用户上传小说显示在书架；点击暂时无反应，长按进入管理页，可修改名称、更换词表或删除 |
| 角色头像 | 名字→头像映射，无头像用首字替代 |
| 平滑滚动 | 自定义缓动动画（500ms, cubic ease-out） |
| 阅读界面入场 | 从右侧滑入（250ms） |

### 🚧 进行中 / 界面占位

| 功能 | 状态 |
|------|------|
| 自动学会检测（M=3） | 延后 — 词汇追踪状态暂未实现 |
| 番外集 | 延后 — 依赖词表覆盖率数据 |
| 生成管线 | 原文保存和词表绑定已完成，LLM 生成流程待接入 |
| 集数段落式阅读 | 传统模式通过 `PlainTextReader` 显示纯文本章节 |

### 📋 计划

| 功能 | 备注 |
|------|------|
| 更多内置作品 | 扩充内容库 |
| 用户上传全流程 | 上传 → LLM 生成 → 集数 JSON → 书架 |
| 传统模式更多章节 | 扩充 `paras/` 文件夹 |
| 夜间模式 | 深色主题 |

## 项目结构

```
VocabFiction/
├── app/                          # Expo Router 页面
│   ├── _layout.tsx               # 根布局 + 数据库初始化
│   ├── index.tsx                 # 书架（首页）
│   ├── reader/[workId].tsx       # 阅读界面
│   ├── settings.tsx              # 字体大小、阅读模式
│   ├── api-settings.tsx          # API 设置
│   ├── work/[workId]/manage.tsx   # 作品管理
│   └── upload/
│       ├── novel.tsx             # 小说上传
│       └── wordlist.tsx          # 词表上传
├── src/
│   ├── db/                       # 数据库层
│   │   ├── init.ts               # SQLite 初始化 + ECDICT 复制
│   │   ├── dictionary.ts         # ECDICT 查词 + lemma 还原
│   │   ├── works.ts, word-lists.ts, progress.ts, settings.ts
│   ├── models/                   # TypeScript 类型
│   ├── components/               # UI 组件
│   │   ├── ChatBubble.tsx        # 对话气泡（左/右）
│   │   ├── Narration.tsx         # 叙述气泡
│   │   ├── VocabText.tsx         # 词汇内联标记
│   │   ├── DictionaryPanel.tsx   # 词典详细面板
│   │   ├── PlainTextReader.tsx   # 传统阅读模式
│   │   └── AnimatedMessage.tsx   # 消息入场动画
│   ├── services/                 # 业务逻辑
│   │   ├── lemma.ts              # ECDICT exchange 字段解析
│   │   ├── episode-loader.ts     # 集数 JSON + 章节文本加载
│   │   ├── user-content.ts       # 用户上传原文存储
│   │   ├── text-file.ts          # 文本文件解码为 UTF-8 字符串
│   │   └── character-loader.ts   # 角色头像映射
│   └── theme/colors.ts           # 暖纸色彩常量
├── novels/败犬女主太多了！/       # 内置小说
│   ├── makeine/                  # 对话体集数（3 集）
│   ├── paras/                    # 传统阅读章节（1 章）
│   └── characters/               # 角色头像 + 映射
├── assets/
│   └── ecdict_mobile.db          # 离线英汉词典
├── documents/                    # 产品规格和设计文档
├── word_lists/                   # 词表
└── ELBackend/                    # FastAPI 后端
    ├── app/                      # API、services、models、storage
    ├── tests/                    # pytest 测试
    ├── documents/                # 后端架构/API 文档
    └── requirements.txt          # Python 依赖
```

## 技术栈

| 层 | 技术 |
|----|------|
| 框架 | Expo SDK 56 + React Native 0.85 |
| 导航 | Expo Router（文件系统路由） |
| 数据库 | expo-sqlite (SQLite) |
| 存储 | expo-file-system + expo-secure-store |
| 动画 | React Native Animated API |
| 词典 | ECDICT（339K 词条，exchange 字段做 lemma 还原） |
| 后端 API | FastAPI + Pydantic v2 + Uvicorn |
| 后端测试 | pytest + ruff |

## 设计文档

`documents/` 目录中包含完整的产品和设计文档：

- `product-analysis.md` — 产品分析、用户画像、设计原则
- `format_spec_json.md` — 集数 JSON 格式规范 (v3)
- `format_spec_json_cn.md` — 格式规范中文版
- `ui-style-spec.md` — UI 风格规范（色彩、字体、气泡、动画）
- `user-stories.md` — 用户故事
- `information-architecture.md` — 信息架构（页面地图、导航、布局）
- `database-schema.md` — 数据库表设计 + ECDICT 集成
- `pending-decisions.md` — 待定决策和 MVP 范围
