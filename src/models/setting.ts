export interface SettingEntry {
  key: string;
  value: string;
}

export const DEFAULT_SETTINGS: Record<string, string> = {
  font_size: 'medium',
  reading_mode: 'chat',
};

export type FontSize = 'small' | 'medium' | 'large';
export type ReadingMode = 'chat' | 'paragraph';

export const FONT_SCALES: Record<FontSize, number> = {
  small: 0.85,
  medium: 1.0,
  large: 1.15,
};
