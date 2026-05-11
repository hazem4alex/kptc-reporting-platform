export function Loading() {
  return <div className="state">Loading reporting data...</div>;
}

export function ErrorState({ message }) {
  return (
    <div className="state state-error">
      <strong>Unable to load data.</strong>
      <span>{message}</span>
    </div>
  );
}

export function EmptyState({ children = "No data available yet." }) {
  return <div className="state">{children}</div>;
}
