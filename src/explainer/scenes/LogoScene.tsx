import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { BRAND } from "../timeline";
import { ShieldIcon } from "../icons";

const LETTERS = "LUPNUMBER".split("");

export const LogoScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const shieldScale = spring({ frame: frame - 6, fps, config: { damping: 10, stiffness: 120 } });
  const shieldRotate = interpolate(shieldScale, [0, 1], [-30, 0]);
  const subtitleOpacity = interpolate(frame, [fps * 2.2, fps * 2.6], [0, 1], { extrapolateRight: "clamp" });
  const regOpacity = interpolate(frame, [fps * 1.8, fps * 2.2], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 32 }}>
      <div
        style={{
          color: BRAND.green,
          transform: `scale(${shieldScale}) rotate(${shieldRotate}deg)`,
          opacity: shieldScale,
        }}
      >
        <ShieldIcon size={160} strokeWidth={1.8} />
      </div>

      <div style={{ display: "flex", alignItems: "flex-start" }}>
        {LETTERS.map((letter, i) => {
          const letterFrame = frame - (fps * 0.8 + i * fps * 0.08);
          const letterSpring = spring({ frame: letterFrame, fps, config: { damping: 14 } });
          const y = interpolate(letterSpring, [0, 1], [40, 0]);
          return (
            <span
              key={i}
              style={{
                fontSize: 120,
                fontWeight: 900,
                color: BRAND.ink,
                letterSpacing: -3,
                lineHeight: 1,
                opacity: letterSpring,
                transform: `translateY(${y}px)`,
                display: "inline-block",
              }}
            >
              {letter}
            </span>
          );
        })}
        <span
          style={{
            fontSize: 36,
            color: BRAND.green,
            fontWeight: 800,
            marginLeft: 8,
            marginTop: 8,
            opacity: regOpacity,
          }}
        >
          ®
        </span>
      </div>

      <div
        style={{
          fontSize: 32,
          color: BRAND.muted,
          fontWeight: 600,
          letterSpacing: 4,
          textTransform: "uppercase",
          opacity: subtitleOpacity,
        }}
      >
        Smart truck check-in
      </div>
    </AbsoluteFill>
  );
};
