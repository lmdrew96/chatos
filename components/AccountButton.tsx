"use client";

import { SignInButton, UserButton, useUser } from "@clerk/nextjs";

export function AccountButton() {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) return <div className="w-7 h-7" />;

  if (isSignedIn) {
    return (
      <UserButton
        appearance={{
          elements: {
            avatarBox: "w-7 h-7",
          },
        }}
      />
    );
  }

  return (
    <SignInButton mode="modal">
      <button
        className="text-xs px-3 py-1.5 rounded-lg transition-all duration-150"
        style={{
          color: "var(--text-muted)",
          border: "1px solid var(--border)",
          background: "transparent",
        }}
        onMouseEnter={(e) => {
          const btn = e.currentTarget;
          btn.style.color = "var(--amber)";
          btn.style.borderColor = "rgba(223,166,73,0.35)";
          btn.style.background = "rgba(223,166,73,0.06)";
        }}
        onMouseLeave={(e) => {
          const btn = e.currentTarget;
          btn.style.color = "var(--text-muted)";
          btn.style.borderColor = "var(--border)";
          btn.style.background = "transparent";
        }}
      >
        Sign in
      </button>
    </SignInButton>
  );
}
