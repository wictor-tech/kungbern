import { dataLimitations, LIMITATIONS } from "../../analysis/limitations.ts";
import type { SiteModel } from "../../engine/model.ts";
import type { Lang, T } from "../i18n.ts";

export function LimitationsCard({ t_, lang, model, calibrationDays }: { t_: T; lang: Lang; model: SiteModel; calibrationDays?: number }) {
  const items = [...dataLimitations(model, { calibrationDays }), ...LIMITATIONS];
  return (
    <section className="card">
      <details>
        <summary style={{ cursor: "pointer" }}><h2 style={{ display: "inline" }}>{t_("limitations")}</h2> <span className="muted small">({items.length})</span></summary>
        <ul className="small" style={{ margin: "10px 0 0", paddingLeft: 18 }}>
          {items.map((l) => <li key={l.id} style={{ marginBottom: 4 }}>{l[lang]}</li>)}
        </ul>
      </details>
    </section>
  );
}
