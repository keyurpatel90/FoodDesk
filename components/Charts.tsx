'use client';

import { useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from 'react';

/* Small, dependency-free chart primitives. Colours come from CSS variables so
   they follow the Materialize theme in app/materialize.css. */

export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function niceCeil(v: number) {
  if (v <= 0) return 4;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * p;
}

type Pt = readonly [number, number];

function smoothPath(p: readonly Pt[], lo: number, hi: number) {
  if (!p.length) return '';
  let d = `M${p[0][0]},${p[0][1]}`;
  const clamp = (v: number) => Math.min(hi, Math.max(lo, v));
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = clamp(p1[1] + (p2[1] - p0[1]) / 6);
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = clamp(p2[1] - (p3[1] - p1[1]) / 6);
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}

/** Tiny trend line for KPI cards. Inherits its colour from `currentColor`. */
export function Sparkline({ values }: { values: number[] }) {
  const gid = useId();
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  if (values.length < 2 || max === min) {
    return <svg className="spark" viewBox="0 0 100 36" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="30" x2="100" y2="30" stroke="currentColor" strokeOpacity=".35" strokeWidth="2" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" /></svg>;
  }
  const pts: Pt[] = values.map((v, i) => [(i / (values.length - 1)) * 100, 32 - ((v - min) / (max - min)) * 28]);
  const line = smoothPath(pts, 2, 32);
  return <svg className="spark" viewBox="0 0 100 36" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".28" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
    <path d={`${line} L100,36 L0,36 Z`} fill={`url(#${gid})`} />
    <path d={line} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
  </svg>;
}

/** Area/line chart with hover read-out. Sized to its container in real pixels so text stays legible on phones. */
export function TrendChart({ labels, values, format, axisFormat, minMax = 0, height = 250, ariaLabel }: {
  labels: string[];
  values: number[];
  format: (n: number) => string;
  axisFormat?: (n: number) => string;
  minMax?: number;
  height?: number;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const gid = useId();
  const [hover, setHover] = useState<number | null>(null);
  const n = values.length;
  const padL = 48, padR = 14, padT = 14, padB = 30;
  const W = Math.max(width, 260);
  const H = height;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const top = niceCeil(Math.max(...values, minMax));
  const x = (i: number) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => padT + plotH - (v / top) * plotH;
  const pts: Pt[] = values.map((v, i) => [x(i), y(v)]);
  const line = smoothPath(pts, padT, padT + plotH);
  const ticks = [0, 1, 2, 3, 4].map(k => (top * k) / 4);
  const step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 62))));
  const axis = axisFormat ?? format;

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left - padL) / plotW) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  };

  const tipLeft = hover === null ? 0 : Math.min(W - 70, Math.max(70, x(hover)));

  return <div className="trendWrap" ref={ref} style={{ height }}>
    {width > 0 && n > 0 && <>
      <svg width={W} height={H} role="img" aria-label={ariaLabel} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}>
        <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--primary)" stopOpacity=".3" /><stop offset="1" stopColor="var(--primary)" stopOpacity="0" /></linearGradient></defs>
        {ticks.map(t => <g key={t}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray={t === 0 ? undefined : '3 5'} />
          <text x={padL - 10} y={y(t) + 4} textAnchor="end" className="axisText">{axis(t)}</text>
        </g>)}
        {labels.map((l, i) => i % step === 0 ? <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="axisText">{l}</text> : null)}
        {n > 1 && <path d={`${line} L${x(n - 1)},${padT + plotH} L${x(0)},${padT + plotH} Z`} fill={`url(#${gid})`} />}
        <path d={line} fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" />
        {hover !== null && <>
          <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + plotH} stroke="var(--primary)" strokeOpacity=".35" />
          <circle cx={x(hover)} cy={y(values[hover])} r="6" fill="#fff" stroke="var(--primary)" strokeWidth="3" />
        </>}
      </svg>
      {hover !== null && <div className="chartTip" style={{ left: tipLeft, top: Math.max(0, y(values[hover]) - 58) }}><small>{labels[hover]}</small><b>{format(values[hover])}</b></div>}
    </>}
  </div>;
}

/** Ring chart. Children render in the centre. */
export function Donut({ segments, size = 150, stroke = 18, label, children }: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
  stroke?: number;
  label: string;
  children?: ReactNode;
}) {
  const live = segments.filter(s => s.value > 0);
  const total = live.reduce((sum, s) => sum + s.value, 0);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const gap = live.length > 1 ? 4 : 0;
  const arcs = live.map((s, i) => ({ ...s, len: (s.value / total) * c, offset: live.slice(0, i).reduce((sum, v) => sum + (v.value / total) * c, 0) }));
  return <div className="donut" style={{ width: size, height: size }}>
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
      {arcs.map(a => <circle key={a.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={a.color} strokeWidth={stroke}
        strokeDasharray={`${Math.max(a.len - gap, 0)} ${c}`} strokeDashoffset={-a.offset} transform={`rotate(-90 ${size / 2} ${size / 2})`} />)}
    </svg>
    <div className="donutCenter">{children}</div>
  </div>;
}

/** Column chart; the tallest column is highlighted. */
export function Bars({ items, ariaLabel }: { items: { label: string; value: number; hint: string }[]; ariaLabel: string }) {
  const max = Math.max(...items.map(i => i.value), 0);
  const labelEvery = Math.max(1, Math.ceil(items.length / 8));
  return <div className="bars" role="img" aria-label={ariaLabel} style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
    {items.map((item, i) => {
      const peak = max > 0 && item.value === max;
      return <div className="barCol" key={`${item.label}-${i}`} title={item.hint}>
        <span className="barVal">{peak ? item.value : ''}</span>
        <div className="barTrack"><div className={'bar' + (peak ? ' peak' : '')} style={{ height: max ? `${Math.max(4, (item.value / max) * 100)}%` : '4%' }} /></div>
        <span className="barLbl">{i % labelEvery === 0 ? item.label : ''}</span>
      </div>;
    })}
  </div>;
}
