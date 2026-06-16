type StatCardProps = {
  label: string;
  value: string;
  note: string;
};

export function StatCard({ label, value, note }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-[var(--shadow-lift)]">
      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-3 text-3xl font-black tracking-tight text-slate-950">
        {value}
      </div>
      <div className="mt-2 text-sm font-medium leading-5 text-slate-500">
        {note}
      </div>
    </div>
  );
}
