export default function DayCard({ day }: { day: any }) {
  return (
    <div style={{ border: '1px solid #e5e5e5', borderRadius: 12, padding: '12px 16px', marginBottom: 12 }}>
      <p style={{ fontWeight: 600, margin: '0 0 8px' }}>
        Day {day.day_index + 1} · {day.date}
        {day.is_transfer_day ? ' · 城际移动' : ''}
      </p>
      {day.attractions?.map((a: any, i: number) => (
        <div key={i} style={{ fontSize: 13, marginBottom: 6, display: 'flex', gap: 8 }}>
          <span style={{ color: '#185fa5' }}>{i + 1}</span>
          <span>
            {a.name} · {a.visit_duration}分钟{a.ticket_price ? ` · ¥${a.ticket_price}` : ''}
          </span>
        </div>
      ))}
      {day.meals?.map((m: any, i: number) => (
        <div key={'m' + i} style={{ fontSize: 13, color: '#888' }}>
          · {m.type}: {m.name}
          {m.estimated_cost ? ` ¥${m.estimated_cost}` : ''}
        </div>
      ))}
      {day.transfer_info ? <div style={{ fontSize: 13, color: '#a33', marginTop: 6 }}>{day.transfer_info}</div> : null}
      <div style={{ fontSize: 13, color: '#666', marginTop: 8 }}>住宿：{day.accommodation}</div>
    </div>
  );
}
