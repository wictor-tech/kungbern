import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig, interpolate } from "remotion";

export const IntroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({ frame, fps, config: { damping: 12, stiffness: 90 } });
  const glow = interpolate(frame, [0, 30, 90], [0, 1, 1], { extrapolateRight: "clamp" });
  const tagOpacity = interpolate(frame, [30, 60], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 40 }}>
      <div
        style={{
          transform: `scale(${scale})`,
          fontSize: 160,
          fontWeight: 900,
          color: "#ffffff",
          letterSpacing: -4,
          textShadow: `0 0 ${60 * glow}px rgba(124, 58, 237, ${0.9 * glow})`,
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        lup<span style={{ color: "#a78bfa" }}>number</span>
      </div>
      <div
        style={{
          opacity: tagOpacity,
          fontSize: 48,
          color: "#cbd5e1",
          fontFamily: "system-ui, -apple-system, sans-serif",
          fontWeight: 500,
        }}
      >
        Vem ringde dig?
      </div>
    </AbsoluteFill>
  );
};
