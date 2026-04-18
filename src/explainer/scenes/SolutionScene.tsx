import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { BRAND } from "../timeline";
import { TruckIcon, ScreenIcon, CloudIcon, CheckIcon } from "../icons";

export const SolutionScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = interpolate(frame, [3, 15], [0, 1], { extrapolateRight: "clamp" });
  const truckX = interpolate(frame, [12, 60], [-400, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const truckOpacity = interpolate(frame, [12, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const screenScale = spring({ frame: frame - 48, fps, config: { damping: 14 } });
  const cloudScale = spring({ frame: frame - 78, fps });
  const LABELS = ["Identitet", "Säkerhet", "Destination"];

  return (
    <AbsoluteFill style={{ padding: 64, flexDirection: "column" }}>
      <div style={{ textAlign: "center", opacity: titleOpacity }}>
        <div style={{ fontSize: 56, fontWeight: 800, color: BRAND.ink }}>
          Digital check-in med LUPNUMBER
        </div>
        <div style={{ fontSize: 26, color: BRAND.muted, marginTop: 12 }}>
          En smidig flödesupplevelse från start till mål
        </div>
      </div>

      <div style={{ position: "relative", flex: 1, marginTop: 40 }}>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: "22%", height: 8, background: "#cbd5e1", borderRadius: 4 }} />

        {/* Truck driving in */}
        <div
          style={{
            position: "absolute",
            left: "10%",
            bottom: "24%",
            color: BRAND.blue,
            transform: `translateX(${truckX}px)`,
            opacity: truckOpacity,
          }}
        >
          <TruckIcon size={180} strokeWidth={1.6} />
        </div>

        {/* Kiosk */}
        <div
          style={{
            position: "absolute",
            right: "10%",
            bottom: "24%",
            background: BRAND.white,
            border: `4px solid ${BRAND.blue}`,
            borderRadius: 20,
            padding: 32,
            boxShadow: "0 30px 60px rgba(29,78,216,0.25)",
            minWidth: 340,
            transform: `scale(${screenScale})`,
            opacity: screenScale,
          }}
        >
          <div style={{ color: BRAND.blue, marginBottom: 12 }}>
            <ScreenIcon size={48} strokeWidth={2} />
          </div>
          <div style={{ fontSize: 18, color: BRAND.muted, marginBottom: 8 }}>LUP #48291</div>
          {LABELS.map((label, i) => {
            const itemSpring = spring({ frame: frame - (63 + i * 9), fps });
            const x = interpolate(itemSpring, [0, 1], [-14, 0]);
            return (
              <div
                key={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  fontSize: 22,
                  fontWeight: 700,
                  color: BRAND.ink,
                  marginTop: 10,
                  opacity: itemSpring,
                  transform: `translateX(${x}px)`,
                }}
              >
                <span style={{ color: BRAND.green, display: "inline-flex" }}>
                  <CheckIcon size={24} />
                </span>
                {label}
              </div>
            );
          })}
        </div>

        {/* Cloud */}
        <div
          style={{
            position: "absolute",
            top: "4%",
            right: "12%",
            color: BRAND.greenLight,
            transform: `scale(${cloudScale})`,
            opacity: cloudScale,
          }}
        >
          <CloudIcon size={100} strokeWidth={1.8} />
        </div>

        {/* Data flow dots */}
        {[0, 1, 2, 3].map((i) => {
          const start = 90 + i * 8;
          const loopFrame = (frame - start) % 42;
          if (loopFrame < 0) return null;
          const opacity = interpolate(loopFrame, [0, 6, 34, 42], [0, 1, 1, 0], { extrapolateRight: "clamp" });
          const x = interpolate(loopFrame, [0, 42], [0, 160]);
          const y = interpolate(loopFrame, [0, 42], [0, -160]);
          return (
            <div
              key={`dot${i}`}
              style={{
                position: "absolute",
                right: "22%",
                bottom: "38%",
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: BRAND.greenLight,
                boxShadow: `0 0 16px ${BRAND.greenLight}`,
                opacity,
                transform: `translate(${x}px, ${y}px)`,
              }}
            />
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
