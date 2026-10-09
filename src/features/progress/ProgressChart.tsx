import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { formatKg } from '../../domain/gyms';
import { dayLabel } from '../../domain/history';
import type { SessionBest } from '../../domain/records';

const ink = 'var(--color-ink-muted)';

/**
 * The top set of each session over time. The drawing is for sighted users only: the same numbers
 * are in the table next to it, which is what a screen reader gets.
 */
export function ProgressChart({ points }: { points: SessionBest[] }) {
  const now = new Date();
  // Sessions are plotted by position, so two on the same day are two points.
  const data = points.map((p, i) => ({ i, label: dayLabel(p.at, now), kg: p.totalKg }));
  return (
    <div aria-hidden="true" className="h-60 w-full">
      <ResponsiveContainer
        width="100%"
        height="100%"
        initialDimension={{ width: 320, height: 240 }}
      >
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--color-line)" vertical={false} />
          <XAxis
            dataKey="i"
            tickFormatter={(i: number) => data[i]?.label ?? ''}
            tick={{ fill: ink, fontSize: 12 }}
            stroke="var(--color-line)"
          />
          <YAxis
            width={40}
            domain={['dataMin - 5', 'dataMax + 5']}
            tickFormatter={(v: number) => formatKg(v)}
            tick={{ fill: ink, fontSize: 12 }}
            stroke="var(--color-line)"
          />
          <Line
            type="monotone"
            dataKey="kg"
            stroke="var(--color-accent)"
            strokeWidth={2}
            dot={{ r: 4, fill: 'var(--color-accent)', stroke: 'var(--color-accent)' }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
