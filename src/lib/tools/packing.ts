import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

const RULES: Record<string, string[]> = {
  mountain: ['冲锋衣', '登山鞋', '防晒霜', '墨镜', '保温水壶'],
  beach: ['泳衣', '防晒霜', '遮阳帽', '拖鞋', '沙滩巾'],
  business: ['正装', '名片', '便携熨斗', '笔记本电脑'],
  family: ['儿童药品', '湿巾', '零食', '推车', '备用衣物'],
  default: ['身份证/护照', '充电宝', '常用药', '换洗衣物', '雨具'],
};

export class PackingTool extends DynamicStructuredTool {
  constructor() {
    super({
      name: 'packing_checklist',
      description: '根据天数、天气摘要、tripType 生成打包清单。',
      schema: z.object({
        days: z.number().int().min(1).describe('天数'),
        weather: z.string().describe('天气摘要文本'),
        tripType: z.enum(['mountain', 'beach', 'business', 'family', 'default']).describe('旅行类型'),
      }),
      func: async ({
        days,
        weather,
        tripType,
      }: {
        days: number;
        weather: string;
        tripType: 'mountain' | 'beach' | 'business' | 'family' | 'default';
      }) => {
        const base = RULES[tripType] || RULES.default;
        const lowTemp = Number((weather.match(/-?\d+/) || [20])[0]);
        const extra: string[] = [];
        if (weather.includes('雨')) extra.push('雨伞');
        if (weather.includes('雪') || lowTemp < 5) extra.push('保暖内衣', '手套');
        return `打包清单(${days}天): ` + [...base, ...extra].join('、');
      },
    });
  }
}
