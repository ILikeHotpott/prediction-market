import React, { useId, useLayoutEffect, useRef, useState } from "react";


export default function AutoFitSvgText({
    text,
    x,
    y,
    maxWidth,
    fontSize = 164,
    fontWeight = 900,
    fontFamily = "inherit",
    letterSpacing = 6,
    fillMain,
    fillOverlay,
    stroke = "#7d5b27",
    strokeWidth = 10,
  }) {
    const measureRef = useRef(null);
    const [fit, setFit] = useState({ sx: 1, cx: x, cy: y });
  
    useLayoutEffect(() => {
      const el = measureRef.current;
      if (!el) return;
  
      // 未缩放状态下测量宽度
      const bbox = el.getBBox();
      const w = bbox.width || 1;
  
      // 只做横向缩放，避免高度也变小
      const sx = Math.min(1, maxWidth / w);
  
      // 以 bbox 的中心为缩放中心（更稳定）
      const cx = bbox.x + bbox.width / 2;
      const cy = bbox.y + bbox.height / 2;
  
      setFit({ sx, cx, cy });
    }, [text, maxWidth, fontSize, fontWeight, fontFamily, letterSpacing]);
  
    const transform = `translate(${fit.cx} ${fit.cy}) scale(${fit.sx} 1) translate(${-fit.cx} ${-fit.cy})`;
  
    return (
      <g transform={transform}>
        {/* 主层：描边 + 渐变 */}
        <text
          ref={measureRef}
          x={x}
          y={y}
          textAnchor="middle"
          fontSize={fontSize}
          fontWeight={fontWeight}
          fontFamily={fontFamily}
          fill={fillMain}
          stroke={stroke}
          strokeWidth={strokeWidth}
          paintOrder="stroke"
          style={{ letterSpacing: `${letterSpacing}px` }}
          vectorEffect="non-scaling-stroke"
        >
          {text}
        </text>
  
        {/* 叠加层：斜纹 */}
        <text
          x={x}
          y={y}
          textAnchor="middle"
          fontSize={fontSize}
          fontWeight={fontWeight}
          fontFamily={fontFamily}
          fill={fillOverlay}
          opacity="0.9"
          style={{ letterSpacing: `${letterSpacing}px` }}
        >
          {text}
        </text>
      </g>
    );
  }
  