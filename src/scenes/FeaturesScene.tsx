import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";

const FEATURES = [
  { icon: "⚡", title: "Blixtsnabbt", text: "Svar på under en sekund" },
  { icon: "🛡️", title: "Anonymt", text: "Ingen inloggning krävs" },
  { icon: "💬", title: "Kommentarer", text: "Se vad andra rapporterat" },
];

export const FeaturesScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 40, padding: 80 }}>
      <div style={{ fontSize: 64, fontWeight: 800, color: "#fff", marginBottom: 24, fontFamily: "system-ui, sans-serif" }}>
        Varför lupnumber?
      </div>

      {FEATURES.map((f, i) => {
        const delay = 10 + i * 20;
        const progress = spring({ frame: frame - delay, fps, config: { damping: 14 } });

        return (
          <div
            key={f.title}
            style={{
              opacity: progress,
              transform: `translateX(${(1 - progress) * -200}px)`,
              width: "88%",
              padding: "36px 44px",
              borderRadius: 28,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.1)",
              display: "flex",
              alignItems: "center",
              gap: 32,
              fontFamily: "system-ui, sans-serif",
            }}
          >
            <div style={{ fontSize: 88 }}>{f.icon}</div>
            <div>
              <div style={{ fontSize: 48, fontWeight: 800, color: "#fff" }}>{f.title}</div>
              <div style={{ fontSize: 36, color: "#cbd5e1", marginTop: 6 }}>{f.text}</div>
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
