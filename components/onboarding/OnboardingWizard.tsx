"use client";

import { useState, useCallback, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { WizardStep } from "./WizardStep";
import { WelcomeStep } from "./steps/WelcomeStep";
import { GetApiKeyStep } from "./steps/GetApiKeyStep";
import { PasteApiKeyStep } from "./steps/PasteApiKeyStep";
import { PersonalContextStep } from "./steps/PersonalContextStep";
import { CreateJoinRoomStep } from "./steps/CreateJoinRoomStep";
import { FirstMessageStep } from "./steps/FirstMessageStep";

const STEP_KEY = "chatos:onboardingStep";
const TOTAL_STEPS = 6;

const STEP_CONFIG = [
  { title: "Welcome to Cha(t)os", subtitle: "Let's get you set up" },
  { title: "Get Your API Key", subtitle: "You'll need this to power your Claude" },
  { title: "Paste Your Key", subtitle: "Almost there..." },
  { title: "Personal Context", subtitle: "Help your Claude know you" },
  { title: "Create or Join a Room", subtitle: "Time to chat" },
  { title: "You're All Set!", subtitle: undefined },
];

export function OnboardingWizard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(() => {
    if (typeof window === "undefined") return 0;
    const saved = localStorage.getItem(STEP_KEY);
    const parsed = saved ? parseInt(saved, 10) : 0;
    return parsed >= 0 && parsed < TOTAL_STEPS ? parsed : 0;
  });
  const [direction, setDirection] = useState(1);
  const [keySaved, setKeySaved] = useState(false);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const completeOnboarding = useMutation(api.users.completeOnboarding);
  const setTimezone = useMutation(api.users.setTimezone);
  const backdropRef = useRef<HTMLDivElement>(null);

  const goTo = useCallback(
    (nextStep: number, dir: number = 1) => {
      setDirection(dir);
      setStep(nextStep);
      if (typeof window !== "undefined") {
        localStorage.setItem(STEP_KEY, String(nextStep));
      }
    },
    []
  );

  const handleNext = useCallback(() => {
    if (step < TOTAL_STEPS - 1) goTo(step + 1, 1);
  }, [step, goTo]);

  const handleBack = useCallback(() => {
    if (step > 0) goTo(step - 1, -1);
  }, [step, goTo]);

  const handleFinish = useCallback(async () => {
    try {
      await completeOnboarding();
      // Auto-detect and save the user's timezone
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await setTimezone({ timezone: tz });
    } catch {}
    if (typeof window !== "undefined") {
      localStorage.removeItem(STEP_KEY);
    }
    onComplete();
  }, [completeOnboarding, setTimezone, onComplete]);

  const handleSkip = useCallback(async () => {
    await handleFinish();
  }, [handleFinish]);

  const renderStep = () => {
    switch (step) {
      case 0:
        return <WelcomeStep />;
      case 1:
        return <GetApiKeyStep />;
      case 2:
        return <PasteApiKeyStep onKeySaved={() => setKeySaved(true)} />;
      case 3:
        return <PersonalContextStep />;
      case 4:
        return (
          <CreateJoinRoomStep
            onRoomReady={(code) => setRoomCode(code)}
          />
        );
      case 5:
        return <FirstMessageStep roomCode={roomCode} />;
      default:
        return null;
    }
  };

  const isLastStep = step === TOTAL_STEPS - 1;

  return (
    <motion.div
      ref={backdropRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(10, 8, 20, 0.85)", backdropFilter: "blur(8px)" }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="relative w-full max-w-lg rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: "var(--popover)",
          border: "1px solid var(--border)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
          maxHeight: "min(85vh, 680px)",
        }}
      >
        {/* Close button */}
        <button
          onClick={handleSkip}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-lg transition-colors"
          style={{ color: "var(--text-muted)" }}
          title="Skip walkthrough"
        >
          <X size={16} />
        </button>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <WizardStep
            title={STEP_CONFIG[step].title}
            subtitle={STEP_CONFIG[step].subtitle}
            stepIndex={step}
            totalSteps={TOTAL_STEPS}
            onNext={isLastStep ? handleFinish : handleNext}
            onBack={handleBack}
            onSkip={isLastStep ? undefined : handleSkip}
            nextLabel={
              step === 0
                ? "Let's do it"
                : isLastStep
                  ? "Done"
                  : step === 2 && !keySaved
                    ? "Skip for now"
                    : "Next"
            }
            direction={direction}
          >
            {renderStep()}
          </WizardStep>
        </div>
      </motion.div>
    </motion.div>
  );
}
