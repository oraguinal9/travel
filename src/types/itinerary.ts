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
  // 行程内餐食增强（来自高德周边真实 POI）
  rating?: number; // 高德评分（0-5）
  cost?: number; // 人均消费（元）
  distance?: number; // 与当天所在位置距离（米）
  reason?: string; // AI 模式：推荐理由
  tags?: string[]; // AI 模式：标签
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

// ===== 周边探店 / 美食推荐 =====

export interface FoodPOI {
  id: string;
  name: string;
  category: string; // 高德分类（取第一个，如 餐饮服务;中餐厅 → 中餐厅）
  address: string;
  distance: number; // 与中心点距离（米）
  rating?: number; // 高德评分（0-5）
  cost?: number; // 人均消费（元）
  location: Location;
  photo?: string;
  tel?: string;
  reason?: string; // AI 模式：推荐理由
  tags?: string[]; // AI 模式：标签
}

export interface FoodWeather {
  day_weather: string;
  day_temp: number;
  night_temp: number;
  tip: string; // 结合天气给的就餐建议
}

export interface FoodResult {
  center_name: string;
  center: Location;
  keywords: string;
  radius: number;
  weather?: FoodWeather;
  restaurants: FoodPOI[];
  summary?: string; // AI 模式总体点评
  generated_at: string;
}

export interface FoodRequest {
  place?: string; // 文字位置（如 成都春熙路）；与经纬度二选一
  longitude?: number; // 浏览器定位经度
  latitude?: number; // 浏览器定位纬度
  keywords?: string; // 想吃什么：火锅/咖啡/川菜…，空 = 美食
  radius?: number; // 搜索半径（米），默认 2000
  sort?: 'distance' | 'rating';
  mode?: 'ai' | 'rule';
}
