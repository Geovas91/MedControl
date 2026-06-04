type QrCodePlaceholderProps = {
  label?: string;
};

export function QrCodePlaceholder({ label = "Mock signing QR" }: QrCodePlaceholderProps) {
  return (
    <div className="grid aspect-square w-full max-w-40 place-items-center rounded-md border border-slate-200 bg-white p-3">
      <div className="grid h-full w-full grid-cols-5 gap-1">
        {Array.from({ length: 25 }).map((_, index) => (
          <span
            key={index}
            className={(index + Math.floor(index / 5)) % 3 === 0 ? "rounded-sm bg-ink" : "rounded-sm bg-slate-100"}
          />
        ))}
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
