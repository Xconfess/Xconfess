interface Props {
  label: string;
  count: number;
  active: boolean;
}

export const ReactionTooltip = ({ label, count, active }: Props) => {
  return (
    <div className="absolute bottom-full mb-2 rounded-md bg-[var(--background)] px-3 py-1 text-xs text-[var(--foreground)] shadow-[var(--shadow-popover)]">
      {label} • {count}
      {active && <span className="ml-1 text-[var(--primary-deep)]">(You)</span>}
    </div>
  );
};
