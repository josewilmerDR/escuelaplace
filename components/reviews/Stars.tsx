/** Read-only star display for a rating in [0,5]. */
export function Stars({
  value,
  className = "",
}: {
  value: number;
  className?: string;
}) {
  const full = Math.round(value);
  return (
    <span className={`text-brand ${className}`} aria-label={`${value.toFixed(1)} de 5`}>
      {"★★★★★".slice(0, full)}
      <span className="text-slate-300">{"★★★★★".slice(full)}</span>
    </span>
  );
}
