import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

export class PoiTool extends DynamicStructuredTool {
  constructor() {
    super({
      name: 'search_poi',
      description:
        '搜索目的地的景点/餐厅/酒店等 POI，返回名称、地址、经纬度(lng,lat)、评分、门票或价格、图片 URL。用于填充行程的 attractions / meals / hotel。',
      schema: z.object({
        keywords: z.string().describe('搜索词，如 故宫 / 特色火锅 / 经济型酒店'),
        city: z.string().describe('城市名'),
      }),
      func: async ({ keywords, city }: { keywords: string; city: string }) => {
        const key = process.env.AMAP_KEY;
        if (!key) return '未配置高德 Key（AMAP_KEY）';
        const url = `https://restapi.amap.com/v3/place/text?key=${key}&keywords=${encodeURIComponent(
          keywords,
        )}&city=${encodeURIComponent(city)}&citylimit=true&offset=20&page=1`;
        const data = await fetch(url).then((r) => r.json());
        if (data.status !== '1') return `高德查询失败: ${data.info}`;
        const pois = (data.pois || []).slice(0, 8).map((p: any) => ({
          name: p.name,
          address: p.address || '',
          location: (() => {
            const [lng, lat] = (p.location || '').split(',').map(Number);
            return lng && lat ? { longitude: lng, latitude: lat } : { longitude: 0, latitude: 0 };
          })(),
          rating: p.biz_ext?.rating || p.rating || '',
          cost: p.biz_ext?.cost || p.cost || '',
          photo: p.photos && p.photos[0] ? p.photos[0].url : '',
        }));
        return JSON.stringify(pois, null, 2);
      },
    });
  }
}
