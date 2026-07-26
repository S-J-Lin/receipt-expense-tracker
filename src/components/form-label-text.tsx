export function FormLabelText({ label }: { label: string }) {
  const optional = label.endsWith("（選填）");
  if (!optional) return <>{label}</>;
  return <>{label.slice(0, -4)}<span className="form-optional">（選填）</span></>;
}
