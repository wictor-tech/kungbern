import { motion } from "framer-motion";
import { BRAND } from "../timeline";
import { TruckIcon, ClipboardIcon, ClockIcon } from "../icons";

const trucks = [
  { x: "8%",  delay: 0.1, wiggle: 2 },
  { x: "28%", delay: 0.25, wiggle: -3 },
  { x: "48%", delay: 0.4, wiggle: 2.5 },
  { x: "68%", delay: 0.55, wiggle: -2 },
];

export const ProblemScene: React.FC = () => {
  return (
    <div style={{ position: "absolute", inset: 0, padding: "clamp(24px, 4vw, 48px)", display: "flex", flexDirection: "column" }}>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        style={{ textAlign: "center", marginBottom: "auto" }}
      >
        <div style={{ fontSize: "clamp(22px, 3vw, 40px)", fontWeight: 800, color: BRAND.ink }}>
          Manuell check-in = kaos
        </div>
        <div style={{ fontSize: "clamp(13px, 1.6vw, 18px)", color: BRAND.muted, marginTop: 8 }}>
          Köer, missförstånd, säkerhetsrisker
        </div>
      </motion.div>

      <div style={{ position: "relative", flex: 1, display: "flex", alignItems: "flex-end", paddingBottom: "12%" }}>
        {/* Road */}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: "8%", height: 6, background: "#cbd5e1", borderRadius: 3 }} />

        {/* Chaos question marks */}
        {[0, 1, 2].map((i) => (
          <motion.div
            key={`q${i}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: [0, 1, 1, 0], y: [-10, -40, -60, -80] }}
            transition={{ delay: 1.2 + i * 0.5, duration: 2.2, repeat: Infinity, repeatDelay: 1 }}
            style={{
              position: "absolute",
              left: `${20 + i * 22}%`,
              bottom: "40%",
              fontSize: "clamp(24px, 3.5vw, 44px)",
              fontWeight: 900,
              color: "#ef4444",
            }}
          >
            ?
          </motion.div>
        ))}

        {/* Trucks */}
        {trucks.map((t, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -30 }}
            animate={{
              opacity: 1,
              x: [0, t.wiggle, 0],
            }}
            transition={{
              opacity: { delay: t.delay, duration: 0.4 },
              x: { delay: t.delay + 0.4, duration: 1.6, repeat: Infinity, ease: "easeInOut" },
            }}
            style={{ position: "absolute", left: t.x, bottom: "10%", color: i === 0 ? BRAND.blue : "#94a3b8" }}
          >
            <TruckIcon size={96} strokeWidth={1.6} />
          </motion.div>
        ))}

        {/* Frustrated person with clipboard */}
        <motion.div
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1, rotate: [0, -5, 5, -5, 0] }}
          transition={{
            opacity: { delay: 1.0 },
            scale: { delay: 1.0, type: "spring" },
            rotate: { delay: 1.6, duration: 1.4, repeat: Infinity },
          }}
          style={{ position: "absolute", right: "6%", bottom: "12%", color: BRAND.ink }}
        >
          <ClipboardIcon size={72} strokeWidth={1.8} />
        </motion.div>

        {/* Ticking clock */}
        <motion.div
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: [1, 1.15, 1] }}
          transition={{
            opacity: { delay: 1.8 },
            scale: { delay: 1.8, duration: 0.6, repeat: Infinity },
          }}
          style={{ position: "absolute", right: "18%", top: "12%", color: "#ef4444" }}
        >
          <ClockIcon size={64} strokeWidth={2} />
        </motion.div>
      </div>
    </div>
  );
};
