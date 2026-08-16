import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

export class RouteTool extends DynamicStructuredTool {
  constructor() {
    super({
      name: 'get_route',
      description:
        '计算两个 POI 之间的交通距离、耗时、费用（公交/地铁/自驾/步行）。输入起点和终点的经纬度(lng,lat)与城市。用于估算 DayPlan 的交通时间与预算。',
      schema: z.object({
        origin: z.string().describe('起点经纬度，格式 lng,lat'),
        destination: z.string().describe('终点经纬度，格式 lng,lat'),
        city: z.string().describe('城市名'),
        mode: z.enum(['transit', 'driving', 'walking']).describe('交通方式'),
      }),
      func: async ({
        origin,
        destination,
        city,
        mode,
      }: {
        origin: string;
        destination: string;
        city: string;
        mode: 'transit' | 'driving' | 'walking';
      }) => {
        const key = process.env.AMAP_KEY;
        if (!key) return '未配置高德 Key（AMAP_KEY）';

        const callDirection = async (m: 'transit' | 'driving' | 'walking') => {
          const url = `https://restapi.amap.com/v5/direction/${m}?key=${key}&origin=${encodeURIComponent(
            origin,
          )}&destination=${encodeURIComponent(destination)}&city=${encodeURIComponent(city)}&show_fields=cost`;
          return fetch(url).then((r) => r.json());
        };

        // 公交(transit)路径规划很多免费 Web 服务 Key 未开通（10017 RESOURCE_UNAVAILABLE），
        // 自动回退到驾车，保证行程生成不中断。
        let usedMode: 'transit' | 'driving' | 'walking' = mode;
        let data: any = await callDirection(mode);
        if (mode === 'transit' && data.status === '0' && data.infocode === '10017') {
          usedMode = 'driving';
          data = await callDirection(usedMode);
        }

        if (data.status !== '1') return `路线查询失败: ${data.info}`;
        const path = data.route?.paths?.[0];
        if (!path) return '无可用路线';

        const km = (Number(path.distance) / 1000).toFixed(1);
        const min = Math.round(Number(path.duration) / 60);

        let costStr = '';
        if (usedMode === 'driving' && data.route?.taxi_cost) {
          costStr = ` 打车约 ¥${data.route.taxi_cost}`;
        } else if (usedMode === 'transit' && path.cost?.transit?.cost) {
          costStr = ` 费用 ${path.cost.transit.cost}`;
        }

        const fallbackNote =
          mode === 'transit' && usedMode === 'driving'
            ? '（公交路径规划未开通，已回退到驾车里程估算）'
            : '';

        return `${usedMode} 距离 ${km}km 约 ${min}分钟${costStr}${fallbackNote}`;
      },
    });
  }
}
