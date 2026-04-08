"use client";

import { motion, AnimatePresence } from "framer-motion";

interface WizardStepProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  stepIndex: number;
  totalSteps: number;
  onNext?: () => void;
  onBack?: () => void;
  onSkip?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  showBack?: boolean;
  direction?: number; // 1 = forward, -1 = backward
}

export function WizardStep({
  title,
  subtitle,
  children,
  stepIndex,
  totalSteps,
  onNext,
  onBack,
  onSkip,
  nextLabel = "Next",
  nextDisabled = false,
  showBack = true,
  direction = 1,
}: WizardStepProps) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={stepIndex}
        initial={{ opacity: 0, x: direction * 60 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: direction * -60 }}
        transition={{ duration: 0.25, ease: "easeInOut" }}
        className="flex flex-col h-full"
      >
        {/* Step dots */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full transition-all duration-300"
              style={{
                background:
                  i === stepIndex
                    ? "var(--amber)"
                    : i < stepIndex
                      ? "var(--sage-teal)"
                      : "var(--border)",
                transform: i === stepIndex ? "scale(1.3)" : "scale(1)",
              }}
            />
          ))}
        </div>

        {/* Title */}
        <h2
          className="text-xl mb-1 text-center"
          style={{
            fontFamily: "var(--font-super-bakery)",
            color: "var(--fg)",
          }}
        >
          {title}
        </h2>
        {subtitle && (
          <p
            className="text-sm text-center mb-6"
            style={{ color: "var(--text-muted)" }}
          >
            {subtitle}
          </p>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-1">{children}</div>

        {/* Bottom nav */}
        <div className="flex items-center justify-between mt-6 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
          <div>
            {onSkip && (
              <button
                onClick={onSkip}
                className="text-xs px-3 py-2 rounded-lg transition-colors"
                style={{ color: "var(--text-muted)" }}
              >
                Skip walkthrough
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {showBack && stepIndex > 0 && onBack && (
              <button
                onClick={onBack}
                className="px-4 py-2 rounded-lg text-sm transition-all"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--text-muted)",
                }}
              >
                Back
              </button>
            )}
            {onNext && (
              <button
                onClick={onNext}
                disabled={nextDisabled}
                className="px-6 py-2 rounded-lg font-bold text-sm transition-all"
                style={{
                  background: nextDisabled ? "var(--surface)" : "var(--amber)",
                  color: nextDisabled ? "var(--text-muted)" : "var(--deep-dark)",
                  fontFamily: "var(--font-super-bakery)",
                  opacity: nextDisabled ? 0.5 : 1,
                  cursor: nextDisabled ? "not-allowed" : "pointer",
                }}
              >
                {nextLabel}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
