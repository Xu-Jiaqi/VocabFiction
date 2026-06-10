/**
 * 正则章节拆分器 — 完整移植自 legado（阅读）章节识别规则
 *
 * 设计参考：
 * - legado 内置 25 条章节规则，按优先级从高到低排列
 * - 每条规则是行级正则，匹配成功即作为章节边界
 * - 至少匹配到 2 个章节才返回结果，否则走 null → 模型兜底
 *
 * 数字字符集覆盖三种书写：
 *   - 阿拉伯数字: 0-9
 *   - 简体中文数字: 零〇一二两三四五六七八九十百千万
 *   - 繁体中文数字: 壹贰叁肆伍陆柒捌玖拾佰仟
 */

import { generationLog, textStats } from './debug-log';

// ============================================================
// 共享字符集
// ============================================================

/** 数字字符集 — 覆盖阿拉伯、简体中文、繁体中文 */
const NUM = '[\\d〇零一二两三四五六七八九十百千万壹贰貳叁參肆伍陆陸柒捌玖拾佰仟]';

/**
 * 数字字符集（含小数点）— 用于「第 X 章/卷」模式。
 * 中文轻小说常见 15.5、4.5 这类小数卷号。
 */
const NUM_DEC = '[\\d.〇零一二两三四五六七八九十百千万壹贰貳叁參肆伍陆陸柒捌玖拾佰仟]+';

/**
 * 章节类型 — 带负向前瞻排除误匹配：
 * - 节(?!课)  → 不匹配「节课」
 * - 集(?![合和]) → 不匹配「集合」「集和」
 * - 部(?![分赛游]) → 不匹配「部分」「比赛」「游戏」
 * - 回(?![合来事去]) → 不匹配「回合」「回来」「回事」「回去」
 * - 场(?![和合比电是]) → 不匹配「场合」「场比」「电场」「场是」
 * - 篇(?!张) → 不匹配「篇章」(误切成「篇张」)
 */
const CHAPTER_TYPE = '(?:章|节(?!课)|卷|集(?![合和])|部(?![分赛游])|回(?![合来事去])|场(?![和合比电是])|话|篇(?!张))';

/** 特殊章节类型（无数字编号）— 正文 后必须有空白，避免匹配 body 里的「正文内容」 */
const SPECIAL = '(?:序章|楔子|正文(?!完|结)[ 　]|终章|后记|尾声|番外)';

/** 第 X 章 的核心结构 — 支持小数卷号如 15.5 */
const DI_NUM_CHAPTER = `第\\s{0,4}${NUM_DEC}\\s{0,4}${CHAPTER_TYPE}`;

/** 行首允许的前导空白 */
const LEAD = '^[ 　\\t]{0,4}';

// ============================================================
// 规则集 — 从高优先级到低优先级排列
// ============================================================

interface Rule {
  /** 规则名称（用于日志） */
  name: string;
  /** 行级正则 — 匹配到即为章节标题行 */
  regex: RegExp;
  /** 默认启用 */
  enable: boolean;
}

