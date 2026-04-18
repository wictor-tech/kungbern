import { motion } from "framer-motion";
import { BRAND } from "../timeline";
import { ArrowRightIcon, ShieldIcon } from "../icons";

export const CtaScene: React.FC = () => {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "clamp(20px, 3vw, 36px)", padding: "clamp(24px, 4vw, 48px)" }}>
      <motion.div
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", damping: 12, stiffness: 140 }}
        style={{ color: BRAND.green }}
      >
        <ShieldIcon size={88} strokeWidth={1.8} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.25, type: "spring", damping: 14 }}
        style={{
          fontSize: "clamp(32px, 5vw, 72px)",
          fontWeight: 900,
          color: BRAND.ink,
          textAlign: "center",
          letterSpacing: -1,
          lineHeight: 1.05,
        }}
      >
        Put safety <span style={{ color: BRAND.green }}>first!</span>
      </motion.div>

      <motion.a
        href="https://lupnumber.com"
        target="_blank"
        rel="noopener noreferrer"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0, scale: [1, 1.04, 1] }}
        transition={{
          opacity: { delay: 0.7 },
          y: { delay: 0.7 },
          scale: { delay: 1.2, duration: 1.4, repeat: Infinity },
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 12,
          padding: "clamp(14px, 1.8vw, 20px) clamp(28px, 3.5vw, 44px)",
          background: BRAND.green,
          color: BRAND.white,
          fontSize: "clamp(16px, 2vw, 22px)",
          fontWeight: 800,
          borderRadius: 999,
          textDecoration: "none",
          boxShadow: `0 14px 30px ${BRAND.greenLight}66`,
        }}
      >
        Kom igång
        <ArrowRightIcon size={22} />
      </motion.a>
    </div>
  );
};
