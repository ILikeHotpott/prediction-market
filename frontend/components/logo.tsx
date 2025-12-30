"use client";

import React, { useId } from "react";

type Props = {
  /** 外层宽度（默认 420），高度自动按比例 */
  width?: number | string;
  className?: string;

  /** 灯泡数量（等间距沿边框排一圈） */
  bulbCount?: number;

  /** 内侧小方块“铆钉”数量（等间距一圈） */
  studCount?: number;

  /** 一圈滚动用时（毫秒） */
  speedMs?: number;

  /** 你已有的文字/Logo内容：字体和颜色你自己控制（推荐传入） */
  children?: React.ReactNode;

  /** 如果不传 children，就用默认文字 */
  text?: string;
};

type Rect = { x: number; y: number; w: number; h: number; r: number };

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

/**
 * 计算圆角矩形周长
 * CCW（逆时针）路径：从“上边靠右、离右上圆角 r 的点”开始，沿上边向左 -> 左上圆角 -> 左边向下 -> 左下圆角 -> 下边向右 -> 右下圆角 -> 右边向上 -> 右上圆角回到起点
 */
function roundedRectPerimeter(rect: Rect) {
  const r = clamp(rect.r, 0, Math.min(rect.w, rect.h) / 2);
  const top = rect.w - 2 * r;
  const side = rect.h - 2 * r;
  const arc = 0.5 * Math.PI * r; // quarter circle
  const total = 2 * (top + side) + 4 * arc;
  return { r, top, side, arc, total };
}

function pointAtDistanceCCW(rect: Rect, d: number) {
  const { x, y, w, h } = rect;
  const { r, top, side, arc, total } = roundedRectPerimeter(rect);

  let dist = ((d % total) + total) % total;

  // 1) Top edge: (x+w-r, y) -> (x+r, y)  (left)
  if (dist < top) {
    const u = dist / top;
    return { cx: x + (w - r) - u * top, cy: y };
  }
  dist -= top;

  // 2) Top-left arc: (x+r,y) -> (x,y+r)
  if (dist < arc) {
    const u = dist / arc;
    const theta = (-90 - u * 90) * (Math.PI / 180); // -90 -> -180
    const cx = x + r;
    const cy = y + r;
    return { cx: cx + r * Math.cos(theta), cy: cy + r * Math.sin(theta) };
  }
  dist -= arc;

  // 3) Left edge: (x, y+r) -> (x, y+h-r) (down)
  if (dist < side) {
    const u = dist / side;
    return { cx: x, cy: y + r + u * side };
  }
  dist -= side;

  // 4) Bottom-left arc: (x,y+h-r) -> (x+r,y+h)
  if (dist < arc) {
    const u = dist / arc;
    const theta = (-180 - u * 90) * (Math.PI / 180); // -180 -> -270
    const cx = x + r;
    const cy = y + (h - r);
    return { cx: cx + r * Math.cos(theta), cy: cy + r * Math.sin(theta) };
  }
  dist -= arc;

  // 5) Bottom edge: (x+r,y+h) -> (x+w-r,y+h) (right)
  if (dist < top) {
    const u = dist / top;
    return { cx: x + r + u * top, cy: y + h };
  }
  dist -= top;

  // 6) Bottom-right arc: (x+w-r,y+h) -> (x+w,y+h-r)
  if (dist < arc) {
    const u = dist / arc;
    const theta = (90 - u * 90) * (Math.PI / 180); // 90 -> 0
    const cx = x + (w - r);
    const cy = y + (h - r);
    return { cx: cx + r * Math.cos(theta), cy: cy + r * Math.sin(theta) };
  }
  dist -= arc;

  // 7) Right edge: (x+w,y+h-r) -> (x+w,y+r) (up)
  if (dist < side) {
    const u = dist / side;
    return { cx: x + w, cy: y + (h - r) - u * side };
  }
  dist -= side;

  // 8) Top-right arc: (x+w,y+r) -> (x+w-r,y)
  // dist < arc
  {
    const u = dist / arc;
    const theta = (0 - u * 90) * (Math.PI / 180); // 0 -> -90
    const cx = x + (w - r);
    const cy = y + r;
    return { cx: cx + r * Math.cos(theta), cy: cy + r * Math.sin(theta) };
  }
}

