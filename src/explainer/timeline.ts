export const TIMELINE = {
  totalSeconds: 30,
  scenes: {
    logo:      { start: 0,  end: 5  },
    problem:   { start: 5,  end: 10 },
    solution:  { start: 10, end: 15 },
    benefits:  { start: 15, end: 22 },
    customers: { start: 22, end: 28 },
    cta:       { start: 28, end: 30 },
  },
} as const;

export type SceneName = keyof typeof TIMELINE.scenes;

export const BRAND = {
  blue: "#1d4ed8",
  blueLight: "#3b82f6",
  blueSoft: "#dbeafe",
  green: "#059669",
  greenLight: "#10b981",
  greenSoft: "#d1fae5",
  ink: "#0f172a",
  muted: "#64748b",
  bg: "#f8fafc",
  white: "#ffffff",
  red: "#ef4444",
  amber: "#f59e0b",
  violet: "#7c3aed",
} as const;
