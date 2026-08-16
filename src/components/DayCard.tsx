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
      {day.meals?.map((m: any, i: number) => {
        const label =
          m.type === 'lunch' ? '🍱 午餐' : m.type === 'dinner' ? '🍲 晚餐' : m.type === 'breakfast' ? '☕ 早餐' : '🍡 小吃';
        const dist =
          m.distance != null ? (m.distance >= 1000 ? `${(m.distance / 1000).toFixed(1)} km` : `${m.distance} m`) : '';
        return (
          <div
            key={'m' + i}
            style={{
              fontSize: 13,
              marginBottom: 6,
              background: '#fffbe6',
              border: '1px solid #ffe58f',
              borderRadius: 8,
              padding: '6px 10px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
              <span style={{ fontWeight: 600 }}>
                {label}：{m.name}
              </span>
              <span style={{ color: '#999', whiteSpace: 'nowrap' }}>
                {m.rating ? `⭐${m.rating}` : ''}
                {m.cost ? ` · 人均¥${m.cost}` : ''}
                {dist ? ` · ${dist}` : ''}
              </span>
            </div>
            {m.address ? <div style={{ fontSize: 12, color: '#888' }}>{m.address}</div> : null}
            {m.reason ? <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{m.reason}</div> : null}
            {m.tags?.length ? (
              <div style={{ marginTop: 2 }}>
                {m.tags.map((t: string, k: number) => (
                  <span
                    key={k}
                    style={{
                      fontSize: 11,
                      background: '#e6f4ff',
                      color: '#1677ff',
                      borderRadius: 999,
                      padding: '1px 8px',
                      marginRight: 4,
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
      {day.transfer_info ? <div style={{ fontSize: 13, color: '#a33', marginTop: 6 }}>{day.transfer_info}</div> : null}
      <div style={{ fontSize: 13, color: '#666', marginTop: 8 }}>住宿：{day.accommodation}</div>
    </div>
  );
}
