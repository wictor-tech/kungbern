import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig, interpolate } from "remotion";

const FULL_NUMBER = "070-123 45 67";

export const SearchScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const barScale = spring({ frame, fps, config: { damping: 14 } });
  const typed = Math.min(FULL_NUMBER.length, Math.floor(interpolate(frame, [10, 70], [0, FULL_NUMBER.length])));
  const cardOpacity = interpolate(frame, [80, 110], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cardY = interpolate(frame, [80, 110], [40, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 48, padding: 80 }}>
      <div
        style={{
          fontSize: 56,
          color: "#e2e8f0",
          fontWeight: 700,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        Sök numret
      </div>

      <div
        style={{
          transform: `scale(${barScale})`,
          width: "88%",
          padding: "40px 48px",
          borderRadius: 32,
          background: "rgba(255,255,255,0.08)",
          border: "2px solid rgba(167,139,250,0.6)",
          backdropFilter: "blur(20px)",
          display: "flex",
          alignItems: "center",
          gap: 32,
        }}
      >
        <div style={{ fontSize: 72 }}>🔍</div>
        <div style={{ fontSize: 72, color: "#fff", fontFamily: "monospace", fontWeight: 700 }}>
          {FULL_NUMBER.slice(0, typed)}
          <span style={{ opacity: frame % 20 < 10 ? 1 : 0 }}>|</span>
        </div>
      </div>

      <div
        style={{
          opacity: cardOpacity,
          transform: `translateY(${cardY}px)`,
          width: "88%",
          padding: 48,
          borderRadius: 32,
          background: "linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)",
          color: "#fff",
          fontFamily: "system-ui, sans-serif",
          boxShadow: "0 20px 60px rgba(124,58,237,0.4)",
        }}
      >
        <div style={{ fontSize: 36, opacity: 0.85, marginBottom: 12 }}>Träff hittad</div>
        <div style={{ fontSize: 64, fontWeight: 800, marginBottom: 16 }}>Telemarketing AB</div>
        <div style={{ fontSize: 40, opacity: 0.9 }}>Stockholm · 12 rapporter</div>
      </div>
    </AbsoluteFill>
  );
};
