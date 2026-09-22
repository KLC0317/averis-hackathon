export default function Loading() {
  return (
    <div className="route-loading" role="status" aria-live="polite" aria-label="Loading page">
      <div className="route-loading-header">
        <span className="skeleton-shimmer skeleton-line" />
        <span className="skeleton-shimmer skeleton-btn" />
      </div>
      <div className="route-loading-grid">
        <span className="skeleton-shimmer skeleton-line" />
        <span className="skeleton-shimmer skeleton-line" />
        <span className="skeleton-shimmer skeleton-line" />
      </div>
      <div className="route-loading-table">
        {Array.from({ length: 5 }, (_, index) => (
          <span className="skeleton-shimmer skeleton-line" key={index} />
        ))}
      </div>
    </div>
  );
}
