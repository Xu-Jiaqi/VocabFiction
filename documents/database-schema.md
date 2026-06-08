# VocabFiction 数据库表设计

所有数据存储在客户端：业务元数据、词表、进度和设置存入 expo-sqlite；内置作品使用打包的 episode JSON；用户上传小说保存 UTF-8 原文、生成 checkpoint、episode JSON 和生成中间数据。

## 表一览

| 表名 | 用途 |
|------|------|
| `word_lists` | 词表元数据与内容 |
| `works` | 作品元数据，含绑定词表 |
| `reading_progress` | 阅读位置记录 |
| `settings` | 用户设置项 |

> 词汇状态追踪（lemma + definition → is_new + M 计数 + 学会状态）暂不实现，后续版本追加。

---

## word_lists

每个词表一条记录。内置词表和用户上传词表都在这里登记，作品通过 `works.word_list_id` 绑定词表。

```sql
CREATE TABLE word_lists (
  id            TEXT PRIMARY KEY,        -- 唯一标识，如 "builtin-nju-ab"
  name          TEXT NOT NULL,           -- 展示名称
  text          TEXT NOT NULL DEFAULT '', -- 词表原文；内置词表可为空占位
  source        TEXT NOT NULL DEFAULT 'user', -- 'builtin' | 'user'
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**默认记录：** 启动时写入 `builtin-nju-ab`，作为内置小说默认绑定词表。用户上传词表会生成独立 `wordListId`，并同步保存为当前词表。

## works

每部作品一条记录。

```sql
CREATE TABLE works (
  id            TEXT PRIMARY KEY,        -- 唯一标识，如 "makeine"
  title         TEXT NOT NULL,           -- 作品名，如 "败犬女主太多了！"
  title_en      TEXT,                    -- 英文名（可选），如 "Too Many Losing Heroines!"
  author        TEXT,                    -- 作者（可选）
  total_eps     INTEGER NOT NULL,        -- 总集数
  source        TEXT NOT NULL DEFAULT 'builtin',  -- 'builtin' | 'user'
  word_list_id  TEXT,                    -- 关联 word_lists.id，可更换
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (word_list_id) REFERENCES word_lists(id) ON DELETE SET NULL
);
```

**作品与词表绑定：**
- 内置小说默认绑定 `builtin-nju-ab`，可在作品管理页更换。
- 用户上传小说保存时绑定当前词表，并先以 `total_eps = 0` 登记到书架。
- 生成成功后写入 episode JSON 并更新 `total_eps`；生成未完成时点击书架卡片进入作品管理页继续生成。

## reading_progress

记录用户每部作品的阅读位置。每部作品最多一条记录。

```sql
CREATE TABLE reading_progress (
  work_id       TEXT PRIMARY KEY,        -- 关联 works.id
  current_ep    INTEGER NOT NULL DEFAULT 1,     -- 当前集数
  current_msg   INTEGER NOT NULL DEFAULT 0,     -- 当前消息索引（0-based，0 表示尚未开始阅读该集第一条消息）
  total_read_eps INTEGER NOT NULL DEFAULT 0,   -- 已读完集数
  status        TEXT NOT NULL DEFAULT 'reading', -- 'reading' | 'finished'
  started_at    TEXT,                    -- 首次开始阅读时间
  last_read_at  TEXT,                    -- 最近一次阅读时间
  FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
);
```

**状态说明：**
- `current_msg = 0`：尚未点击第一条消息，进入阅读界面时显示空白等待区 + 底部点击提示
- `status = 'reading'`：阅读中
- `status = 'finished'`：已读完所有集数，可重读

**阅读位置恢复：**
重新打开 App 时，加载 `current_ep` 和 `current_msg`，渲染从 `messages[0]` 到 `messages[current_msg - 1]` 的历史消息，等待用户点击显示 `messages[current_msg]`。

## settings

键值对存储，每项一行。即时生效，无需保存按钮。

```sql
CREATE TABLE settings (
  key           TEXT PRIMARY KEY,
  value         TEXT NOT NULL
);
```

**MVP 阶段的 key：**

| key | 默认值 | 可选值 | 说明 |
|-----|--------|--------|------|
| `font_size` | `"medium"` | `"small"` / `"medium"` / `"large"` | 字体大小 |
| `reading_mode` | `"chat"` | `"chat"` / `"paragraph"` | 阅读模式 |
| `api_url` | `"https://api.deepseek.com"` | 任意 URL | API 地址 |
| `api_key` | —（由用户填入） | 任意字符串 | API Key（实际存储在 expo-secure-store，此处仅存标记） |
| `api_model` | `"deepseek-v4-pro"` | 任意模型名 | 模型名称 |

---

## 初始化 SQL

```sql
-- 应用首次启动时执行
CREATE TABLE IF NOT EXISTS word_lists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS works (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  title_en TEXT,
  author TEXT,
  total_eps INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'builtin',
  word_list_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (word_list_id) REFERENCES word_lists(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS reading_progress (
  work_id TEXT PRIMARY KEY,
  current_ep INTEGER NOT NULL DEFAULT 1,
  current_msg INTEGER NOT NULL DEFAULT 0,
  total_read_eps INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'reading',
  started_at TEXT,
  last_read_at TEXT,
  FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 默认设置
INSERT OR IGNORE INTO settings (key, value) VALUES ('font_size', 'medium');
INSERT OR IGNORE INTO settings (key, value) VALUES ('reading_mode', 'chat');

-- 内置词表
INSERT OR IGNORE INTO word_lists (id, name, text, source)
VALUES ('builtin-nju-ab', 'NJU词汇表AB类汇总', '', 'builtin');

-- 内置作品
INSERT OR IGNORE INTO works (id, title, title_en, total_eps, source, word_list_id)
VALUES ('makeine', '败犬女主太多了！', 'Too Many Losing Heroines!', 3, 'builtin', 'builtin-nju-ab');
```

---

## ECDICT 离线词典

内置的英文-中文离线词典 `ecdict_mobile.db`（38MB，339,380 词条）。App 自有的业务表与词典表共存于同一个 SQLite 文件中。

### 词典表结构（预置，无需创建）

```sql
CREATE TABLE dict(
  word        TEXT,     -- 词条（可为原形或屈折形式）
  phonetic    TEXT,     -- 音标，如 "/ˈepɪsəʊd/"
  translation TEXT,     -- 中文释义，多义项以 "\n" 分隔
  exchange    TEXT      -- 词形变化映射，格式见下文
);
CREATE INDEX idx_dict_word ON dict(word);
```

### exchange 字段格式

```
格式：<类型>:<词形>/<类型>:<词形>/...
类型码：
  0:  原形 (lemma)
  p:  过去式 (past tense)
  d:  过去分词 (past participle)
  i:  现在分词 / -ing 形式
  s:  复数 / 一般现在时第三人称单数
  3:  一般现在时第三人称单数
  1:  当前词条的屈折类型标记（与 0: 搭配使用）
```

示例：

| word 列 | exchange | 含义 |
|---------|----------|------|
| `went` | `0:go/1:p` | 原形=go，当前词条是过去式 |
| `consuming` | `0:consume/1:i/s:consumings` | 原形=consume，当前词条是-ing形式 |
| `banks` | `0:bank/1:s/s:bankss` | 原形=bank，当前词条是复数 |
| `consume` | `d:consumed/i:consuming/p:consumed/3:consumes/s:consumes` | 原形词条，给出所有屈折形式 |
| `episode` | `s:episodes` | 原形词条，仅有复数变化 |

**lemma 还原流程：**

```
用户点击 went
  → SELECT word, exchange, phonetic, translation FROM dict WHERE word = 'went'
  → 有结果，exchange = "0:go/1:p"
  → 提取 0: 后的值 → lemma = "go"
  → SELECT * FROM dict WHERE word = 'go'   -- 用 lemma 获取完整词典条目
  → 展示音标、释义

没有 exchange 字段或 exchange 中无 0:xxx
  → 当前词即为原形，直接使用当前条目的释义
```

53,298 条词条包含 exchange 字段，覆盖英语常见屈折形式的 lemma 映射。

### ECDICT 打包和加载策略

**方案 A — Asset 打包 + 首次启动复制**

词典文件（38MB）随 App 打包为静态 asset。首次启动时从 asset 目录复制到 `documentDirectory`，之后的读写都在 `documentDirectory` 中进行。

```
App 首次启动
  → 检查 documentDirectory/ecdict_mobile.db 是否存在
  → 不存在 → 从 asset 复制到 documentDirectory（一次性）
  → expo-sqlite 打开 documentDirectory/ecdict_mobile.db
```

**判断逻辑：** expo-sqlite 不能直接读打包的 asset 文件，必须先将 db 文件复制到可读写的 documentDirectory。复制仅发生一次（首次安装或清除数据后），后续启动直接使用已有文件。

**具体实现：**
- `expo-file-system` (`FileSystem.documentDirectory`) — 目标路径
- `expo-asset` (`Asset.fromModule()`) — 加载打包的 .db 文件
- 首次启动复制耗时约 1-2 秒（38MB），可在启动画面期间完成

### Episode JSON 存储和加载

**目录约定：** 每部作品的集数 JSON 按 `novels/<作品名>/<work_id>/` 层级存放。

```
novels/败犬女主太多了！/
├── 败犬女主太多了！ 第一卷 utf-8.txt       ← 源材料（如有）
├── characters/
│   ├── characters.json                   ← 角色 → 头像映射
│   ├── Nukumizu.png
│   ├── Sousuke.png
│   └── Yanami.png
└── makeine/                              ← work_id = "makeine"
    ├── ep01_a_quiet_afternoon.json
    ├── ep02_the_argument.json
    └── ep03_the_glass.json
```

**内置作品：** JSON 文件随 App 打包为静态 assets。通过 `require()` 或 `expo-asset` 加载。

**用户上传作品：** 目录为 `documentDirectory/novels/<work_id>/`。`plain.txt` 保存 UTF-8 原文，`meta.json` 记录标题、绑定词表和保存时间，`generation-checkpoint.json` 保存生成阶段、中间数据和已完成 episode。生成成功后写入 `episodes/epNN.json`、`chapters.json`、`arc-plan.json`、`vocabulary.json`。

**Episode 发现：** 加载某集时，按文件名模式 `ep<NN>_*.json` 匹配。`works.total_eps` 提供集数上限。

---

## 数据流

```
App 启动
  → 首次启动？→ 复制 ecdict_mobile.db 到 documentDirectory
  → 打开 SQLite（documentDirectory/ecdict_mobile.db）
  → CREATE TABLE IF NOT EXISTS（word_lists, works, reading_progress, settings）
  → 插入默认设置、内置词表和内置作品（INSERT OR IGNORE）
  → 加载 works 表 → 渲染书架
  → 用户点击内置作品 → 从 novels/<作品名>/<work_id>/ 加载当前集 JSON
  → 用户点击已生成的上传作品 → 从 documentDirectory/novels/<work_id>/episodes 加载当前集 JSON
  → 用户点击未生成完成的上传作品 → 进入作品管理继续生成
  → 作品管理：修改 works.title；更换 works.word_list_id；继续生成；用户作品可删除本地目录和 works 记录
  → 根据 reading_progress 跳转到对应位置
  → 阅读中：每点击一条消息 → 更新 reading_progress.current_msg
  → 读完一集：current_ep += 1, current_msg = 0, total_read_eps += 1
  → 用户点击生词 → 查 ECDICT dict 表（先 exchange 还原 lemma，再查完整释义）
  → 用户退出：进度已持久化，下次打开直接恢复
```
