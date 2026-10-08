import type { RunResult } from "../../engine/types.ts";
import { formatClock } from "../../engine/time.ts";
import type { T } from "../i18n.ts";

interface Props {
  result: RunResult;
  doors: string[];
  bounds: [number, number];
  openFrom: number;
  openTo: number;
  t: number;
  onSeek: (t: number) => void;
  t_: T;
}

const LEFT = 56;
const W = 1000;
const QH = 56;
const ROW = 18;

/** Tidslinje: kö överst (ytdiagram), därunder en rad per dörr med lossning (fylld) och ledig tid (tom). */
export function Gantt({ result, doors, bounds, openFrom, openTo, t, onSeek, t_ }: Props) {
  const [t0, t1] = bounds;
  const x = (m: number) => LEFT + ((m - t0) / Math.max(1, t1 - t0)) * (W - LEFT - 8);
  const H = QH + 14 + doors.length * ROW + 22;
  const maxQ = Math.max(1, ...result.series.map((p) => p.waiting));
  const qy = (v: number) => QH - (v / maxQ) * (QH - 6);

  let path = `M ${x(t0)} ${qy(0)}`;
  let prev = 0;
  for (const p of result.series) {
    path += ` L ${x(p.t)} ${qy(prev)} L ${x(p.t)} ${qy(p.waiting)}`;
    prev = p.waiting;
  }
  path += ` L ${x(t1)} ${qy(prev)} L ${x(t1)} ${qy(0)} Z`;

  const hours: number[] = [];
  for (let h = Math.ceil(t0 / 60) * 60; h <= t1; h += 60) hours.push(h);
  const rowY = (i: number) => QH + 14 + i * ROW;

  const click = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    const m = t0 + ((p.x - LEFT) / (W - LEFT - 8)) * (t1 - t0);
    onSeek(Math.min(t1, Math.max(t0, m)));
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", cursor: "pointer" }} onClick={click} role="img" aria-label={t_("timeline")}>
      <rect x={x(openFrom)} y={0} width={x(openTo) - x(openFrom)} height={H - 20} fill="var(--accent-soft)" opacity={0.5} />
      {hours.map((h) => (
        <g key={h}>
          <line x1={x(h)} x2={x(h)} y1={0} y2={H - 20} stroke="var(--grid)" />
          <text x={x(h)} y={H - 6} fontSize={11} textAnchor="middle" fill="var(--muted)">{formatClock(h)}</text>
        </g>
      ))}
      <text x={4} y={QH / 2} fontSize={11} fill="var(--muted)">{t_("queue")}</text>
      <text x={4} y={QH / 2 + 13} fontSize={10} fill="var(--muted)">max {maxQ}</text>
      <path d={path} fill="var(--st-wait)" opacity={0.55} />
      {doors.map((d, i) => (
        <g key={d}>
          <text x={4} y={rowY(i) + 12} fontSize={11} fill="var(--muted)">{d}</text>
          <rect x={LEFT} y={rowY(i) + 2} width={W - LEFT - 8} height={ROW - 4} fill="var(--grid)" opacity={0.35} rx={2} />
        </g>
      ))}
      {result.doorIntervals.map((iv) => {
        const i = doors.indexOf(iv.doorId);
        return (
          <rect key={`${iv.doorId}-${iv.truckId}`} x={x(iv.start)} y={rowY(i) + 2} width={Math.max(1, x(iv.end) - x(iv.start) - 0.5)} height={ROW - 4} rx={2} fill="var(--st-unload)" opacity={iv.start <= t ? 1 : 0.45}>
            <title>{`${iv.truckId} ${formatClock(iv.start)}–${formatClock(iv.end)}`}</title>
          </rect>
        );
      })}
      <line x1={x(t)} x2={x(t)} y1={0} y2={H - 20} stroke="var(--heading)" strokeWidth={2} />
    </svg>
  );
}
