interface Props {
  id?: string;
  label: string;
  count: number;
  active: boolean;
}

export const ReactionTooltip = ({ id, label, count, active }: Props) => {
  return (
    <div
      id={id}
      role="tooltip"
      className="absolute bottom-full mb-2 rounded-md bg-black px-3 py-1 text-xs text-white shadow-lg"
    >
      {label} • {count}
      {active && <span className="ml-1 text-pink-400">(You)</span>}
    </div>
  );
};
