import { motion } from "framer-motion";
import { BRAND } from "../timeline";
import { TruckIcon, ScreenIcon, CloudIcon, CheckIcon } from "../icons";

export const SolutionScene: React.FC = () => {
  return (
    <div style={{ position: "absolute", inset: 0, padding: "clamp(24px, 4vw, 48px)", display: "flex", flexDirection: "column" }}>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        style={{ textAlign: "center" }}
      >
        <div style={{ fontSize: "clamp(22px, 3vw, 40px)", fontWeight: 800, color: BRAND.ink }}>
          Digital check-in med LUPNUMBER
        </div>
        <div style={{ fontSize: "clamp(13px, 1.6vw, 18px)", color: BRAND.muted, marginTop: 8 }}>
          En smidig flödesupplevelse från start till mål
        </div>
      </motion.div>

      <div style={{ position: "relative", flex: 1 }}>
        {/* Road */}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: "18%", height: 6, background: "#cbd5e1", borderRadius: 3 }} />

        {/* Truck drives in from left */}
        <motion.div
          initial={{ x: "-25%", opacity: 0 }}
          animate={{ x: "10%", opacity: 1 }}
          transition={{ delay: 0.4, duration: 1.6, ease: "easeOut" }}
          style={{ position: "absolute", bottom: "20%", color: BRAND.blue }}
        >
          <TruckIcon size={120} strokeWidth={1.6} />
        </motion.div>

        {/* Digital screen/kiosk */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1.6, type: "spring", damping: 14 }}
          style={{
            position: "absolute",
            right: "10%",
            bottom: "22%",
            background: BRAND.white,
            border: `3px solid ${BRAND.blue}`,
            borderRadius: 16,
            padding: "clamp(16px, 2vw, 24px)",
            boxShadow: "0 20px 40px rgba(29,78,216,0.2)",
            minWidth: "clamp(160px, 20vw, 240px)",
          }}
        >
          <div style={{ color: BRAND.blue, marginBottom: 8 }}>
            <ScreenIcon size={36} strokeWidth={2} />
          </div>
          <div style={{ fontSize: "clamp(11px, 1.2vw, 14px)", color: BRAND.muted, marginBottom: 4 }}>
            LUP #48291
          </div>
          {["Identitet", "Säkerhet", "Destination"].map((label, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 2.1 + i * 0.3 }}
              style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "clamp(12px, 1.3vw, 16px)", fontWeight: 600, color: BRAND.ink, marginTop: 6 }}
            >
              <span style={{ color: BRAND.green, display: "inline-flex" }}>
                <CheckIcon size={18} />
              </span>
              {label}
            </motion.div>
          ))}
        </motion.div>

        {/* Data flow dots from screen to cloud */}
        <div style={{ position: "absolute", top: "5%", right: "8%", color: BRAND.greenLight }}>
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 2.6, type: "spring" }}
          >
            <CloudIcon size={72} strokeWidth={1.8} />
          </motion.div>
        </div>

        {[0, 1, 2, 3].map((i) => (
          <motion.div
            key={`dot${i}`}
            initial={{ opacity: 0 }}
            animate={{
              opacity: [0, 1, 1, 0],
              x: [0, 40, 80, 120],
              y: [0, -40, -80, -120],
            }}
            transition={{
              delay: 3.0 + i * 0.25,
              duration: 1.4,
              repeat: Infinity,
              repeatDelay: 0.3,
            }}
            style={{
              position: "absolute",
              right: "22%",
              bottom: "36%",
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: BRAND.greenLight,
              boxShadow: `0 0 12px ${BRAND.greenLight}`,
            }}
          />
        ))}
      </div>
    </div>
  );
};
