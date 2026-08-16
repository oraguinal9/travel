// 家常菜谱类型定义

// 忌口 / 特色标签（用于按用户偏好过滤；avoid 命中即排除该菜）
export type DietTag =
  | '肉' // 含畜禽肉
  | '海鲜' // 含鱼/虾/贝
  | '内脏'
  | '蛋'
  | '豆制品'
  | '素' // 纯素（无动物成分）
  | '辣'
  | '不辣'
  | '甜'
  | '快手' // 20 分钟内能上桌
  | '下饭'
  | '汤'
  | '凉菜';

// 采购分类：决定食材进「荤 / 素 / 调料」哪一栏
export type ShopCat = '荤' | '素' | '调料';

export interface Ingredient {
  name: string;
  amount: string; // "200克" / "2个" / "适量"
  category: ShopCat;
}

export interface CookStep {
  step: number;
  action: string; // 简短动词："切" "热锅" "下肉翻炒"
  detail: string; // 说明
  heat?: string; // "大火" / "中小火"
  duration?: string; // "3分钟" / "至变色"
}

export interface Recipe {
  id: string;
  name: string;
  cuisine: string; // 川菜/粤菜/家常…
  difficulty: 1 | 2 | 3; // 1 简单 / 2 中等 / 3 较难
  total_minutes: number;
  servings: number; // 几人份
  tags: DietTag[];
  ingredients: Ingredient[];
  steps: CookStep[];
  tips?: string;
}

// —— 周菜谱输出结构 ——
export interface RecipeLite {
  id: string;
  name: string;
  cuisine: string;
  difficulty: number;
  total_minutes: number;
  tags: string[];
}

export interface DayMenu {
  day_index: number;
  weekday: string;
  lunch?: RecipeLite[];
  dinner?: RecipeLite[];
}

export interface ShoppingItem {
  name: string;
  amount: string;
}

export interface ShoppingList {
  meat: ShoppingItem[];
  veg: ShoppingItem[];
  seasoning: ShoppingItem[];
}

export interface WeeklyPlan {
  days: DayMenu[];
  shopping: ShoppingList;
  ai: boolean;
  note?: string; // AI 个性化说明
}

export interface CookRequest {
  people: number; // 人数
  spicy: '要' | '不要' | '随便';
  avoid: string[]; // 忌口标签
  max_minutes: number; // 每餐最长耗时
  new_freq: number; // 0~1 想试新菜比例
  days: number; // 规划天数
  dishes: number; // 每餐几道菜（2/3/4，默认 3）
  mode?: 'ai' | 'rule';
  free_text?: string;
}

export interface TokenUsage {
  input: number;
  output: number;
  cost: number;
  peak: boolean;
}
