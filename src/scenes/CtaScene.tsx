import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig, interpolate } from "remotion";

export const CtaScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const urlScale = spring({ frame, fps, config: { damping: 10, stiffness: 80 } });
  const ctaScale = spring({ frame: frame - 30, fps, config: { damping: 12 } });
  const pulse = 1 + Math.sin((frame / fps) * Math.PI * 2) * 0.04;
  const arrowX = interpolate(frame % 60, [0, 30, 60], [0, 14, 0]);

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 60, padding: 80 }}>
      <div
        style={{
          fontSize: 52,
          color: "#cbd5e1",
          fontFamily: "system-ui, sans-serif",
          fontWeight: 600,
        }}
      >
        Testa gratis idag
      </div>

      <div
        style={{
          transform: `scale(${urlScale * pulse})`,
          fontSize: 128,
          fontWeight: 900,
          color: "#fff",
          letterSpacing: -3,
          textShadow: "0 0 60px rgba(167,139,250,0.8)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        lupnumber<span style={{ color: "#a78bfa" }}>.com</span>
      </div>

      <div
        style={{
          transform: `scale(${ctaScale})`,
          padding: "32px 64px",
          borderRadius: 100,
          background: "linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)",
          color: "#fff",
          fontSize: 56,
          fontWeight: 800,
          fontFamily: "system-ui, sans-serif",
          boxShadow: "0 20px 60px rgba(124,58,237,0.6)",
          display: "flex",
          alignItems: "center",
          gap: 20,
        }}
      >
        Sök nu
        <span style={{ transform: `translateX(${arrowX}px)`, display: "inline-block" }}>→</span>
      </div>
    </AbsoluteFill>
  );
};
