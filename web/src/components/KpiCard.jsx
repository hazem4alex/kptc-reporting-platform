export function KpiCard({ label, value, tone = "default" }) {
  return (
    <article className={`kpi kpi-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
