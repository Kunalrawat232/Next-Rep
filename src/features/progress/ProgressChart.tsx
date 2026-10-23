import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import type { Unit } from '../../domain/schemas';
import { toDisplay } from '../../domain/units';
import { dayLabel } from '../../domain/history';
import { niceAxis } from '../../domain/progress';
import type { SessionBest } from '../../domain/records';

const ink = 'var(--color-ink-muted)';

export type ChartMetric = 'weight' | 'reps';

/**
 * The top set over time: its weight, or its reps. The drawing is for sighted users only: the same numbers
 * are in the table next to it, which is what a screen reader gets.
 */
export function ProgressChart({
  points,
  unit,
  metric = 'weight',
}: {
  points: SessionBest[];
  unit: Unit;
  metric?: ChartMetric;
}) {
  const now = new Date();
  // About the same room above and below in either unit (5 kg is about 11 lb).
  const pad = metric === 'reps' ? 1 : unit === 'kg' ? 5 : 10;
  // Sessions are plotted by position, so two on the same day are two points.
  const data = points.map((p, i) => ({
    i,
    label: dayLabel(p.at, now),
    value: metric === 'reps' ? p.reps : toDisplay(p.totalKg, unit),
  }));
  const axis = niceAxis(
    data.map((d) => d.value),
    pad,
  );
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
            domain={[axis.min, axis.max]}
            ticks={axis.ticks}
            tickFormatter={(v: number) => String(Math.round(v * 10) / 10)}
            tick={{ fill: ink, fontSize: 12 }}
            stroke="var(--color-line)"
          />
          <Line
            type="monotone"
            dataKey="value"
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
