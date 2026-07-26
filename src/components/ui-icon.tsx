export type UiIconName = "home" | "plus" | "import" | "export" | "more";

const paths: Record<UiIconName, React.ReactNode> = {
  home: <><path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6"/></>,
  plus: <><path d="M12 5v14"/><path d="M5 12h14"/></>,
  import: <><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/></>,
  export: <><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/></>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
};

export function UiIcon({ name, className = "h-5 w-5" }: { name: UiIconName; className?: string }) {
  return <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75">{paths[name]}</svg>;
}
