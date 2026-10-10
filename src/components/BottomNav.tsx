"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
    {
        href: "/",
        label: "入力",
        icon: "M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10",
    },
    {
        href: "/history",
        label: "履歴",
        icon: "M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm0 5.25h.007v.008H3.75V12zm0 5.25h.007v.008H3.75v-.008z",
    },
    {
        href: "/monthly",
        label: "月報",
        icon: "M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3",
    },
    {
        href: "/settings",
        label: "設定",
        icon: "M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75",
    },
];

export default function BottomNav() {
    const pathname = usePathname();

    return (
        <nav
            aria-label="メインメニュー"
            className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-700/60 bg-slate-900/95 backdrop-blur-xl"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
            <ul className="mx-auto flex h-[3.75rem] max-w-lg">
                {TABS.map((tab) => {
                    const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
                    return (
                        <li key={tab.href} className="flex-1">
                            <Link
                                href={tab.href}
                                aria-current={active ? "page" : undefined}
                                className={`flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition-colors ${active ? "text-sky-400" : "text-slate-500 active:text-slate-300"
                                    }`}
                            >
                                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={active ? 2.2 : 1.7} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
                                </svg>
                                {tab.label}
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
