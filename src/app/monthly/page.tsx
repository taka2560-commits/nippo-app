"use client";

import { ExportControl } from "@/components/ExportControl";

export default function MonthlyPage() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100">
            <header className="sticky top-0 z-10 border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-xl">
                <div className="mx-auto max-w-lg px-4 py-3">
                    <h1 className="text-base font-bold text-white">月報</h1>
                    <p className="text-[11px] text-slate-400">月度を選んで Excel / PDF に出力できます</p>
                </div>
            </header>
            <main className="mx-auto max-w-lg px-4 py-4">
                <ExportControl />
            </main>
        </div>
    );
}
