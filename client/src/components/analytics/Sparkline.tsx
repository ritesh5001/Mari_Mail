type SparkPoint = { day: string; sent: number; replied: number };

export function Sparkline({ points, height = 36, width = 160 }: { points: SparkPoint[]; height?: number; width?: number }) {
  if (!points.length) {
    return <div className="text-xs text-slate-400">No activity yet</div>;
  }
  const maxSent = Math.max(...points.map((p) => p.sent), 1);
  const maxReplied = Math.max(...points.map((p) => p.replied), 1);

  const path = (key: "sent" | "replied", max: number) =>
    points
      .map((point, idx) => {
        const x = (idx / Math.max(points.length - 1, 1)) * width;
        const value = point[key] / max;
        const y = height - value * height;
        return `${idx === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="text-ocean">
      <path d={path("sent", maxSent)} fill="none" stroke="currentColor" strokeWidth={1.5} />
      <path d={path("replied", maxReplied)} fill="none" stroke="#0A2342" strokeWidth={1.5} strokeDasharray="3 2" />
    </svg>
  );
}
