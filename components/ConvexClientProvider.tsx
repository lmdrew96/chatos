"use client";

import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth } from "@clerk/nextjs";
import { ReactNode, useState } from "react";

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const convexUrl =
    process.env.NEXT_PUBLIC_CONVEX_URL ?? "https://example.invalid";
  const [convex] = useState(() => new ConvexReactClient(convexUrl));

  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
}
