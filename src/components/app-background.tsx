export function AppBackground({ src }: { src?: string }) {
  return (
    <div
      aria-hidden="true"
      className="app-background"
      style={src ? ({ "--hh211-background-image": `url(${src})` } as React.CSSProperties) : undefined}
    >
      <div className="app-background-image" />
      <div className="app-background-overlay" />
    </div>
  );
}
