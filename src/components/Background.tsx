import { AbsoluteFill, useCurrentFrame } from "remotion";

export const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const shift = (frame / 540) * 40;

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at ${30 + shift}% ${20 + shift / 2}%, #1e3a8a 0%, #0b0f1a 55%), radial-gradient(circle at ${70 - shift}% ${80 - shift / 2}%, #7c3aed 0%, transparent 50%)`,
      }}
    />
  );
};
