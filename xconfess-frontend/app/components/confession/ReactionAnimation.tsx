export const ReactionAnimation = ({ emoji }: { emoji: string }) => {
  return (
    <span className="pointer-events-none absolute -top-6 animate-float text-xl">
      {emoji}
    </span>
  );
};
