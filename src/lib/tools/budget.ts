import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

// 启发式预算拆分（改自 tia_ref 的 tripBudgetPlanner，币种改 ¥）
// 酒店 45% / 餐饮 30% / 交通 20% / 杂项 5%
export class BudgetTool extends DynamicStructuredTool {
  constructor() {
    super({
      name: 'plan_budget',
      description:
        '根据总预算、天数、城市等级，拆分酒店/餐饮/交通/杂项，输出 Budget JSON。若用户未给总预算，则按城市等级给参考总预算。',
      schema: z.object({
        total: z.number().optional().describe('总预算(元)，可不填'),
        days: z.number().int().min(1).describe('天数'),
        city_tier: z
          .enum(['tier1', 'new_tier1', 'other'])
          .describe('城市等级: tier1 一线 / new_tier1 新一线 / other 其他'),
      }),
      func: async ({
        total,
        days,
        city_tier,
      }: {
        total?: number;
        days: number;
        city_tier: 'tier1' | 'new_tier1' | 'other';
      }) => {
        const perDayRef = city_tier === 'tier1' ? 700 : city_tier === 'new_tier1' ? 500 : 350;
        const totalBudget = total ?? perDayRef * days;
        const hotels = Math.round(totalBudget * 0.45);
        const meals = Math.round(totalBudget * 0.3);
        const transport = Math.round(totalBudget * 0.2);
        const misc = totalBudget - hotels - meals - transport;
        const budget = {
          total_attractions: 0, // 由景点门票累加填充
          total_hotels: hotels,
          total_meals: meals,
          total_transportation: transport,
          total_inter_city_transport: 0,
          total: totalBudget,
          _hotel_per_night: Math.round(hotels / days),
          _ref_total_if_unset: perDayRef * days,
        };
        return JSON.stringify(budget);
      },
    });
  }
}
