import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { TIMELINE, BRAND } from "./timeline";
import { LogoScene } from "./scenes/LogoScene";
import { ProblemScene } from "./scenes/ProblemScene";
import { SolutionScene } from "./scenes/SolutionScene";
import { BenefitsScene } from "./scenes/BenefitsScene";
import { CustomersScene } from "./scenes/CustomersScene";
import { CtaScene } from "./scenes/CtaScene";

export const LupnumberExplainer: React.FC = () => {
  const { fps, durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();
  const s = (sec: number) => Math.round(sec * fps);
  const progress = frame / durationInFrames;

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, ${BRAND.bg} 0%, ${BRAND.blueSoft} 100%)`,
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      }}
    >
      <BackgroundBlobs />

      <Sequence from={s(TIMELINE.scenes.logo.start)} durationInFrames={s(TIMELINE.scenes.logo.end - TIMELINE.scenes.logo.start)}>
        <LogoScene />
      </Sequence>
      <Sequence from={s(TIMELINE.scenes.problem.start)} durationInFrames={s(TIMELINE.scenes.problem.end - TIMELINE.scenes.problem.start)}>
        <ProblemScene />
      </Sequence>
      <Sequence from={s(TIMELINE.scenes.solution.start)} durationInFrames={s(TIMELINE.scenes.solution.end - TIMELINE.scenes.solution.start)}>
        <SolutionScene />
      </Sequence>
      <Sequence from={s(TIMELINE.scenes.benefits.start)} durationInFrames={s(TIMELINE.scenes.benefits.end - TIMELINE.scenes.benefits.start)}>
        <BenefitsScene />
      </Sequence>
      <Sequence from={s(TIMELINE.scenes.customers.start)} durationInFrames={s(TIMELINE.scenes.customers.end - TIMELINE.scenes.customers.start)}>
        <CustomersScene />
      </Sequence>
      <Sequence from={s(TIMELINE.scenes.cta.start)} durationInFrames={s(TIMELINE.scenes.cta.end - TIMELINE.scenes.cta.start)}>
        <CtaScene />
      </Sequence>

      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 8, background: "rgba(15,23,42,0.08)" }}>
        <div
          style={{
            width: `${progress * 100}%`,
            height: "100%",
            background: `linear-gradient(90deg, ${BRAND.blue}, ${BRAND.green})`,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

const BackgroundBlobs: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const blob1X = interpolate(t % 14, [0, 7, 14], [0, 60, 0]);
  const blob1Y = interpolate(t % 14, [0, 7, 14], [0, 40, 0]);
  const blob2X = interpolate(t % 16, [0, 8, 16], [0, -50, 0]);
  const blob2Y = interpolate(t % 16, [0, 8, 16], [0, -30, 0]);

  return (
    <>
      <div
        style={{
          position: "absolute",
          top: "-10%",
          left: "-10%",
          width: "45%",
          height: "45%",
          transform: `translate(${blob1X}px, ${blob1Y}px)`,
          background: `radial-gradient(circle, ${BRAND.blueLight}33, transparent 70%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "-15%",
          right: "-10%",
          width: "50%",
          height: "50%",
          transform: `translate(${blob2X}px, ${blob2Y}px)`,
          background: `radial-gradient(circle, ${BRAND.greenLight}33, transparent 70%)`,
        }}
      />
    </>
  );
};
