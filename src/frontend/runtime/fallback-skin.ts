/**
 * 运行库内置的兜底皮肤（前端契约第 7 节第 4 条）：皮肤脚本没开或出错时用它，保证不会出现无样式的界面。
 * ⚠️ 临时占位：刻意中性（灰蓝），不代表视觉方向。示范皮肤（同时是默认皮肤）由用户定视觉后另做。
 */
import type { SkinManifest } from '../skin-engine/package';

export const FALLBACK_SKIN: SkinManifest = {
  id: 'fallback', name: '兜底（临时）', version: '0.1.0', contract: '1.0', defaultScheme: 'dark',
  description: '运行库内置的兜底皮肤，皮肤脚本不可用时使用。',
  schemes: {
    dark: { seeds: { neutral: '#1d2026', accent: '#7aa2f7', radius: 8, elevation: 'shadow' } },
    light: { seeds: { neutral: '#f3f4f6', accent: '#2f5bd3', radius: 8, elevation: 'shadow' } }
  }
};
