import { motion } from "framer-motion";
import { BRAND } from "../timeline";
import { ShieldIcon, ClockIcon, BoltIcon, ChartIcon } from "../icons";

const BENEFITS = [
  { icon: ShieldIcon, label: "Safety first",      color: BRAND.green },
  { icon: ClockIcon,  label: "Real-time info",    color: BRAND.blue },
  { icon: BoltIcon,   label: "Faster processing", color: "#f59e0b" },
  { icon: ChartIcon,  label: "Data-driven",       color: "#7c3aed" },
];

export const BenefitsScene: React.FC = () => {
  return (
    <div style={{ position: "absolute", inset: 0, padding: "clamp(24px, 4vw, 48px)", display: "flex", flexDirection: "column", justifyContent: "center", gap: "clamp(16px, 2vw, 28px)" }}>
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        style={{ textAlign: "center" }}
      >
        <div style={{ fontSize: "clamp(22px, 3vw, 40px)", fontWeight: 800, color: BRAND.ink }}>
          Varför LUPNUMBER?
        </div>
      </motion.div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: "clamp(12px, 1.5vw, 20px)", maxWidth: 960, width: "100%", margin: "0 auto" }}>
        {BENEFITS.map((b, i) => {
          const Icon = b.icon;
          return (
            <motion.div
              key={b.label}
              initial={{ opacity: 0, x: -40, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              transition={{ delay: 0.4 + i * 1.35, type: "spring", damping: 18, stiffness: 120 }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "clamp(12px, 1.5vw, 20px)",
                padding: "clamp(14px, 1.6vw, 22px) clamp(18px, 2vw, 28px)",
                background: BRAND.white,
                borderRadius: 16,
                boxShadow: "0 10px 30px rgba(15,23,42,0.08)",
                borderLeft: `5px solid ${b.color}`,
              }}
            >
              <div style={{ color: b.color, display: "flex" }}>
                <Icon size={48} strokeWidth={1.8} />
              </div>
              <div style={{ fontSize: "clamp(16px, 2vw, 24px)", fontWeight: 700, color: BRAND.ink }}>
                {b.label}
              </div>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.6 + i * 1.35, type: "spring", damping: 10 }}
                style={{
                  marginLeft: "auto",
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: b.color,
                  color: BRAND.white,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 900,
                  fontSize: 16,
                }}
              >
                ✓
              </motion.div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
