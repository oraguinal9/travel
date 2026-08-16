import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

const WEATHER_CODE: Record<number, string> = {
  0: '晴', 1: '大致晴朗', 2: '局部多云', 3: '阴',
  45: '雾', 48: '雾凇',
  51: '毛毛雨', 53: '小雨', 55: '中雨', 56: '冻雨', 57: '冻雨',
  61: '小雨', 63: '中雨', 65: '大雨', 66: '冻雨', 67: '强冻雨',
  71: '小雪', 73: '中雪', 75: '大雪', 77: '雪粒',
  80: '阵雨', 81: '强阵雨', 82: '暴雨',
  85: '阵雪', 86: '强阵雪',
  95: '雷阵雨', 96: '雷阵雨伴冰雹', 99: '强雷暴',
};

// 简单别名表（Open-Meteo 地理编码已能处理大部分中文城市）
const CITY_ALIASES: Record<string, string> = {
  monali: 'Manali',
  spiti: 'Kaza',
  'leh ladakh': 'Leh',
};

export class WeatherTool extends DynamicStructuredTool {
  constructor() {
    super({
      name: 'get_weather_forecast',
      description:
        '获取目的地未来 N 天天气（最高/最低温 + 天气状况 + 降水概率），用于决定穿衣与行程。输入城市名和天数。免费、无需 Key。',
      schema: z.object({
        city: z.string().describe('城市名，如 北京'),
        days: z.number().int().min(1).max(15).describe('天数'),
      }),
      func: async ({ city, days }: { city: string; days: number }) => {
        const c = CITY_ALIASES[city.toLowerCase().trim()] || city;
        const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
          c,
        )}&count=1&language=zh&format=json`;
        const geo = await fetch(geoUrl).then((r) => r.json());
        if (!geo.results || !geo.results.length) return `找不到城市 ${city}`;
        const { latitude, longitude, name } = geo.results[0];

        const fUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FShanghai&forecast_days=${days}`;
        const f = await fetch(fUrl).then((r) => r.json());
        const d = f.daily;
        if (!d || !d.time) return `天气获取失败: ${city}`;
        const lines = d.time.map(
          (t: string, i: number) =>
            `${t}: ${WEATHER_CODE[d.weather_code[i]] ?? '未知'} ${d.temperature_2m_min[i]}~${
              d.temperature_2m_max[i]
            }℃ 降水${d.precipitation_probability_max[i] ?? 0}%`,
        );
        return `城市 ${name} 未来${days}天:\n` + lines.join('\n');
      },
    });
  }
}
