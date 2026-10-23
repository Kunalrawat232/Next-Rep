import { Line, LineChart, ResponsiveContainer, YAxis } from 'recharts';

/** A tiny line of a few values, for a list row. Decoration only: the same movement is written out next to it. */
export function Sparkline({ values }: { values: number[] }) {
  const data = values.map((value, i) => ({ i, value }));
  return (
    <div aria-hidden="true" className="h-10 w-24 shrink-0">
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 96, height: 40 }}>
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--color-accent)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
