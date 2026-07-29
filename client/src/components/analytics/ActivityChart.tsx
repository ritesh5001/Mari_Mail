"use client";

import { useId, useMemo, useState } from "react";

export type ActivityPoint = { day: string; sent: number; replied: number };

/**
 * Sent-vs-replied activity over time.
 *
 * Replaces the old Sparkline, which scaled `sent` and `replied` against their
 * OWN maxima — two y-scales on one plot, so a day with 1 reply drew level with
 * a day of 19 sends. Both series now share ONE axis, which is the whole point
 * of plotting them together.
 *
 * Series colors are validated for CVD separation and surface contrast in both
 * modes (light #4F6DFF/#10B981, dark #4F6DFF/#0EA37A). Tritan separation sits
 * in the floor band, so the legend + direct value labels are load-bearing as
 * secondary encoding — identity is never carried by color alone.
 */

const PAD = { top: 12, right: 12, bottom: 22, left: 34 };

function niceCeil(value: number) {
  if (value <= 5) return 5;
  const mag = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / mag) * mag;
}

function formatDay(day: string) {
  const d = new Date(day);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
}

export function ActivityChart({
  points,
  height = 200,
}: {
  points: ActivityPoint[];
  height?: number;
}) {
  const gradientId = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);

  // Fixed viewBox; the SVG scales fluidly to its container width.
  const width = 720;
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;

  const { max, ticks, xs, sentPath, repliedPath, sentArea, hasReplies } = useMemo(() => {
    // ONE scale for both series — never a second y-axis.
    const peak = Math.max(...points.map((p) => Math.max(p.sent, p.replied)), 1);
    const max = niceCeil(peak);
    const ticks = [0, max / 2, max];

    const x = (i: number) => PAD.left + (i / Math.max(points.length - 1, 1)) * plotW;
    const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
    const xs = points.map((_, i) => x(i));

    const line = (key: "sent" | "replied") =>
      points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(" ");

    const sentPath = line("sent");
    const repliedPath = line("replied");
    const sentArea =
      points.length > 1
        ? `${sentPath} L ${x(points.length - 1).toFixed(1)} ${(PAD.top + plotH).toFixed(1)} L ${x(0).toFixed(1)} ${(PAD.top + plotH).toFixed(1)} Z`
        : "";

    return {
      max,
      ticks,
      xs,
      sentPath,
      repliedPath,
      sentArea,
      hasReplies: points.some((p) => p.replied > 0),
    };
  }, [points, plotW, plotH]);

  if (!points.length) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-slate-200 text-sm text-slate-400 dark:border-white/10 dark:text-white/40">
        No activity in this period yet.
      </div>
    );
  }

  const active = hover != null ? points[hover] : null;

  return (
    <figure className="m-0">
      {/* Legend — always present for 2 series, so identity never rests on color alone. */}
      <figcaption className="mb-3 flex flex-wrap items-center gap-4 text-xs">
        <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-white/70">
          <span className="h-2 w-2 rounded-full bg-[#4F6DFF]" aria-hidden />
          Sent
        </span>
        <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-white/70">
          <span className="h-2 w-2 rounded-full bg-[#10B981] dark:bg-[#0EA37A]" aria-hidden />
          Replied
          {/* Be honest when there is simply nothing to draw. */}
          {!hasReplies && <span className="text-slate-400 dark:text-white/35">· none yet</span>}
        </span>
        {active && (
          <span className="ml-auto font-medium text-slate-700 dark:text-white/80">
            {formatDay(active.day)} · {active.sent} sent · {active.replied} replied
          </span>
        )}
      </figcaption>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full overflow-visible"
        role="img"
        aria-label={`Emails sent and replied per day. Peak ${max} per day.`}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`${gradientId}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4F6DFF" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#4F6DFF" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Recessive gridlines + y labels */}
        {ticks.map((t) => {
          const y = PAD.top + plotH - (t / max) * plotH;
          return (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y}
                y2={y}
                className="stroke-slate-200 dark:stroke-white/10"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={y + 3}
                textAnchor="end"
                className="fill-slate-400 text-[10px] dark:fill-white/35"
              >
                {t}
              </text>
            </g>
          );
        })}

        {/* First / last date labels only — never a label on every point. */}
        <text x={PAD.left} y={height - 6} className="fill-slate-400 text-[10px] dark:fill-white/35">
          {formatDay(points[0].day)}
        </text>
        <text
          x={width - PAD.right}
          y={height - 6}
          textAnchor="end"
          className="fill-slate-400 text-[10px] dark:fill-white/35"
        >
          {formatDay(points[points.length - 1].day)}
        </text>

        {sentArea && <path d={sentArea} fill={`url(#${gradientId}-fill)`} />}
        <path d={sentPath} fill="none" stroke="#4F6DFF" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hasReplies && (
          <path
            d={repliedPath}
            fill="none"
            className="stroke-[#10B981] dark:stroke-[#0EA37A]"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* Crosshair + markers for the hovered day */}
        {hover != null && (
          <g pointerEvents="none">
            <line
              x1={xs[hover]}
              x2={xs[hover]}
              y1={PAD.top}
              y2={PAD.top + plotH}
              className="stroke-slate-300 dark:stroke-white/20"
              strokeWidth={1}
            />
            <circle
              cx={xs[hover]}
              cy={PAD.top + plotH - (points[hover].sent / max) * plotH}
              r={4}
              fill="#4F6DFF"
              className="stroke-white dark:stroke-[#101013]"
              strokeWidth={2}
            />
            {hasReplies && (
              <circle
                cx={xs[hover]}
                cy={PAD.top + plotH - (points[hover].replied / max) * plotH}
                r={4}
                className="fill-[#10B981] stroke-white dark:fill-[#0EA37A] dark:stroke-[#101013]"
                strokeWidth={2}
              />
            )}
          </g>
        )}

        {/* Hit targets — wider than the marks so hovering is easy. */}
        {points.map((p, i) => (
          <rect
            key={p.day}
            x={xs[i] - plotW / Math.max(points.length - 1, 1) / 2}
            y={PAD.top}
            width={plotW / Math.max(points.length - 1, 1)}
            height={plotH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </svg>
    </figure>
  );
}
