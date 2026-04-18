import { LupnumberExplainer } from "./LupnumberExplainer";

export const App = () => {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 1280 }}>
        <LupnumberExplainer />
      </div>
    </div>
  );
};
