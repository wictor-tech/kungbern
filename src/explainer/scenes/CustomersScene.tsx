import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { BRAND } from "../timeline";

const CUSTOMERS = ["NORDLOG", "STENA", "VOLVO LOG", "PORTCO", "ARKHAM", "SCANIA", "DFDS", "MAERSK"];

export const CustomersScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const row = [...CUSTOMERS, ...CUSTOMERS];

  const titleOpacity = interpolate(frame, [3, 15], [0, 1], { extrapolateRight: "clamp" });
  const titleY = interpolate(frame, [3, 15], [-16, 0], { extrapolateRight: "clamp" });

  // Scroll: full cycle over 8 seconds
  const cycleFrames = fps * 8;
  const scrollPercent = ((frame % cycleFrames) / cycleFrames) * 50;

  return (
    <AbsoluteFill style={{ padding: 64, flexDirection: "column", justifyContent: "center", gap: 48 }}>
      <div style={{ textAlign: "center", opacity: titleOpacity, transform: `translateY(${titleY}px)` }}>
        <div style={{ fontSize: 22, color: BRAND.green, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" }}>
          Trusted by industry leaders
        </div>
        <div style={{ fontSize: 52, fontWeight: 800, color: BRAND.ink, marginTop: 12 }}>
          Joining 100+ logistik-partners
        </div>
      </div>

      <div
        style={{
          position: "relative",
          overflow: "hidden",
          maskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
          WebkitMaskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 48,
            width: "max-content",
            transform: `translateX(-${scrollPercent}%)`,
          }}
        >
          {row.map((name, i) => (
            <div
              key={i}
              style={{
                padding: "26px 52px",
                background: BRAND.white,
                borderRadius: 14,
                boxShadow: "0 10px 24px rgba(15,23,42,0.08)",
                fontSize: 36,
                fontWeight: 800,
                color: BRAND.muted,
                letterSpacing: 2,
                whiteSpace: "nowrap",
              }}
            >
              {name}
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
