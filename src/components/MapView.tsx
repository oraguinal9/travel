'use client';

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    AMap?: any;
    _AMapSecurityConfig?: { securityJsCode: string };
  }
}

export default function MapView({ plan }: { plan: any }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_AMAP_JS_KEY;
    const security = process.env.NEXT_PUBLIC_AMAP_JS_SECURITY;
    if (!key || !ref.current) return;

    if (security) window._AMapSecurityConfig = { securityJsCode: security };

    const script = document.createElement('script');
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${key}&plugin=AMap.AutoComplete`;
    script.onload = () => {
      if (!window.AMap || !ref.current) return;
      const map = new window.AMap.Map(ref.current, { zoom: 11 });
      const pts: [number, number][] = [];
      (plan.days || []).forEach((d: any) =>
        (d.attractions || []).forEach((a: any) => {
          if (a.location?.longitude) pts.push([a.location.longitude, a.location.latitude]);
        }),
      );
      if (pts.length) {
        const markers = pts.map((p) => new window.AMap.Marker({ position: p }));
        map.add(markers);
        map.setFitView();
      }
    };
    document.head.appendChild(script);
    return () => {
      if (script.parentNode) script.parentNode.removeChild(script);
    };
  }, [plan]);

  return (
    <div
      ref={ref}
      style={{ height: 240, background: '#f2f2f2', borderRadius: 12, marginBottom: 16 }}
    />
  );
}
