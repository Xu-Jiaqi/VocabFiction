import { splitChaptersRegex } from '../../src/services/generation/chapter-splitter';

function body() {
  let b = '';
  for (let i = 0; i < 60; i++) b += '正文内容正文内容正文内容正文内容正文内容正文内容\n';
  return b;
}

const testCases: Record<string, string> = {
  '标准章':    `第一章 楔子\n${body()}\n第二章 开始\n${body()}\n第三章 结束\n${body()}`,
  '第X回':    `第一回 出发\n${body()}\n第五回 途中\n${body()}\n第十回 抵达\n${body()}`,
  '第X话':    `第1话 初めての出会い\n${body()}\n第2话 放課後の約束\n${body()}\n第3话 文化祭の準備\n${body()}`,
  'Chapter':  `Chapter 1 The Beginning\n${body()}\nChapter 2 The Journey\n${body()}\nChapter 3 The End\n${body()}`,
  '数字编号':   `1. 最初的相遇\n${body()}\n2. 旅途之中\n${body()}\n3. 终点的风景\n${body()}`,
  '番外楔子':   `楔子\n${body()}\n第一章 开始\n${body()}\n番外 另一段故事\n${body()}`,
  '繁体数字':   `第壹章 開端\n${body()}\n第貳章 過程\n${body()}\n第參章 結局\n${body()}`,
  '正文分割':   `正文 第一章\n${body()}\n正文 第二章\n${body()}\n正文 第三章\n${body()}`,
};

// 手工调试番外楔子
console.log('=== 番外楔子 调试 ===');
const text1 = testCases['番外楔子'];
const lines1 = text1.split('\n');
const headingLines = [lines1[0], lines1[62], lines1[124]];
console.log('章节行:', headingLines);

const NUM_DEC = '[\\d.〇零一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]+';
const CHAPTER_TYPE = '(?:章|节(?!课)|卷|集(?![合和])|部(?![分赛游])|回(?![合来事去])|场(?![和合比电是])|话|篇(?!张))';
const SPECIAL = '(?:序章|楔子|正文(?!完|结)|终章|后记|尾声|番外)';

// volumeChapterCombo: LEAD + DI_NUM_CHAPTER + .{0,30}$
const vcRe = new RegExp('^[ 　\\t]{0,4}第\\s{0,4}' + NUM_DEC + '\\s{0,4}' + CHAPTER_TYPE + '.{0,30}$', 'mi');
headingLines.forEach(h => console.log('  volumeChapterCombo \"' + h + '\":', vcRe.test(h)));

// tocStandard
const tsRe = new RegExp('^[ 　\\t]{0,4}(?:' + SPECIAL + '|第\\s{0,4}' + NUM_DEC + '\\s{0,4}' + CHAPTER_TYPE + ').{0,30}$', 'mi');
headingLines.forEach(h => console.log('  tocStandard \"' + h + '\":', tsRe.test(h)));

// 繁体数字调试
console.log('\n=== 繁体数字 调试 ===');
const text2 = testCases['繁体数字'];
const lines2 = text2.split('\n');
const headingLines2 = [lines2[0], lines2[62], lines2[124]];
console.log('章节行:', headingLines2);
headingLines2.forEach(h => {
  console.log('  volumeChapterCombo \"' + h + '\":', vcRe.test(h));
  // 检查 NUM_DEC 是否匹配 '壹'
  const numMatch = h.match(new RegExp('第\\s{0,4}(' + NUM_DEC + ')\\s{0,4}(' + CHAPTER_TYPE + ')', 'i'));
  console.log('  NUM匹配:', numMatch);
});

console.log('\n=== 全部测试 ===');
for (const [name, text] of Object.entries(testCases)) {
  const result = splitChaptersRegex(text);
  if (result) {
    console.log(`✅ [${name}] ${result.length}章:`, result.map(([t]) => t).join(' | '));
  } else {
    console.log(`❌ [${name}] — 所有规则未匹配`);
  }
}
