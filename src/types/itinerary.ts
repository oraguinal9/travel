// 行程数据模型（移植自 TripStar 的 TripPlan schema，TS 版）
// 前端按此结构渲染行程卡 + 地图 + 预算面板

export interface Location {
  longitude: number;
  latitude: number;
}

export interface Attraction {
  name: string;
  address: string;
  location: Location;
  visit_duration: number; // 分钟
  description: string;
  category?: string;
  rating?: number;
  image_url?: string;
  ticket_price?: number;
  reservation_required?: boolean;
  reservation_tips?: string;
}

export interface Meal {
  type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  name: string;
  address?: string;
  location?: Location;
  description?: string;
  estimated_cost?: number;
}

export interface Hotel {
  name: string;
  address: string;
  location?: Location;
  price_range: string;
  rating: string;
  estimated_cost?: number;
}

export interface Budget {
  total_attractions: number;
  total_hotels: number;
  total_meals: number;
  total_transportation: number;
  total_inter_city_transport?: number;
  total: number; // 单位：元
}

export interface DayPlan {
  date: string;
  day_index: number;
  city?: string;
  is_transfer_day?: boolean;
  transfer_info?: string;
  description: string;
  transportation: string;
  accommodation: string;
  hotel?: Hotel;
  attractions: Attraction[];
  meals: Meal[];
}

export interface WeatherInfo {
  date: string;
  city?: string;
  day_weather: string;
  night_weather: string;
  day_temp: number;
  night_temp: number;
}

export interface TripPlan {
  city: string;
  cities?: string[];
  start_date: string;
  end_date: string;
  days: DayPlan[];
  weather_info: WeatherInfo[];
  overall_suggestions: string;
  budget?: Budget;
}

// AI 模式下的 token 用量与费用估算（规则模式不消耗 token，usage 为 undefined）
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costYuan: number; // 约 ¥（基于 DeepSeek 峰谷定价估算）
  peak: boolean; // 是否按峰值时段计价
}

// 请求体
export interface PlanRequest {
  city: string;
  cities?: { city: string; days: number }[];
  start_date?: string;
  end_date?: string;
  travel_days: number;
  transportation: string; // 公共交通/自驾/高铁
  accommodation: string; // 经济型/舒适型/豪华
  preferences: string[]; // 美食/历史文化/亲子/自然...
  free_text_input?: string;
  language?: string;
  total_budget?: number;
  city_tier?: 'tier1' | 'new_tier1' | 'other';
  // 规划模式：'ai' = 调用 DeepSeek 推理模型；'rule' = 免 DeepSeek，仅用高德 + Open-Meteo 规则拼装（0 token）
  mode?: 'ai' | 'rule';
}
