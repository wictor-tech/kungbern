import { useState } from "react";
import type { Guide } from "../../../shared/types";
import { useHelp } from "../context";
import { Shot } from "./StepViewer";

/** "Så hittar du hit": var i programmet funktionen ligger – en kompakt rad med liten bild som kan förstoras. */
export function Where({ location }: { location: NonNullable<Guide["location"]> }) {
  const { t } = useHelp();
  const [open, setOpen] = useState(false);
  const last = location.path.length - 1;
  return (
    <section className="where" aria-label={t.whereTo}>
      <button className="where-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span aria-hidden>📍</span>
        <span className="where-path">
          {location.path.map((p, i) => <span key={i}>{i > 0 && <i aria-hidden> › </i>}{i === last ? <b>{p}</b> : p}</span>)}
        </span>
        {location.image && <span aria-hidden className="where-toggle">{open ? "▴" : "▾"}</span>}
      </button>
      {location.image && (
        <div className="where-shot" onClick={() => setOpen((o) => !o)}>
          <Shot step={{ id: "where", text: "", image: location.image, hotspot: location.hotspot, ratio: location.ratio }} zoomed={!open} showBadge={false} height={open ? undefined : 130} />
        </div>
      )}
    </section>
  );
}
