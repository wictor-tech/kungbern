import { Composition } from "remotion";
import { LupnumberShort } from "./LupnumberShort";

export const FPS = 30;
export const DURATION_IN_FRAMES = 540;
export const WIDTH = 1080;
export const HEIGHT = 1920;

export const Root: React.FC = () => {
  return (
    <Composition
      id="LupnumberShort"
      component={LupnumberShort}
      durationInFrames={DURATION_IN_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
  );
};
