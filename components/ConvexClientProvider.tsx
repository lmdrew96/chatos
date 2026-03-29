"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode, useState } from "react";

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const convexUrl =
    process.env.NEXT_PUBLIC_CONVEX_URL ?? "https://example.invalid";
  const [convex] = useState(() => new ConvexReactClient(convexUrl));

  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
