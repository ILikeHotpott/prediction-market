"use client";

import { useState } from "react";

export default function SlotLever({ onPull, disabled = false, isSpinning = false }) {
  const [isPulling, setIsPulling] = useState(false);

  const handlePull = () => {
    if (disabled || isSpinning || isPulling) return;

    setIsPulling(true);
    setTimeout(() => {
      onPull?.();
      setTimeout(() => setIsPulling(false), 600);
    }, 300);
  };

  return (
    <div className="slot-lever-container">
      <div
        className={`slot-lever ${isPulling ? "slot-lever--pulled" : ""} ${isSpinning ? "slot-lever--spinning" : ""} ${disabled ? "slot-lever--disabled" : ""}`}
        onClick={handlePull}
      >
        <div className="slot-lever-shaft" />
        <div className="slot-lever-ball">
          <div className="slot-lever-ball-shine" />
        </div>
      </div>
    </div>
  );
}
