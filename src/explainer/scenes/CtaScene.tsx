import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { BRAND } from "../timeline";
import { ShieldIcon, ArrowRightIcon } from "../icons";

export const CtaScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const shieldSpring = spring({ frame, fps, config: { damping: 12, stiffness: 140 } });
  const shieldRotate = interpolate(shieldSpring, [0, 1], [-20, 0]);
  const textSpring = spring({ frame: frame - 8, fps, config: { damping: 14 } });
  const textY = interpolate(textSpring, [0, 1], [20, 0]);
  const ctaSpring = spring({ frame: frame - 22, fps });
  const pulse = 1 + Math.sin((frame / fps) * Math.PI * 2) * 0.04;

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 40 }}>
      <div
        style={{
          color: BRAND.green,
          transform: `scale(${shieldSpring}) rotate(${shieldRotate}deg)`,
          opacity: shieldSpring,
        }}
      >
        <ShieldIcon size={120} strokeWidth={1.8} />
      </div>

      <div
        style={{
          fontSize: 108,
          fontWeight: 900,
          color: BRAND.ink,
          textAlign: "center",
          letterSpacing: -2,
          lineHeight: 1.05,
          opacity: textSpring,
          transform: `translateY(${textY}px) scale(${interpolate(textSpring, [0, 1], [0.9, 1])})`,
        }}
      >
        Put safety <span style={{ color: BRAND.green }}>first!</span>
      </div>

      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 16,
          padding: "24px 56px",
          background: BRAND.green,
          color: BRAND.white,
          fontSize: 34,
          fontWeight: 800,
          borderRadius: 999,
          boxShadow: `0 20px 40px ${BRAND.greenLight}66`,
          opacity: ctaSpring,
          transform: `scale(${ctaSpring * pulse})`,
        }}
      >
        Kom igång
        <ArrowRightIcon size={28} />
      </div>
    </AbsoluteFill>
  );
};
