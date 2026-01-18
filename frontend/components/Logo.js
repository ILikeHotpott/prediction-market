'use client';

import React, { useEffect, useMemo, useRef, useState, useId } from 'react';
import { Bungee } from 'next/font/google';

const bungee = Bungee({
  weight: '400',
  subsets: ['latin'],
});

export default function MonoFutureMarqueeLogo({
  text = 'MONOFUTURE',
  bulbCount = 52, // 4 的倍数
  speedMs = 90,
  className,
  style,
}) {
  const N = Math.max(4, Math.floor(bulbCount / 4) * 4);

  const pathRef = useRef(null);
  const [pts, setPts] = useState([]);
  const [phase, setPhase] = useState(0);

  const reactId = useId();
  const uid = useMemo(() => `mf_${reactId.replace(/:/g, '')}`, [reactId]);

  // --- 画布尺寸 ---
  const W = 900;
  const H = 360;

  // 外框
  const outer = {
    x: 44,
    y: 44,
    w: W - 88,
    h: H - 88,
    rx: 52,
  };


  const innerInsetX = 50;
  const innerInsetY = 48;

  const inner = {
    x: outer.x + innerInsetX,
    y: outer.y + innerInsetY,
    w: outer.w - innerInsetX * 2,
    h: outer.h - innerInsetY * 2,
    rx: 32,
  };

  // 灯带路径（环形中线）
  const pathInset = 30;
  const px = outer.x + pathInset;
  const py = outer.y + pathInset;
  const pw = outer.w - pathInset * 2;
  const ph = outer.h - pathInset * 2;
  const pr = Math.max(10, outer.rx - pathInset);

  const roundedRectPath = `
    M ${px + pr} ${py}
    H ${px + pw - pr}
    A ${pr} ${pr} 0 0 1 ${px + pw} ${py + pr}
    V ${py + ph - pr}
    A ${pr} ${pr} 0 0 1 ${px + pw - pr} ${py + ph}
    H ${px + pr}
    A ${pr} ${pr} 0 0 1 ${px} ${py + ph - pr}
    V ${py + pr}
    A ${pr} ${pr} 0 0 1 ${px + pr} ${py}
    Z
  `;

  // 等距布灯
  useEffect(() => {
    const path = pathRef.current;
    if (!path) return;

    const total = path.getTotalLength();
    const p = [];
    for (let i = 0; i < N; i += 1) {
      const at = (total * i) / N;
      const pt = path.getPointAtLength(at);
      p.push({ x: pt.x, y: pt.y });
    }
    setPts(p);
  }, [N]);

  // 顺时针滚动
  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduce) return;

    const t = setInterval(() => {
      setPhase((p) => (p + 1) % 4);
    }, Math.max(16, speedMs));

    return () => clearInterval(t);
  }, [speedMs]);

  // 每 4 个：非常亮、亮、不是很亮、不亮
  const stateOf = (i) => (i + phase) & 3;

  const bulbStyle = (s) => {
    switch (s) {
      case 0:
        return { r: 10.5, fill: '#FFFFFF', opacity: 1, glow: 1.0 };
      case 1:
        return { r: 9.5, fill: '#FFFFFF', opacity: 0.85, glow: 0.75 };
      case 2:
        return { r: 8.5, fill: '#FFD48A', opacity: 0.55, glow: 0.35 };
      default:
        return { r: 8.0, fill: '#FFB874', opacity: 0.16, glow: 0.0 };
    }
  };

  // 文字最大宽度（黑底更宽后，文字就不挤了）
  const textMaxW = inner.w - 36;

  return (
    <div
      className={className}
      style={{
        width: '100%',
        maxWidth: 1300,
        aspectRatio: '2.5 / 1',
        ...style,
      }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height="100%"
        role="img"
        aria-label={text}
        style={{ transform: 'translateY(8px)' }}
      >
        <defs>
          <filter id={`${uid}_shadow`} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="#000000" floodOpacity="0.35" />
          </filter>

          <filter id={`${uid}_glow`} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3.6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id={`${uid}_textShadow`} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="4" stdDeviation="1" floodColor="#000000" floodOpacity="0.35" />
          </filter>

          <linearGradient id={`${uid}_gold`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFE2A6" />
            <stop offset="55%" stopColor="#F2C66F" />
            <stop offset="100%" stopColor="#D49A3E" />
          </linearGradient>

          <pattern
            id={`${uid}_stripes`}
            patternUnits="userSpaceOnUse"
            width="14"
            height="14"
            patternTransform="rotate(-20)"
          >
            <rect width="14" height="14" fill="transparent" />
            <rect x="0" y="0" width="6" height="14" fill="rgba(255,255,255,0.22)" />
          </pattern>

          <clipPath id={`${uid}_innerClip`}>
            <rect x={inner.x} y={inner.y} width={inner.w} height={inner.h} rx={inner.rx} />
          </clipPath>

          <mask id={`${uid}_textMask`}>
            <rect x="0" y="0" width={W} height={H} fill="black" />
            <text
              x={W / 2}
              y={inner.y + inner.h / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="132"
              fontWeight="900"
              fill="white"
              stroke="white"
              strokeWidth="4"
              strokeLinejoin="round"
              lengthAdjust="spacingAndGlyphs"
              textLength={textMaxW}
              style={{ fontFamily: bungee.style.fontFamily }}
            >
              {text}
            </text>
          </mask>
        </defs>

        {/* 背景底色（透明以融入页面背景） */}
        <rect x="0" y="0" width={W} height={H} fill="transparent" />

        {/* 红色外框灯带底 */}
        <g filter={`url(#${uid}_shadow)`}>
          <rect x={outer.x} y={outer.y} width={outer.w} height={outer.h} rx={outer.rx} fill="#D95B55" />
          <rect
            x={outer.x + 8}
            y={outer.y + 8}
            width={outer.w - 16}
            height={outer.h - 16}
            rx={outer.rx - 8}
            fill="none"
            stroke="#B64A46"
            strokeWidth="6"
            opacity="0.9"
          />
        </g>

        {/* 黑色内框：严格裁切在圆角区域 */}
        <g clipPath={`url(#${uid}_innerClip)`}>
          <rect x={inner.x} y={inner.y} width={inner.w} height={inner.h} rx={inner.rx} fill="#1F2A2D" />
          <rect
            x={inner.x + 6}
            y={inner.y + 6}
            width={inner.w - 12}
            height={inner.h - 12}
            rx={Math.max(8, inner.rx - 6)}
            fill="none"
            stroke="#0F171A"
            strokeWidth="10"
            opacity="0.75"
          />
        </g>

        {/* 灯带路径 */}
        <path ref={pathRef} d={roundedRectPath} fill="none" stroke="transparent" strokeWidth="1" />

        {/* 灯座 */}
        {pts.map((p, i) => (
          <rect
            key={`sock_${i}`}
            x={p.x - 7}
            y={p.y - 7}
            width="14"
            height="14"
            rx="2"
            fill="#E7A864"
            opacity="0.75"
          />
        ))}

        {/* 灯泡 */}
        {pts.map((p, i) => {
          const s = stateOf(i);
          const b = bulbStyle(s);
          const useGlow = b.glow > 0.01;

          return (
            <g key={`bulb_${i}`}>
              {useGlow && (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={b.r + 7}
                  fill={b.fill}
                  opacity={0.22 * b.glow}
                  filter={`url(#${uid}_glow)`}
                />
              )}
              <circle
                cx={p.x}
                cy={p.y}
                r={b.r}
                fill={b.fill}
                opacity={b.opacity}
                filter={useGlow ? `url(#${uid}_glow)` : undefined}
              />
            </g>
          );
        })}

        {/* 文字（Bungee） */}
        <g>
          <text
            x={W / 2}
            y={inner.y + inner.h / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="132"
            fontWeight="900"
            fill={`url(#${uid}_gold)`}
            stroke="#D49A3E"
            strokeWidth="2"
            strokeLinejoin="round"
            paintOrder="stroke fill"
            lengthAdjust="spacingAndGlyphs"
            textLength={textMaxW}
            style={{ fontFamily: bungee.style.fontFamily }}
          >
            {text}
          </text>

          <rect x="0" y="0" width={W} height={H} fill={`url(#${uid}_stripes)`} mask={`url(#${uid}_textMask)`} opacity="0.9" />
        </g>
      </svg>
    </div>
  );
}
