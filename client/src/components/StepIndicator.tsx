/**
 * Wizard step indicator (2026 redesign). Four fixed steps that mirror the
 * quote flow: Choose plan → Size → Details → Review. `current` is the 1-based
 * index of the active step; earlier steps render as completed (navy + check),
 * the active one is orange, later ones are muted outlines.
 */
const STEPS = ['Choose plan', 'Size', 'Details', 'Review'];

export const StepIndicator = ({ current }: { current: 1 | 2 | 3 | 4 }) => (
  <div className="flex items-center justify-center gap-2.5 pt-7 pb-1 flex-wrap">
    {STEPS.map((label, i) => {
      const n = i + 1;
      const done = n < current;
      const active = n === current;
      const bg = active ? '#D96626' : done ? '#16243F' : '#FFFFFF';
      const fg = active || done ? '#FFFFFF' : '#9AA3B1';
      const bd = active ? '#D96626' : done ? '#16243F' : '#DCD9D2';
      const labelColor = active ? '#16243F' : done ? '#4A5563' : '#9AA3B1';
      return (
        <div key={label} className="flex items-center gap-2.5">
          <div className="flex items-center gap-2">
            <span
              className="w-[26px] h-[26px] rounded-full inline-flex items-center justify-center font-heading font-bold text-[13px] border-[1.5px]"
              style={{ background: bg, color: fg, borderColor: bd }}
            >
              {done ? '✓' : n}
            </span>
            <span
              className="text-[13.5px]"
              style={{ color: labelColor, fontWeight: active ? 600 : 500 }}
            >
              {label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <span className="w-[26px] h-0.5 bg-[#E2DFD8] inline-block" />
          )}
        </div>
      );
    })}
  </div>
);

export default StepIndicator;
