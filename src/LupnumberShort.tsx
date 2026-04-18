import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { Background } from "./components/Background";
import { IntroScene } from "./scenes/IntroScene";
import { SearchScene } from "./scenes/SearchScene";
import { FeaturesScene } from "./scenes/FeaturesScene";
import { CtaScene } from "./scenes/CtaScene";

export const LupnumberShort: React.FC = () => {
  const { fps } = useVideoConfig();
  const s = (sec: number) => Math.round(sec * fps);

  return (
    <AbsoluteFill style={{ backgroundColor: "#0b0f1a" }}>
      <Background />
      <Sequence from={s(0)} durationInFrames={s(3)}>
        <IntroScene />
      </Sequence>
      <Sequence from={s(3)} durationInFrames={s(5)}>
        <SearchScene />
      </Sequence>
      <Sequence from={s(8)} durationInFrames={s(5)}>
        <FeaturesScene />
      </Sequence>
      <Sequence from={s(13)} durationInFrames={s(5)}>
        <CtaScene />
      </Sequence>
    </AbsoluteFill>
  );
};
