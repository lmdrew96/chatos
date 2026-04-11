"use client";

export function FloatingOrb({
  className,
  style,
}: {
  className: string;
  delay?: number;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`absolute rounded-full blur-3xl pointer-events-none max-w-[50vw] max-h-[50vw] sm:max-w-none sm:max-h-none ${className}`}
      style={style}
    />
  );
}
