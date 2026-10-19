import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import type { WeekCount } from '../../domain/progress';

const ink = 'var(--color-ink-muted)';

/**
 * How many workouts were done each week. The drawing is for sighted users; the same numbers are in a table
 * that only a screen reader gets.
 */
export function WeeklyWorkoutsChart({ weeks }: { weeks: WeekCount[] }) {
  return (
    <section aria-labelledby="weekly-heading" className="flex flex-col gap-2">
      <h2 id="weekly-heading" className="text-headline font-semibold">
        Workouts per week
      </h2>
      <div aria-hidden="true" className="h-40 w-full">
        <ResponsiveContainer
          width="100%"
          height="100%"
          initialDimension={{ width: 320, height: 160 }}
        >
          <BarChart data={weeks} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--color-line)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: ink, fontSize: 12 }}
              stroke="var(--color-line)"
              interval="preserveStartEnd"
            />
            <YAxis
              width={24}
              allowDecimals={false}
              domain={[0, (max: number) => Math.max(max + 1, 4)]}
              tick={{ fill: ink, fontSize: 12 }}
              stroke="var(--color-line)"
            />
            <Bar
              dataKey="workouts"
              fill="var(--color-accent)"
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Workouts per week</caption>
        <thead>
          <tr>
            <th scope="col">Week of</th>
            <th scope="col">Workouts</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week.start}>
              <th scope="row">{week.label}</th>
              <td>{week.workouts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
