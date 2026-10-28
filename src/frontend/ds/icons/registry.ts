/**
 * 平台图标库（Lucide，ISC 许可）：皮肤在 skin.json 的 icons 里把 emoji 映射到这里的名字（前端契约 6.7）。
 * 只登记精选的一批，按需打包；要新增就在这里加一行（名字用 kebab-case，语义而不是外形）。
 */
import {
  Accessibility, AlertTriangle, ArrowDownToLine, ArrowUpToLine, Ban, Beer, BookMarked, BookOpen, Bot, Brain, BrickWall, Brush, Cat, CheckSquare,
  Clapperboard, ClipboardList, Contrast, Crosshair, Dices, Drama, Eye, Feather, Fish, Flame, Flower2, FolderOpen, Footprints, Frown, Gamepad2,
  Gem, Ghost, Globe, HandFist, Heart, HeartHandshake, HelpCircle, Info, Languages, Laugh, Layers, Library, Map as MapIcon, MessageCircle,
  MessagesSquare, Moon, MoonStar, Mountain, Orbit, Palette, Pen, PenLine, Pin, Puzzle, RefreshCw, ScrollText, Search, Settings, Shield,
  Shuffle, Skull, SlidersHorizontal, Slice, Smile, Sparkle, Sparkles, Swords, Target, Telescope, Theater, Video, Volume2, Waves, Wrench, X,
  Zap, Lamp, Users, LetterText, Sword, Rabbit, Squirrel, Bird, CloudRain, Sun, Star, Tv, Music, Hourglass, Lightbulb, Lock, Flag, Glasses
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type IconComponent = LucideIcon;

export const ICONS: Record<string, IconComponent> = {
  accessibility: Accessibility, alert: AlertTriangle, 'section-end': ArrowDownToLine, 'section-start': ArrowUpToLine, ban: Ban, beer: Beer,
  'book-marked': BookMarked, book: BookOpen, bot: Bot, brain: Brain, bricks: BrickWall, brush: Brush, cat: Cat, check: CheckSquare,
  clapperboard: Clapperboard, list: ClipboardList, 'yin-yang': Contrast, crosshair: Crosshair, dice: Dices, drama: Drama, eye: Eye, feather: Feather,
  fish: Fish, flame: Flame, flower: Flower2, folder: FolderOpen, footprints: Footprints, frown: Frown, gamepad: Gamepad2, gem: Gem, ghost: Ghost,
  globe: Globe, fist: HandFist, heart: Heart, 'heart-hands': HeartHandshake, help: HelpCircle, info: Info, languages: Languages, laugh: Laugh,
  layers: Layers, library: Library, map: MapIcon, message: MessageCircle, dialogue: MessagesSquare, moon: Moon, 'moon-star': MoonStar,
  mountain: Mountain, orbit: Orbit, palette: Palette, pen: Pen, 'pen-line': PenLine, pin: Pin, puzzle: Puzzle, refresh: RefreshCw, scroll: ScrollText,
  search: Search, settings: Settings, shield: Shield, shuffle: Shuffle, skull: Skull, sliders: SlidersHorizontal, knife: Slice, smile: Smile,
  sparkle: Sparkle, sparkles: Sparkles, swords: Swords, sword: Sword, target: Target, telescope: Telescope, theater: Theater, video: Video,
  volume: Volume2, waves: Waves, wrench: Wrench, x: X, zap: Zap, lamp: Lamp, users: Users, letters: LetterText, rabbit: Rabbit, squirrel: Squirrel,
  bird: Bird, rain: CloudRain, sun: Sun, star: Star, tv: Tv, music: Music, hourglass: Hourglass, idea: Lightbulb, lock: Lock, flag: Flag, glasses: Glasses
};

export const ICON_NAMES = Object.keys(ICONS);
