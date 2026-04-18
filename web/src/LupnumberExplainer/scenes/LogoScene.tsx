import { motion } from "framer-motion";
import { BRAND } from "../timeline";
import { ShieldIcon } from "../icons";

const LETTERS = "LUPNUMBER".split("");

export const LogoScene: React.FC = () => {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "clamp(16px, 2vw, 28px)" }}>
      <motion.div
        initial={{ scale: 0, rotate: -30, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: "spring", damping: 10, stiffness: 120, delay: 0.2 }}
        style={{ color: BRAND.green, display: "flex" }}
      >
        <ShieldIcon size={120} strokeWidth={1.8} />
      </motion.div>

      <div style={{ display: "flex", gap: 2 }}>
        {LETTERS.map((letter, i) => (
          <motion.span
            key={i}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.8 + i * 0.08, type: "spring", damping: 14 }}
            style={{
              fontSize: "clamp(40px, 7vw, 88px)",
              fontWeight: 900,
              color: BRAND.ink,
              letterSpacing: -2,
              lineHeight: 1,
            }}
          >
            {letter}
          </motion.span>
        ))}
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.8 }}
          style={{
            fontSize: "clamp(16px, 2vw, 28px)",
            color: BRAND.green,
            fontWeight: 700,
            alignSelf: "flex-start",
            marginLeft: 4,
            marginTop: 4,
          }}
        >
          ®
        </motion.span>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2.2 }}
        style={{
          fontSize: "clamp(14px, 1.8vw, 22px)",
          color: BRAND.muted,
          fontWeight: 500,
          letterSpacing: 2,
          textTransform: "uppercase",
        }}
      >
        Smart truck check-in
      </motion.div>
    </div>
  );
};
