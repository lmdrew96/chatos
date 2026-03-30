"use client";

export function SettingsLink() {
  return (
    <a
      href="/settings"
      aria-label="Settings"
      className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
      style={{ color: "rgba(247,245,250,0.35)" }}
      onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(247,245,250,0.75)")}
      onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(247,245,250,0.35)")}
    >
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <circle cx="7.5" cy="7.5" r="2" stroke="currentColor" strokeWidth="1.25" />
        <path
          d="M7.5 1.5v1M7.5 12.5v1M1.5 7.5h1M12.5 7.5h1M3.4 3.4l.7.7M10.9 10.9l.7.7M3.4 11.6l.7-.7M10.9 4.1l.7-.7"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
      </svg>
    </a>
  );
}