function buildPointsOnRoundedRect(rect: Rect, count: number) {
  const { total } = roundedRectPerimeter(rect);
  const step = total / count;
  const pts = Array.from({ length: count }, (_, i) => pointAtDistanceCCW(rect, i * step));
  return pts;
}

export default function ShopMarqueeLogo({
  width = 420,
  className,
  bulbCount = 34,
  studCount = 44,
  speedMs = 1400,
  children,
  text = "SHOP",
}: Props) {
  const uid = useId().replace(/:/g, "");
  const glowId = `glow-${uid}`;
  const frameGradId = `frameGrad-${uid}`;
  const panelShadowId = `panelShadow-${uid}`;
  const stripeId = `stripes-${uid}`;
  const textGradId = `textGrad-${uid}`;

  // 以你给的图比例（686 x 352）
  const VB_W = 686;
  const VB_H = 352;

  // 外框（红色灯带）
  const frame: Rect = { x: 18, y: 18, w: VB_W - 36, h: VB_H - 36, r: 58 };
  const frameThickness = 34;

  // 内面板
  const panel: Rect = {
    x: frame.x + frameThickness,
    y: frame.y + frameThickness,
    w: frame.w - frameThickness * 2,
    h: frame.h - frameThickness * 2,
    r: Math.max(16, frame.r - frameThickness),
  };

  // 灯泡沿“外框中线”走一圈（略微靠外）
  const bulbsRect: Rect = {
    x: frame.x + 10,
    y: frame.y + 10,
    w: frame.w - 20,
    h: frame.h - 20,
    r: frame.r - 10,
  };

  // 铆钉沿“红框内侧”走一圈
  const studsRect: Rect = {
    x: frame.x + frameThickness * 0.55,
    y: frame.y + frameThickness * 0.55,
    w: frame.w - frameThickness * 1.1,
    h: frame.h - frameThickness * 1.1,
    r: frame.r - frameThickness * 0.55,
  };

  const bulbPts = buildPointsOnRoundedRect(bulbsRect, bulbCount);
  const studPts = buildPointsOnRoundedRect(studsRect, studCount);

  // 动画：每个灯泡延迟一个 step，形成“逆时针滚动”
  const durationSec = Math.max(0.6, speedMs / 1000);

  return (
    <div
      className={className}
      style={{
        width,
        aspectRatio: `${VB_W} / ${VB_H}`,
        display: "inline-block",
      }}
      aria-label="SHOP marquee logo"
      role="img"
    >
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width="100%" height="100%" style={{ display: "block" }}>
        <defs>
          {/* 红色灯带渐变（更接近像素图的亮暗） */}
          <linearGradient id={frameGradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f08a7e" />
            <stop offset="35%" stopColor="#e4584d" />
            <stop offset="70%" stopColor="#c73c33" />
            <stop offset="100%" stopColor="#a92f28" />
          </linearGradient>

          {/* 内面板阴影 */}
          <filter id={panelShadowId} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#000" floodOpacity="0.35" />
          </filter>

          {/* 灯泡光晕 */}
          <filter id={glowId} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* 文字斜纹（默认文字用；你如果传 children 就不会用到） */}
          <pattern id={stripeId} width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(-18)">
            <rect width="18" height="18" fill="transparent" />
            <rect x="0" y="0" width="6" height="18" fill="rgba(255,255,255,0.20)" />
          </pattern>

          <linearGradient id={textGradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f6d28e" />
            <stop offset="55%" stopColor="#e3b86a" />
            <stop offset="100%" stopColor="#c99645" />
          </linearGradient>
        </defs>

        {/* 外框（红色灯带本体） */}
        <rect
          x={frame.x}
          y={frame.y}
          width={frame.w}
          height={frame.h}
          rx={frame.r}
          ry={frame.r}
          fill={`url(#${frameGradId})`}
          stroke="#7c2520"
          strokeWidth="6"
        />

        {/* 内面板（背景色） */}
        <rect
          x={panel.x}
          y={panel.y}
          width={panel.w}
          height={panel.h}
          rx={panel.r}
          ry={panel.r}
          fill="#162123"
          filter={`url(#${panelShadowId})`}
          stroke="#0e1415"
          strokeWidth="6"
        />

        {/* 铆钉（红框里一圈小黄方块，等间距） */}
        {studPts.map((p, i) => (
          <g key={`stud-${i}`} transform={`translate(${p.cx}, ${p.cy})`}>
            <rect
              x={-5.4}
              y={-5.4}
              width={10.8}
              height={10.8}
              rx={2}
              fill="#eaa361"
              stroke="#8b5a2b"
              strokeWidth="1.2"
            />
            <rect x={-3.6} y={-3.6} width={7.2} height={7.2} rx={1.6} fill="rgba(255,255,255,0.10)" />
          </g>
        ))}

        {/* 灯泡（底色：暗，永远在） */}
        {bulbPts.map((p, i) => (
          <circle
            key={`bulb-base-${i}`}
            cx={p.cx}
            cy={p.cy}
            r={9.2}
            fill="rgba(255,240,230,0.28)"
            stroke="rgba(255,210,200,0.22)"
            strokeWidth="2"
          />
        ))}

        {/* 灯泡（亮光层：按顺序点亮，形成逆时针滚动） */}
        {bulbPts.map((p, i) => {
          const delay = -((i * durationSec) / bulbCount);
          return (
            <circle
              key={`bulb-bright-${i}`}
              cx={p.cx}
              cy={p.cy}
              r={9.6}
              className="bulbBright"
              filter={`url(#${glowId})`}
              style={{
                animationDelay: `${delay}s`,
                animationDuration: `${durationSec}s`,
              }}
              fill="rgba(255,255,255,0.98)"
            />
          );
        })}

        {/* 中间内容：你已有的字体/颜色建议用 children 传入（保持不改） */}
        {children ?? (
          <g>
            {/* 默认文字描边 + 渐变 + 斜纹叠加（尽量贴近图里那种“金色像素”感觉） */}
            <text
              x={VB_W / 2}
              y={VB_H / 2 + 46}
              textAnchor="middle"
              fontSize="164"
              fontWeight="900"
              fontFamily="inherit"
              fill={`url(#${textGradId})`}
              stroke="#7d5b27"
              strokeWidth="10"
              paintOrder="stroke"
              style={{ letterSpacing: "6px" }}
            >
              {text}
            </text>
            <text
              x={VB_W / 2}
              y={VB_H / 2 + 46}
              textAnchor="middle"
              fontSize="164"
              fontWeight="900"
              fontFamily="inherit"
              fill={`url(#${stripeId})`}
              opacity="0.9"
              style={{ letterSpacing: "6px" }}
            >
              {text}
            </text>
          </g>
        )}

        <style>{`
          .bulbBright{
            opacity: 0;
            transform-origin: center;
            animation-name: bulbPulse;
            animation-timing-function: linear;
            animation-iteration-count: infinite;
          }

          @keyframes bulbPulse {
            0%   { opacity: 1; }
            10%  { opacity: 1; }
            35%  { opacity: 0; }
            100% { opacity: 0; }
          }

          @media (prefers-reduced-motion: reduce) {
            .bulbBright { animation: none; opacity: 1; }
          }
        `}</style>
      </svg>
    </div>
  );
}