const RULES: Rule[] = [
  // ---- 1. 卷+章 组合（如「第15.5卷 二年级篇 4.5」）----------
  {
    name: 'volumeChapterCombo',
    regex: new RegExp(
      `${LEAD}${DI_NUM_CHAPTER}.{0,30}$`,
      'gmi',
    ),
    enable: true,
  },

  // ---- 2. 目录(去空白) — legado id=-1 ----------
  {
    name: 'tocTrimmed',
    regex: new RegExp(
      `(?<=[ 　\\s])(?:${SPECIAL}|${DI_NUM_CHAPTER}).{0,30}$`,
      'mi',
    ),
    enable: true,
  },

  // ---- 3. 目录 — legado id=-2 ----------
  {
    name: 'tocStandard',
    regex: new RegExp(
      `${LEAD}(?:${SPECIAL}|${DI_NUM_CHAPTER}).{0,30}$`,
      'gmi',
    ),
    enable: true,
  },

  // ---- 4. 目录(含回/话) — legado id=-4 (轻小说备用) ----------
  {
    name: 'tocExtended',
    regex: new RegExp(
      `${LEAD}(?:${SPECIAL}|第\\s{0,4}${NUM}+?\\s{0,4}(?:章|节(?!课)|卷|集(?![合和])|部(?![分赛游])|回(?![合来事去])|场(?![和合比电是])|话|篇(?!张))).{0,30}$`,
      'gmi',
    ),
    enable: true,
  },

  // ---- 5. 纯数字 分隔符 标题 — legado id=-8 ----------
  {
    name: 'numberDelimiter',
    regex: new RegExp(
      `${LEAD}\\d{1,5}[:：,.， 、_—\\-].{1,30}$`,
      'gmi',
    ),
    enable: true,
  },

  // ---- 6. 中文数字 分隔符 标题 — legado id=-9 ----------
  {
    name: 'cnNumDelimiter',
    regex: new RegExp(
      `${LEAD}(?:${SPECIAL}|[零一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]{1,8}章?)[ 、_—\\-].{1,30}$`,
      'gmi',
    ),
    enable: true,
  },

  // ---- 7. 正文 标题 — legado id=-11 ----------
  {
    name: 'bodyHeading',
    regex: new RegExp(
      `${LEAD}正文[ 　]{1,4}.{0,20}$`,
      'gmi',
    ),
    enable: true,
  },

  // ---- 8. Chapter / Section / Part / Episode — legado id=-12 ----------
  {
    name: 'enChapter',
    regex: new RegExp(
      `${LEAD}(?:[Cc]hapter|[Ss]ection|[Pp]art|ＰＡＲＴ|[Nn][oO][.、]|[Ee]pisode|${SPECIAL})\\s{0,4}\\d{1,4}.{0,30}$`,
      'gmi',
    ),
    enable: true,
  },

  // ---- 9. 特殊符号含章节 — legado id=-14 ----------
  {
    name: 'bracketChapter',
    regex: new RegExp(
      `(?<=[\\s　])[【〔〖「』〈［\\[](?:第|[Cc]hapter)[${NUM.slice(1, -1)}]{1,10}[章节].{0,20}$`,
      'mi',
    ),
    enable: true,
  },

  // ---- 10. 特殊符号(单个) — legado id=-16 ----------
  {
    name: 'starHeading',
    regex: new RegExp(
      `(?<=[\\s　]{0,4})(?:[☆★✦✧].{1,30}|${SPECIAL})[ 　]{0,4}$`,
      'mi',
    ),
    enable: true,
  },

  // ---- 11. 卷X / 章X 前置 — legado id=-17 ----------
  {
    name: 'prefixVolumeChapter',
    regex: new RegExp(
      `${LEAD}(?:${SPECIAL}|[卷章]${NUM}{1,8})[ 　]{0,4}.{0,30}$`,
      'gmi',
    ),
    enable: true,
  },

  // ---- 12. 书名(数字) 括号 — legado id=-21 ----------
  {
    name: 'titleParenNumber',
    regex: new RegExp(
      `^[一-龥]{1,20}[ 　\\t]{0,4}[(（]${NUM}{1,8}[)）][ 　\\t]{0,4}$`,
      'gmi',
    ),
    enable: true,
  },

  // ---- 13. 书名 数字 — legado id=-22 ----------
  {
    name: 'titleNumber',
    regex: new RegExp(
      `^[一-龥]{1,20}[ 　\\t]{0,4}${NUM}{1,8}[ 　\\t]{0,4}$`,
      'gmi',
    ),
    enable: true,
  },

  // ---- 14. 分节阅读 — legado id=-24 ----------
  {
    name: 'sectionSplit',
    regex: new RegExp(
      `${LEAD}(?:.{0,15}分[页节章段]阅读[-_ ]|第\\s{0,4}${NUM}{1,6}\\s{0,4}[页节]).{0,30}$`,
      'gmi',
    ),
    enable: true,
  },

  // ---- 15. 通用规则 — legado id=-25 (激进兜底) ----------
  {
    name: 'universal',
    regex: new RegExp(
      `${LEAD}(?:[引楔]子|正文(?!完|结)|[引序前]言|[序终]章|扉页|[上中下][部篇卷]|卷首语|后记|尾声|番外|={2,4}|${DI_NUM_CHAPTER}).{0,40}$|${LEAD}[${NUM.slice(1, -1)}a-z]{1,8}[、. 　].{0,20}$`,
      'gmi',
    ),
    enable: false, // 默认关闭，太激进容易误匹配
  },
];

// ============================================================
// 常量
// ============================================================

/** 最小章节正文字符数，小于此值的章节会被丢弃 */
const MIN_CHAPTER_BODY_LENGTH = 100;

/** 全文至少需要这么多行才会尝试切分 */
const MIN_TOTAL_LINES = 30;

// ============================================================
// 拆分逻辑
// ============================================================

/**
 * 对全部行执行单条规则扫描，返回所有匹配的章节边界。
 * 规则是行级正则，每行 match 成功即为一个章节起始点。
 */
