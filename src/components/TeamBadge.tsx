export function TeamBadge({
  name,
  logo,
  size = 22,
  reverse = false,
  className = "",
}: {
  name: string;
  logo?: string;
  size?: number;
  reverse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 ${reverse ? "flex-row-reverse" : ""} ${className}`}
    >
      {logo ? (
        <img src={logo} alt="" width={size} height={size} className="rounded-sm" />
      ) : (
        <span
          className="inline-block rounded-sm bg-[var(--border)]"
          style={{ width: size, height: size }}
        />
      )}
      <span className="truncate">{name}</span>
    </span>
  );
}
