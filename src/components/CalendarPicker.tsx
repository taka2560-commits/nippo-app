"use client";

import { useState, useMemo } from "react";

interface CalendarPickerProps {
    value: string;
    onChange: (date: string) => void;
    submittedDates: string[];
}

export default function CalendarPicker({
    value,
    onChange,
    submittedDates,
}: CalendarPickerProps) {
    const selectedDate = value ? new Date(value + "T00:00:00") : new Date();
    const [viewYear, setViewYear] = useState(selectedDate.getFullYear());
    const [viewMonth, setViewMonth] = useState(selectedDate.getMonth());

    const submittedSet = useMemo(
        () => new Set(submittedDates),
        [submittedDates]
    );

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    const calendarDays = useMemo(() => {
        const firstDay = new Date(viewYear, viewMonth, 1);
        const lastDay = new Date(viewYear, viewMonth + 1, 0);
        const startDayOfWeek = firstDay.getDay();
        const daysInMonth = lastDay.getDate();
        const days: (number | null)[] = [];
        for (let i = 0; i < startDayOfWeek; i++) days.push(null);
        for (let d = 1; d <= daysInMonth; d++) days.push(d);
        return days;
    }, [viewYear, viewMonth]);

    const prevMonth = () => {
        if (viewMonth === 0) { setViewYear(viewYear - 1); setViewMonth(11); }
        else setViewMonth(viewMonth - 1);
    };
    const nextMonth = () => {
        if (viewMonth === 11) { setViewYear(viewYear + 1); setViewMonth(0); }
        else setViewMonth(viewMonth + 1);
    };

    const formatDate = (day: number): string =>
        `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    const weekDays = ["日", "月", "火", "水", "木", "金", "土"];
    const monthNames = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

    return (
        <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-3">
            {/* ヘッダー */}
            <div className="flex items-center justify-between mb-2">
                <button type="button" onClick={prevMonth}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-700/50 active:bg-slate-600/50 transition-colors">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                    </svg>
                </button>
                <h3 className="text-sm font-bold text-white">{viewYear}年 {monthNames[viewMonth]}</h3>
                <button type="button" onClick={nextMonth}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-700/50 active:bg-slate-600/50 transition-colors">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                </button>
            </div>

            {/* 曜日 */}
            <div className="grid grid-cols-7 gap-0.5 mb-0.5">
                {weekDays.map((day, i) => (
                    <div key={day} className={`text-center text-[10px] font-bold py-0.5 ${i === 0 ? "text-red-400/80" : i === 6 ? "text-blue-400/80" : "text-slate-500"}`}>
                        {day}
                    </div>
                ))}
            </div>

            {/* 日付グリッド */}
            <div className="grid grid-cols-7 gap-0.5">
                {calendarDays.map((day, idx) => {
                    if (day === null) return <div key={`e-${idx}`} className="h-9" />;
                    const dateStr = formatDate(day);
                    const isSelected = dateStr === value;
                    const isToday = dateStr === todayStr;
                    const isSubmitted = submittedSet.has(dateStr);
                    const dow = idx % 7;

                    return (
                        <button key={dateStr} type="button" onClick={() => onChange(dateStr)}
                            className={`relative h-9 rounded-lg text-xs font-medium transition-all duration-100 active:scale-95
                                ${isSelected
                                    ? "bg-sky-500 text-white shadow-md shadow-sky-500/30 scale-105 z-10 font-bold"
                                    : isSubmitted
                                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                                        : isToday
                                            ? "bg-slate-700/40 text-white border border-slate-500/40"
                                            : dow === 0 ? "text-red-400/70 active:bg-slate-700/30"
                                                : dow === 6 ? "text-blue-400/70 active:bg-slate-700/30"
                                                    : "text-slate-300 active:bg-slate-700/30"
                                }`}>
                            {day}
                            {isSubmitted && !isSelected && (
                                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-emerald-400" />
                            )}
                        </button>
                    );
                })}
            </div>

            {/* 凡例 */}
            <div className="mt-2 flex items-center justify-center gap-3 text-[10px] text-slate-500">
                <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-sm bg-emerald-500/30 border border-emerald-500/50" />入力済
                </span>
                <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-sm bg-sky-500" />選択中
                </span>
                <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-sm bg-slate-700/50 border border-slate-500/50" />今日
                </span>
            </div>
        </div>
    );
}
