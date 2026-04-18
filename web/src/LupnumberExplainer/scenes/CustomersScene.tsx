import { motion } from "framer-motion";
import { BRAND } from "../timeline";

const CUSTOMERS = [
  "NORDLOG",
  "STENA",
  "VOLVO LOG",
  "PORTCO",
  "ARKHAM",
  "SCANIA",
  "DFDS",
  "MAERSK",
];

export const CustomersScene: React.FC = () => {
  const row = [...CUSTOMERS, ...CUSTOMERS];

  return (
    <div style={{ position: "absolute", inset: 0, padding: "clamp(24px, 4vw, 48px)", display: "flex", flexDirection: "column", justifyContent: "center", gap: "clamp(20px, 3vw, 36px)" }}>
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        style={{ textAlign: "center" }}
      >
        <div style={{ fontSize: "clamp(13px, 1.6vw, 18px)", color: BRAND.green, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>
          Trusted by industry leaders
        </div>
        <div style={{ fontSize: "clamp(20px, 2.8vw, 36px)", fontWeight: 800, color: BRAND.ink, marginTop: 8 }}>
          Joining 100+ logistik-partners
        </div>
      </motion.div>

      <div style={{ position: "relative", overflow: "hidden", maskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)", WebkitMaskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)" }}>
        <motion.div
          animate={{ x: ["0%", "-50%"] }}
          transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
          style={{ display: "flex", gap: "clamp(20px, 3vw, 48px)", width: "max-content" }}
        >
          {row.map((name, i) => (
            <div
              key={i}
              style={{
                padding: "clamp(14px, 1.8vw, 22px) clamp(24px, 3vw, 44px)",
                background: BRAND.white,
                borderRadius: 12,
                boxShadow: "0 6px 18px rgba(15,23,42,0.06)",
                fontSize: "clamp(16px, 2vw, 24px)",
                fontWeight: 800,
                color: BRAND.muted,
                letterSpacing: 1,
                whiteSpace: "nowrap",
              }}
            >
              {name}
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
};
