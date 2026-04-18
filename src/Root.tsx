import { Composition } from "remotion";
import { LupnumberShort } from "./LupnumberShort";
import { LupnumberExplainer } from "./explainer/LupnumberExplainer";

export const FPS = 30;

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="LupnumberShort"
        component={LupnumberShort}
        durationInFrames={540}
        fps={FPS}
        width={1080}
        height={1920}
      />
      <Composition
        id="LupnumberExplainer"
        component={LupnumberExplainer}
        durationInFrames={900}
        fps={FPS}
        width={1920}
        height={1080}
      />
    </>
  );
};
