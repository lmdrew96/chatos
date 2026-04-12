"use client";

import { useState, useEffect, memo } from "react";

interface StreamingTimerProps {
  startedAt: number;
  color?: string;
}

const StreamingTimer = memo(function StreamingTimer({ startedAt, color }: StreamingTimerProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setElapsed(Date.now() - startedAt), 100);
    return () => clearInterval(interval);
  }, [startedAt]);

  return (
    <span
      className="text-[10px] tabular-nums select-none"
      style={{ color: color ?? "var(--text-dim)", opacity: 0.7 }}
    >
      {(elapsed / 1000).toFixed(1)}s
    </span>
  );
});

export default StreamingTimer;
