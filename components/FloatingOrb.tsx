"use client";

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
  return (
    <motion.div
      className={`absolute rounded-full blur-3xl pointer-events-none ${className}`}
      style={style}
      animate={{
        x: [0, 28, -18, 10, 0],
        y: [0, -18, 26, -10, 0],
        scale: [1, 1.08, 0.96, 1.04, 1],
      }}
      transition={{
        duration: 14,
        delay,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
  );
}
