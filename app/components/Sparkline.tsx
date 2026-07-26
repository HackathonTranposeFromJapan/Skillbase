export function Sparkline({
  data,
  width = 92,
  height = 24,
  stroke = "var(--color-accent-500)",
}: {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
}) {
  if (data.length < 2) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const step = width / (data.length - 1);

  const points = data.map((v, i) => [i * step, height - ((v - min) / span) * (height - 3) - 1.5]);
  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={area} fill={stroke} opacity="0.1" />
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={points[points.length - 1][0]} cy={points[points.length - 1][1]} r="2" fill={stroke} />
    </svg>
  );
}
