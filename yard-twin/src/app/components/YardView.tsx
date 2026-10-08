import { useMemo } from "react";
import type { RunResult } from "../../engine/types.ts";
import { fmtNum, type Lang, type T } from "../i18n.ts";
import { STATUS_COLOR, STATUS_KEY, type TruckStatus } from "../playback.ts";
import { doorPositions, LAYOUT, layoutAt, makeSpots } from "../yardLayout.ts";

interface Props {
  result: RunResult;
  doors: string[];
  t: number;
  t_: T;
  lang: Lang;
  present?: boolean;
}

/** Gården uppifrån: väg och kö, grind, uppställning, lagerbyggnad med dörrar, pappersarbete och utfart. */
export function YardView({ result, doors, t, t_, lang, present }: Props) {
  const { W, H, BLD, PARK, KIOSK, GATE, ROAD_Y } = LAYOUT;
  const spots = useMemo(() => makeSpots(result), [result]);
  const doorX = useMemo(() => doorPositions(doors), [doors]);
  const byId = useMemo(() => new Map(result.trucks.map((o) => [o.id, o])), [result]);
  const { trucks, hiddenQueue, busyDoors } = layoutAt(result, t, spots, doorX);
  const fs = present ? 15 : 12;

  return (
    <div className="yard">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t_("yard")}>
        <defs>
          <pattern id="stripes" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="4" height="8" fill="var(--grid)" />
          </pattern>
        </defs>
        <rect x={300} y={140} width={690} height={370} rx={14} fill="var(--asphalt)" />
        <rect x={0} y={ROAD_Y - 52} width={330} height={74} fill="var(--asphalt)" />
        <line x1={0} x2={300} y1={ROAD_Y - 15} y2={ROAD_Y - 15} stroke="var(--border)" strokeDasharray="14 10" strokeWidth={2} />
        <text x={10} y={ROAD_Y + 38} fontSize={fs} fill="var(--muted)">
          {t_("queueOutside")}
          {hiddenQueue > 0 ? ` (+${hiddenQueue})` : ""}
        </text>

        <rect x={BLD.x} y={BLD.y} width={BLD.w} height={BLD.h} rx={8} fill="var(--building)" stroke="var(--border)" />
        <text x={BLD.x + 16} y={BLD.y + 26} fontSize={fs + 2} fontWeight={700} fill="var(--heading)">{t_("building")}</text>
        {doors.map((d) => {
          const x = doorX.get(d)!;
          const on = busyDoors.has(d);
          return (
            <g key={d}>
              <rect x={x - 15} y={BLD.y + BLD.h - 8} width={30} height={12} rx={2} fill={on ? "var(--st-unload)" : "var(--card)"} stroke="var(--accent)" style={{ transition: "fill 0.3s" }} />
              <text x={x} y={BLD.y + BLD.h - 14} fontSize={fs - 1} textAnchor="middle" fill="var(--muted)">{d}</text>
            </g>
          );
        })}

        <text x={PARK.x - 4} y={PARK.y - 18} fontSize={fs} fill="var(--muted)">{t_("parkingArea")}</text>
        {Array.from({ length: PARK.cols * PARK.rows }, (_, k) => (
          <rect key={k} x={PARK.x + (k % PARK.cols) * PARK.dx} y={PARK.y + Math.floor(k / PARK.cols) * PARK.dy - 10} width={52} height={20} rx={3} fill="none" stroke="var(--grid)" />
        ))}

        <rect x={GATE.x - 30} y={ROAD_Y - 52} width={6} height={74} fill="var(--st-gate)" opacity={0.6} />
        <text x={GATE.x - 27} y={ROAD_Y - 58} fontSize={fs} fill="var(--muted)" textAnchor="middle">{t_("gate")}</text>

        <rect x={KIOSK.x - 26} y={KIOSK.y - 30} width={KIOSK.n * KIOSK.dx + 12} height={60} rx={6} fill="url(#stripes)" opacity={0.6} />
        <text x={KIOSK.x + 120} y={KIOSK.y + 44} fontSize={fs} fill="var(--muted)" textAnchor="end">{t_("exit")} →</text>

        {trucks.map((v) => {
          const o = byId.get(v.id)!;
          const wait = o.doorStart !== null && o.doorStart <= t ? o.doorStart - o.arrival : t - o.arrival;
          return (
            <g key={v.id} className="truck" style={{ transform: `translate(${v.x}px, ${v.y}px) rotate(${v.rot}deg)` }}>
              <title>{`${o.id} · ${o.carrier} · ${o.goodsType}${o.pallets !== null ? ` · ${o.pallets} pall` : ""} · ${t_(STATUS_KEY[v.status])} · ${fmtNum(lang, Math.max(0, wait))} min`}</title>
              <rect x={-24} y={-8} width={38} height={16} rx={2.5} fill={STATUS_COLOR[v.status]} style={{ transition: "fill 0.3s" }} />
              <rect x={15} y={-7} width={10} height={14} rx={2.5} fill="var(--heading)" opacity={0.85} />
            </g>
          );
        })}
      </svg>
      <div className="legend" aria-hidden="true">
        {(["queue", "wait", "overflow", "unload", "leave"] as TruckStatus[]).map((s) => (
          <span key={s}>
            <i style={{ background: STATUS_COLOR[s] }} />
            {t_(STATUS_KEY[s])}
          </span>
        ))}
      </div>
    </div>
  );
}
