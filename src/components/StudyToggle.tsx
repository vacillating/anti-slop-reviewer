/** Small switch for study mode (before/after scoring). */
export default function StudyToggle({
  on,
  onChange,
  disabled,
}: {
  on: boolean;
  onChange(on: boolean): void;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      title={
        disabled
          ? "Study mode can only be changed before the walkthrough starts"
          : "Study mode asks for a score and first impression before the walkthrough, for a before/after comparison"
      }
      className="flex items-center gap-2 text-[13px] text-ink-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-ink-soft"
    >
      Study mode
      <span
        className={`relative inline-block h-[14px] w-[24px] rounded-full transition-colors ${on ? "bg-accent" : "bg-hairline"}`}
      >
        <span
          className={`absolute top-[2px] h-[10px] w-[10px] rounded-full bg-sheet shadow-sm transition-[left] ${
            on ? "left-[12px]" : "left-[2px]"
          }`}
        />
      </span>
    </button>
  );
}
