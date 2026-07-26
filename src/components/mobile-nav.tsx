"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MOBILE_NAV_ITEMS } from "@/lib/pwa-config";
import { UiIcon, type UiIconName } from "@/components/ui-icon";

export function MobileNav() {
  const pathname = usePathname();
  return <nav aria-label="手機主要導覽" className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden">
    <div className="mx-auto grid max-w-lg grid-cols-5 px-1">{MOBILE_NAV_ITEMS.map((item) => {
      const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
      return <Link aria-current={active ? "page" : undefined} aria-label={item.label} className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-xs font-semibold ${active ? "text-indigo-700" : "text-slate-600"}`} href={item.href} key={item.href}>
        <UiIcon className="h-5 w-5" name={item.icon as UiIconName} /><span>{item.label}</span>
      </Link>;
    })}</div>
  </nav>;
}
