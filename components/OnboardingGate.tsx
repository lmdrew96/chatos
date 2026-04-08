"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { OnboardingWizard } from "./onboarding/OnboardingWizard";
import { ClaudiuChatbot } from "./onboarding/ClaudiuChatbot";

export function OnboardingGate() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const onboardingStatus = useQuery(
    api.users.getOnboardingStatus,
    isAuthenticated ? {} : "skip"
  );
  const [wizardDismissed, setWizardDismissed] = useState(false);

  // Don't render anything while loading or if not authenticated
  if (isLoading || !isAuthenticated) return null;

  // Still loading onboarding status
  if (onboardingStatus === undefined) return null;

  const showWizard =
    !wizardDismissed &&
    onboardingStatus !== null &&
    !onboardingStatus.completed;

  return (
    <>
      {showWizard && (
        <OnboardingWizard onComplete={() => setWizardDismissed(true)} />
      )}
      <ClaudiuChatbot />
    </>
  );
}