function scanLines(
  lines: string[],
  regex: RegExp,
): Array<{ title: string; startLine: number }> {
  const boundaries: Array<{ title: string; startLine: number }> = [];

  // 去掉 g 标志避免 test() 的 lastIndex 跨行残留导致漏匹配
  const safeRegex = new RegExp(regex.source, regex.flags.replace('g', ''));

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (safeRegex.test(line)) {
      const title = line
        .trim()
        // 清理尾部装饰符号（☆★◇◆等）但保留有意义内容
        .replace(/[※★☆◆◇■□▲△▼▽●○◎✦✧「」『』【】〖〗〈〉《》\(\)\[\]]+$/g, '')
        .trim()
        // 清理行尾纯标点
        .replace(/[,，、。；;：:！!？?…._\-—\s]+$/, '')
        .trim();
      if (title.length > 0) {
        boundaries.push({ title, startLine: i });
      }
    }
  }

  return boundaries;
}

/**
 * 根据章节边界收集完整章节 (标题, 正文)。
 * 边界之间即为章节正文，包含标题行的下一行到下一个标题行之前。
 */
function collectBodies(
  lines: string[],
  boundaries: Array<{ title: string; startLine: number }>,
): Array<[string, string]> {
  const result: Array<[string, string]> = [];

  for (let i = 0; i < boundaries.length; i++) {
    const { title, startLine } = boundaries[i];
    const endLine = i + 1 < boundaries.length
      ? boundaries[i + 1].startLine
      : lines.length;
    const body = lines
      .slice(startLine + 1, endLine)
      .join('\n')
      .trimEnd();
    if (body.length >= MIN_CHAPTER_BODY_LENGTH) {
      result.push([title, body]);
    }
  }

  return result;
}

/**
 * 将连续的短行合并到下一章节。
 * 有些章节标题后紧跟卷号/作者等信息行，这些应该并入章节正文而非独立成章。
 */
function mergeShortChapters(
  chapters: Array<[string, string]>,
): Array<[string, string]> {
  if (chapters.length < 2) return chapters;

  const merged: Array<[string, string]> = [];
  let i = 0;

  while (i < chapters.length) {
    let [title, body] = chapters[i];

    // 如果当前章节正文很短且不是最后，合并到下一个
    while (
      body.length < MIN_CHAPTER_BODY_LENGTH &&
      i + 1 < chapters.length
    ) {
      const nextTitle = chapters[i + 1][0];
      const nextBody = chapters[i + 1][1];
      title = `${title}\n${nextTitle}`; // 多行标题保留
      body = `${body}\n${nextTitle}\n${nextBody}`;
      chapters[i + 1] = [title, body === `${body}\n${nextTitle}\n${nextBody}` ? nextBody : body];
      i++;
    }

    if (body.length >= MIN_CHAPTER_BODY_LENGTH) {
      merged.push([title, body]);
    }
    i++;
  }

  return merged;
}

// ============================================================
// 公开 API
// ============================================================

/**
 * 用正则规则集扫描全文，按优先级逐一尝试。
 * 第一条匹配到 >=2 个有效章节的规则即返回结果。
 * 所有规则都匹配不到则返回 null，调用方应走模型兜底（splitChaptersByModel）。
 */
export function splitChaptersRegex(rawText: string): Array<[string, string]> | null {
  const lines = rawText.split('\n');

  if (lines.length < MIN_TOTAL_LINES) {
    generationLog.debug('chapters.regex.too_short', { lines: lines.length });
    return null;
  }

  for (const rule of RULES) {
    if (!rule.enable) continue;

    const boundaries = scanLines(lines, rule.regex);
    if (boundaries.length < 2) continue;

    let chapters = collectBodies(lines, boundaries);
    if (chapters.length < 2) continue;

    chapters = mergeShortChapters(chapters);
    if (chapters.length < 2) continue;

    generationLog.debug('chapters.regex.success', {
      rule: rule.name,
      chapters: chapters.length,
      titles: chapters.map(([t]) => t),
    });
    return chapters;
  }

  generationLog.debug('chapters.regex.no_match', {
    textStats: textStats(rawText),
    rulesTried: RULES.filter((r) => r.enable).map((r) => r.name),
  });
  return null;
}

/**
 * 导出规则列表，方便外部查看/调试
 */
export function getRegexRules(): ReadonlyArray<{ name: string; enable: boolean }> {
  return RULES.map((r) => ({ name: r.name, enable: r.enable }));
}
