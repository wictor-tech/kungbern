import { AnimatePresence, motion } from "framer-motion";
import { useMemo } from "react";
import { BRAND, TIMELINE, type SceneName } from "./timeline";
import { useTimeline } from "./useTimeline";
import { LogoScene } from "./scenes/LogoScene";
import { ProblemScene } from "./scenes/ProblemScene";
import { SolutionScene } from "./scenes/SolutionScene";
import { BenefitsScene } from "./scenes/BenefitsScene";
import { CustomersScene } from "./scenes/CustomersScene";
import { CtaScene } from "./scenes/CtaScene";

const SCENE_MAP: Record<SceneName, React.FC> = {
  logo: LogoScene,
  problem: ProblemScene,
  solution: SolutionScene,
  benefits: BenefitsScene,
  customers: CustomersScene,
  cta: CtaScene,
};

const pickScene = (t: number): SceneName => {
  const entries = Object.entries(TIMELINE.scenes) as [SceneName, { start: number; end: number }][];
  for (const [name, { start, end }] of entries) {
    if (t >= start && t < end) return name;
  }
  return "cta";
};

export type LupnumberExplainerProps = {
  loop?: boolean;
  showProgress?: boolean;
  className?: string;
  style?: React.CSSProperties;
};

export const LupnumberExplainer: React.FC<LupnumberExplainerProps> = ({
  loop = true,
  showProgress = true,
  className,
  style,
}) => {
  const time = useTimeline({ loop });
  const current = useMemo(() => pickScene(time), [time]);
  const Scene = SCENE_MAP[current];
  const progress = Math.min(1, time / TIMELINE.total);

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "16 / 9",
        maxHeight: "90vh",
        borderRadius: 24,
        overflow: "hidden",
        background: `linear-gradient(135deg, ${BRAND.bg} 0%, ${BRAND.blueSoft} 100%)`,
        boxShadow: "0 40px 80px -20px rgba(15,23,42,0.25)",
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        ...style,
      }}
    >
      <BackgroundBlobs />

      <AnimatePresence mode="wait">
        <motion.div
          key={current}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          style={{ position: "absolute", inset: 0 }}
        >
          <Scene />
        </motion.div>
      </AnimatePresence>

      {showProgress && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 4, background: "rgba(15,23,42,0.08)" }}>
          <div
            style={{
              width: `${progress * 100}%`,
              height: "100%",
              background: `linear-gradient(90deg, ${BRAND.blue}, ${BRAND.green})`,
              transition: "width 0.1s linear",
            }}
          />
        </div>
      )}
    </div>
  );
};

const BackgroundBlobs: React.FC = () => (
  <>
    <motion.div
      animate={{ x: [0, 30, 0], y: [0, 20, 0] }}
      transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      style={{
        position: "absolute",
        top: "-10%",
        left: "-10%",
        width: "40%",
        height: "40%",
        background: `radial-gradient(circle, ${BRAND.blueLight}33, transparent 70%)`,
        pointerEvents: "none",
      }}
    />
    <motion.div
      animate={{ x: [0, -25, 0], y: [0, -15, 0] }}
      transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      style={{
        position: "absolute",
        bottom: "-15%",
        right: "-10%",
        width: "45%",
        height: "45%",
        background: `radial-gradient(circle, ${BRAND.greenLight}33, transparent 70%)`,
        pointerEvents: "none",
      }}
    />
  </>
);
