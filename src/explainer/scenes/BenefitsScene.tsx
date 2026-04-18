import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { BRAND } from "../timeline";
import { ShieldIcon, ClockIcon, BoltIcon, ChartIcon } from "../icons";

const BENEFITS = [
  { Icon: ShieldIcon, label: "Safety first",      color: BRAND.green },
  { Icon: ClockIcon,  label: "Real-time info",    color: BRAND.blue },
  { Icon: BoltIcon,   label: "Faster processing", color: BRAND.amber },
  { Icon: ChartIcon,  label: "Data-driven",       color: BRAND.violet },
];

export const BenefitsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = interpolate(frame, [3, 15], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ padding: 64, flexDirection: "column", justifyContent: "center", gap: 48 }}>
      <div style={{ textAlign: "center", opacity: titleOpacity }}>
        <div style={{ fontSize: 64, fontWeight: 800, color: BRAND.ink }}>
          Varför LUPNUMBER?
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 32,
          maxWidth: 1400,
          width: "100%",
          margin: "0 auto",
        }}
      >
        {BENEFITS.map(({ Icon, label, color }, i) => {
          const delay = 18 + i * 40;
          const s = spring({ frame: frame - delay, fps, config: { damping: 18, stiffness: 120 } });
          const x = interpolate(s, [0, 1], [-60, 0]);
          const checkSpring = spring({ frame: frame - (delay + 6), fps, config: { damping: 10 } });
          return (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 24,
                padding: "28px 36px",
                background: BRAND.white,
                borderRadius: 20,
                boxShadow: "0 18px 40px rgba(15,23,42,0.1)",
                borderLeft: `6px solid ${color}`,
                opacity: s,
                transform: `translateX(${x}px) scale(${interpolate(s, [0, 1], [0.95, 1])})`,
              }}
            >
              <div style={{ color, display: "flex" }}>
                <Icon size={68} strokeWidth={1.8} />
              </div>
              <div style={{ fontSize: 36, fontWeight: 700, color: BRAND.ink }}>{label}</div>
              <div
                style={{
                  marginLeft: "auto",
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  background: color,
                  color: BRAND.white,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 900,
                  fontSize: 24,
                  transform: `scale(${checkSpring})`,
                }}
              >
                ✓
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
