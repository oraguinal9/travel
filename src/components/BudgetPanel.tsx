export default function BudgetPanel({ budget }: { budget: any }) {
  if (!budget) return null;
  const rows: [string, number][] = [
    ['酒店', budget.total_hotels],
    ['餐饮', budget.total_meals],
    ['交通', budget.total_transportation],
    ['门票/杂项', (budget.total_attractions || 0) + (budget.total_inter_city_transport || 0)],
  ];
  return (
    <div style={{ border: '1px solid #e5e5e5', borderRadius: 12, padding: '12px 16px', marginTop: 16 }}>
      <p style={{ fontWeight: 600, margin: '0 0 12px' }}>预算明细</p>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
          <span style={{ color: '#666' }}>{k}</span>
          <span>¥{v}</span>
        </div>
      ))}
      <div style={{ borderTop: '1px solid #eee', paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
        <span>总计</span>
        <span>¥{budget.total}</span>
      </div>
    </div>
  );
}
