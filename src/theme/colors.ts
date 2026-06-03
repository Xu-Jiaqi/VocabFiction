export const Colors = {
  // Backgrounds
  mainBg: '#FAF8F3',       // 暖米白 — 主背景
  panelBg: '#F5F2EB',      // 略深米白 — 面板背景
  leftBubble: '#F0EDE5',   // 浅杏 — 左气泡
  rightBubble: '#E8ECF1',  // 淡灰蓝 — 右气泡
  narrationBubble: '#EEEAE0', // 浅暖灰 — 居中旁白气泡

  // Text
  bodyText: '#2C2416',     // 墨棕 — 正文
  narration: '#665D50',    // 深温灰 — 叙述文字，保证浅暖灰气泡内可读
  secondary: '#A09C94',    // 浅温灰 — 状态/时间/标签
  definition: '#A09C94',   // 释义灰色

  // Dividers
  divider: '#E5E0D5',      // 极淡暖灰 — 分割线
  progressBar: '#D4C9B8',  // 进度条颜色

  // Semantic tokens (added per UI/UX review §4.4)
  // 阴影用暖棕投影，避免冷黑色与暖纸感冲突
  shadow: 'rgba(44, 36, 22, 0.08)',
  // 模态遮罩：仅用于侧边栏和词典面板的可点击暗层
  scrim: 'rgba(44, 36, 22, 0.18)',
  // 暖绿（连接成功）— 与墨棕主色和谐，不刺眼
  success: '#5B7C5A',
  // 暖锈（错误/失败）— 不使用纯红
  destructive: '#A04A3A',
  // 按下态：比 leftBubble 深一档
  pressedOverlay: 'rgba(44, 36, 22, 0.06)',
} as const;

export type ColorToken = keyof typeof Colors;
