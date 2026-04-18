import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { BRAND } from "../timeline";
import { TruckIcon, ClipboardIcon, ClockIcon } from "../icons";

const TRUCKS = [
  { x: "8%",  delay: 3,  wiggle: 2 },
  { x: "28%", delay: 7,  wiggle: -3 },
  { x: "48%", delay: 12, wiggle: 2.5 },
  { x: "68%", delay: 16, wiggle: -2 },
];

export const ProblemScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = interpolate(frame, [3, 15], [0, 1], { extrapolateRight: "clamp" });
  const titleY = interpolate(frame, [3, 15], [-20, 0], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ padding: 64, flexDirection: "column" }}>
      <div
        style={{
          textAlign: "center",
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
        }}
      >
        <div style={{ fontSize: 56, fontWeight: 800, color: BRAND.ink }}>
          Manuell check-in = kaos
        </div>
        <div style={{ fontSize: 26, color: BRAND.muted, marginTop: 12 }}>
          Köer, missförstånd, säkerhetsrisker
        </div>
      </div>

      <div style={{ position: "relative", flex: 1, marginTop: 40 }}>
        {/* Road */}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: "12%", height: 8, background: "#cbd5e1", borderRadius: 4 }} />

        {/* Question marks */}
        {[0, 1, 2].map((i) => {
          const startFrame = 20 + i * 15;
          const loopFrame = (frame - startFrame) % 50;
          const opacity = loopFrame < 0 ? 0 : interpolate(loopFrame, [0, 10, 30, 50], [0, 1, 1, 0], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
          const y = interpolate(loopFrame, [0, 50], [0, -80]);
          return (
            <div
              key={`q${i}`}
              style={{
                position: "absolute",
                left: `${22 + i * 20}%`,
                bottom: "45%",
                fontSize: 72,
                fontWeight: 900,
                color: BRAND.red,
                opacity,
                transform: `translateY(${y}px)`,
              }}
            >
              ?
            </div>
          );
        })}

        {/* Trucks */}
        {TRUCKS.map((t, i) => {
          const appear = spring({ frame: frame - t.delay, fps, config: { damping: 14 } });
          const wiggle = Math.sin(((frame - t.delay - 12) / fps) * Math.PI * 2) * t.wiggle;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: t.x,
                bottom: "15%",
                color: i === 0 ? BRAND.blue : "#94a3b8",
                opacity: appear,
                transform: `translateX(${wiggle}px)`,
              }}
            >
              <TruckIcon size={140} strokeWidth={1.6} />
            </div>
          );
        })}

        {/* Clipboard person */}
        <div
          style={{
            position: "absolute",
            right: "6%",
            bottom: "18%",
            color: BRAND.ink,
            opacity: spring({ frame: frame - 30, fps }),
            transform: `rotate(${Math.sin(((frame - 48) / fps) * Math.PI * 2) * 5}deg)`,
          }}
        >
          <ClipboardIcon size={96} strokeWidth={1.8} />
        </div>

        {/* Clock */}
        <div
          style={{
            position: "absolute",
            right: "18%",
            top: "10%",
            color: BRAND.red,
            opacity: spring({ frame: frame - 50, fps }),
            transform: `scale(${1 + Math.sin(((frame - 50) / fps) * Math.PI * 2) * 0.12})`,
          }}
        >
          <ClockIcon size={84} strokeWidth={2} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
