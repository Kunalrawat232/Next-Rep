type Props = {
  checked: boolean;
  onChange(checked: boolean): void;
  /** Names the switch for screen readers and for tests. */
  label: string;
};

/** An on/off switch. The button is the touch target (48 px at least); the track inside it is what is drawn. */
export function Switch({ checked, onChange, label }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="flex min-h-touch min-w-touch shrink-0 items-center justify-center"
    >
      <span
        aria-hidden="true"
        className={`relative block h-8 w-14 rounded-full border border-line transition-colors motion-reduce:transition-none ${
          checked ? 'bg-accent' : 'bg-surface-300'
        }`}
      >
        <span
          className={`absolute top-0.5 block size-7 rounded-full bg-white shadow transition-[left] motion-reduce:transition-none ${
            checked ? 'left-[calc(100%-2rem)]' : 'left-0.5'
          }`}
        />
      </span>
    </button>
  );
}
