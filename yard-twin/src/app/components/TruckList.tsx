import type { RunResult } from "../../engine/types.ts";
import { formatClock } from "../../engine/time.ts";
import { fmtNum, type Lang, type T } from "../i18n.ts";
import { STATUS_COLOR, STATUS_KEY, statusAt } from "../playback.ts";

export function TruckList({ result, t, t_, lang }: { result: RunResult; t: number; t_: T; lang: Lang }) {
  return (
    <div className="scroll">
      <table className="list">
        <thead>
          <tr>
            <th>{t_("colTruck")}</th>
            <th>{t_("colStatus")}</th>
            <th>{t_("colArrival")}</th>
            <th>{t_("colSlot")}</th>
            <th>{t_("colWait")}</th>
            <th>{t_("colDoor")}</th>
            <th>{t_("colCarrier")}</th>
            <th>{t_("colGoods")}</th>
            <th>{t_("colPallets")}</th>
          </tr>
        </thead>
        <tbody>
          {result.trucks.map((o) => {
            const s = statusAt(o, t);
            const wait = o.doorStart !== null && o.doorStart <= t ? o.doorStart - o.arrival : t >= o.arrival ? t - o.arrival : null;
            return (
              <tr key={o.id} style={{ opacity: s === "planned" || s === "done" ? 0.55 : 1 }}>
                <td className="num">{o.id}</td>
                <td><span className="status-dot" style={{ background: STATUS_COLOR[s] }} />{t_(STATUS_KEY[s])}</td>
                <td className="num">{formatClock(o.arrival)}</td>
                <td className="num">{o.slotStart !== null ? formatClock(o.slotStart) : o.walkIn ? "–" : ""}</td>
                <td className="num">{wait !== null ? `${fmtNum(lang, wait)} min` : ""}</td>
                <td>{o.doorId ?? ""}</td>
                <td>{o.carrier}</td>
                <td>{o.goodsType}</td>
                <td className="num">{o.pallets ?? ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
