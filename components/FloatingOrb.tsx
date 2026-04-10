"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

export function FloatingOrb({
  className,
  delay = 0,
  style,
}: {
  className: string;
  delay?: number;
  style?: React.CSSProperties;
}) {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <motion.div
      className={`absolute rounded-full blur-3xl pointer-events-none max-w-[50vw] max-h-[50vw] sm:max-w-none sm:max-h-none ${className}`}
      style={style}
      animate={
        reducedMotion
          ? {}
          : {
              x: [0, 28, -18, 10, 0],
              y: [0, -18, 26, -10, 0],
              scale: [1, 1.08, 0.96, 1.04, 1],
            }
      }
      transition={
        reducedMotion
          ? {}
          : {
              duration: 14,
              delay,
              repeat: Infinity,
              ease: "easeInOut",
            }
      }
    />
  );
}
