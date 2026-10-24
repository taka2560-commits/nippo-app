"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { prepareScheduleImage } from "@/lib/image-prep";
import {
    OFFICE_GROUP,
    buildSchedulePlan,
    parseScheduleDays,
    resolveBoardDate,
    type ScheduleDay,
    type SchedulePlan,
} from "@/lib/schedule";
import type { StorageSettings } from "@/lib/storage";
import { formatShortDate } from "@/lib/dates";

// 入力欄に反映する内容
export interface ScheduleApply {
    date: string;
    siteValue: string; // "グループ - 現場"
    newSite?: { group: string; site: string }; // 名簿にない現場（追加が必要）
    workerNames: string[]; // 入力する作業者
    newWorkers: string[]; // 名簿に追加する名前
    content: string;
}

interface Props {
    anchorDate: string;
    options: StorageSettings;
    // true を返すと閉じる（上書きの確認でやめたときは false）
    onApply: (data: ScheduleApply) => boolean;
}

const LABEL_KEY = "nippo_schedule_label";
const PASSCODE_KEY = "nippo_schedule_passcode"; // 合言葉。この端末にだけ保存し、バックアップには含めない
const NEW_SITE = "__new__";

const read = (key: string): string => {
    try {
        return localStorage.getItem(key) ?? "";
    } catch {
        return "";
    }
};
const write = (key: string, value: string) => {
    try {
        if (value) localStorage.setItem(key, value);
        else localStorage.removeItem(key);
    } catch {
        // 保存できなくても、入力そのものは続けられる
    }
};

const surnameOf = (fullName: string) => fullName.trim().split(/[\s　]+/)[0] ?? "";
const STATUS_LABEL: Record<ScheduleDay["status"], string> = {
    site: "現場",
    office: "事務所（図面作成）",
    off: "休み",
    not_found: "予定表に見つかりません",
};

export default function ScheduleImport({ anchorDate, options, onApply }: Props) {
    const [open, setOpen] = useState(false);
    const [enabled, setEnabled] = useState<boolean | null>(null);
    const [label, setLabel] = useState("");
    const [passcode, setPasscode] = useState("");
    const [phase, setPhase] = useState<"idle" | "reading" | "done">("idle");
    const [error, setError] = useState("");
    const [days, setDays] = useState<ScheduleDay[]>([]);
    // 日ごとの選び直し：現場の選択、名簿に入れない名前
    const [siteChoice, setSiteChoice] = useState<Record<number, string>>({});
    const [skipped, setSkipped] = useState<Record<string, boolean>>({});
    const fileRef = useRef<HTMLInputElement>(null);

    const openSheet = () => {
        setOpen(true);
        setError("");
        setLabel(read(LABEL_KEY) || surnameOf(options.reporterName));
        setPasscode(read(PASSCODE_KEY));
        if (enabled === null) {
            fetch("/api/schedule")
                .then((r) => r.json())
                .then((j) => setEnabled(!!j.enabled))
                .catch(() => setEnabled(false));
        }
    };

    // ESC・外側のタップで閉じられるように
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open]);

    const siteList = useMemo(
        () => options.workSiteGroups.flatMap((g) => g.sites.map((s) => ({ value: `${g.group} - ${s}`, label: `${g.group} - ${s}` }))),
        [options.workSiteGroups]
    );

    const plans: (SchedulePlan | null)[] = useMemo(
        () =>
            days.map((d) => {
                const date = resolveBoardDate(d.day, d.weekday, anchorDate);
                return date ? buildSchedulePlan(d, date, options.workerNames, options.workSiteGroups, label) : null;
            }),
        [days, anchorDate, options.workerNames, options.workSiteGroups, label]
    );

    const choose = async (file: File | undefined) => {
        if (!file) return;
        setError("");
        if (!label.trim()) return setError("予定表に書かれている自分の名前を入力してください。");
        if (!passcode.trim()) return setError("合言葉を入力してください。");
        if (!navigator.onLine) return setError("オフラインでは読み取れません。電波のあるところでお試しください。");

        setPhase("reading");
        setDays([]);
        setSiteChoice({});
        setSkipped({});
        write(LABEL_KEY, label.trim());
        write(PASSCODE_KEY, passcode.trim());
        try {
            const blob = await prepareScheduleImage(file);
            const targetNames = Array.from(new Set([label.trim(), ...options.reporterName.split(/[\s　]+/).filter(Boolean)]));
            const form = new FormData();
            form.set("image", blob, "board.jpg");
            form.set(
                "meta",
                JSON.stringify({
                    targetNames,
                    knownNames: options.workerNames,
                    knownSites: options.workSiteGroups.flatMap((g) => g.sites),
                })
            );
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 90_000);
            let res: Response;
            try {
                res = await fetch("/api/schedule", {
                    method: "POST",
                    headers: { "x-schedule-passcode": encodeURIComponent(passcode.trim()) },
                    body: form,
                    signal: controller.signal,
                });
            } finally {
                clearTimeout(timer);
            }
            const body = await res.json().catch(() => ({}));
            if (res.status === 401) write(PASSCODE_KEY, "");
            if (!res.ok) throw new Error(typeof body.message === "string" ? body.message : "読み取りに失敗しました。");
            const parsed = parseScheduleDays(body);
            if (parsed.length === 0) throw new Error("予定表から日付を読み取れませんでした。写真を撮り直してみてください。");
            setDays(parsed);
            setPhase("done");
        } catch (e) {
            setPhase("idle");
            setError(
                e instanceof DOMException && e.name === "AbortError"
                    ? "読み取りに時間がかかりすぎました。もう一度お試しください。"
                    : e instanceof Error
                      ? e.message
                      : "読み取りに失敗しました。"
            );
        } finally {
            if (fileRef.current) fileRef.current.value = "";
        }
    };

    const applyDay = (i: number) => {
        const plan = plans[i];
        if (!plan) return;
        const choice = siteChoice[i] ?? plan.site?.value ?? (plan.day.status === "office" ? NEW_SITE : "");
        if (!choice) return;
        const isNew = choice === NEW_SITE;
        const siteName = plan.siteLabel;
        const included = plan.members.filter((m) => !skipped[`${i}:${m.board}`]);
        const workerNames: string[] = [];
        const newWorkers: string[] = [];
        for (const m of included) {
            if (m.matched) workerNames.push(m.matched);
            else if (!m.ambiguous) {
                workerNames.push(m.board);
                newWorkers.push(m.board);
            }
        }
        const closed = onApply({
            date: plan.date,
            siteValue: isNew ? `${OFFICE_GROUP} - ${siteName}` : choice,
            newSite: isNew ? { group: OFFICE_GROUP, site: siteName } : undefined,
            workerNames: Array.from(new Set(workerNames)),
            newWorkers: Array.from(new Set(newWorkers)),
            content: plan.content,
        });
        if (closed) setOpen(false);
    };

    return (
        <>
            <button
                type="button"
                onClick={openSheet}
                className="flex w-full items-center gap-2 rounded-xl border border-violet-500/40 bg-violet-500/10 px-3 py-2.5 text-left text-xs text-violet-200 active:bg-violet-500/20 transition-colors"
            >
                <span className="text-base">📷</span>
                <span className="min-w-0 flex-1">
                    <span className="block font-bold">予定表の写真から入力</span>
                    <span className="block text-violet-300/80">現場・一緒に作業する人・人数を読み取って入れます</span>
                </span>
            </button>

            {open && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)}>
                    <div
                        role="dialog"
                        aria-label="予定表の写真から入力"
                        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-slate-700 bg-slate-900 p-5 pb-8 shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="mb-3 flex items-center justify-between">
                            <h2 className="text-base font-bold text-white">📷 予定表の写真から入力</h2>
                            <button type="button" onClick={() => setOpen(false)} aria-label="閉じる" className="rounded-full p-1 text-slate-400 active:bg-slate-700">
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {enabled === false ? (
                            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
                                この機能はまだ設定されていません。管理者が、公開先（Vercel）に <code>ANTHROPIC_API_KEY</code> と{" "}
                                <code>SCHEDULE_PASSCODE</code> を設定すると使えるようになります（手順は README を参照）。
                            </div>
                        ) : (
                            <>
                                <p className="mb-3 text-[11px] leading-relaxed text-slate-400">
                                    前日に届く予定表の写真を選ぶと、自分の名前がある場所から、現場・同じ現場の人・人数を読み取ります。
                                    枠の外にあれば事務所（図面作成）、一番下の行は休みとして扱います。
                                    <span className="text-slate-500"> 写真は読み取りのため AI サービス（Anthropic）に送信されます。</span>
                                </p>

                                <div className="mb-3 grid grid-cols-2 gap-3">
                                    <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-400">
                                        予定表に書かれている自分の名前
                                        <input
                                            type="text"
                                            value={label}
                                            onChange={(e) => setLabel(e.target.value)}
                                            placeholder="例：山田"
                                            className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none"
                                        />
                                    </label>
                                    <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-400">
                                        合言葉
                                        <input
                                            type="password"
                                            value={passcode}
                                            onChange={(e) => setPasscode(e.target.value)}
                                            placeholder="管理者から聞いたもの"
                                            autoComplete="off"
                                            className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none"
                                        />
                                    </label>
                                </div>

                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    data-testid="schedule-file"
                                    onChange={(e) => choose(e.target.files?.[0])}
                                />
                                <button
                                    type="button"
                                    disabled={phase === "reading" || enabled === null}
                                    onClick={() => fileRef.current?.click()}
                                    className="w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-bold text-white active:bg-violet-700 disabled:opacity-50"
                                >
                                    {phase === "reading" ? "読み取り中…（20〜40秒ほどかかります）" : phase === "done" ? "別の写真を選ぶ" : "写真を選ぶ・撮る"}
                                </button>
                            </>
                        )}

                        {error && <p className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-xs leading-relaxed text-red-300">{error}</p>}

                        {phase === "done" && (
                            <div className="mt-4 space-y-3">
                                <p className="text-[11px] leading-relaxed text-amber-300">
                                    ※ 読み取りは間違えることがあります。現場と人員を確認してから「この日を入力する」を押してください（押しただけでは保存されません）。
                                </p>
                                {days.map((d, i) => {
                                    const plan = plans[i];
                                    if (!plan) return null;
                                    const isTarget = plan.date === anchorDate;
                                    const choice = siteChoice[i] ?? plan.site?.value ?? (d.status === "office" ? NEW_SITE : "");
                                    const canApply = (d.status === "site" || d.status === "office") && !!choice;
                                    return (
                                        <div
                                            key={`${d.day}-${i}`}
                                            className={`rounded-2xl border p-3 ${isTarget ? "border-violet-400/60 bg-violet-500/10" : "border-slate-700 bg-slate-800/50"}`}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-sm font-bold text-white">
                                                    {formatShortDate(plan.date)}
                                                    {isTarget && <span className="ml-2 rounded-full bg-violet-500/30 px-2 py-0.5 text-[10px] text-violet-200">表示中の日</span>}
                                                </span>
                                                <span className={`text-xs font-semibold ${d.status === "site" || d.status === "office" ? "text-sky-300" : "text-slate-400"}`}>
                                                    {STATUS_LABEL[d.status]}
                                                    {d.confidence === "low" && <span className="ml-1 text-amber-300">（要確認）</span>}
                                                </span>
                                            </div>

                                            {(d.status === "site" || d.status === "office") && (
                                                <div className="mt-2 space-y-2">
                                                    <label className="flex flex-col gap-1 text-[11px] text-slate-400">
                                                        現場{d.status === "site" && <span className="text-slate-500">（予定表の字：{d.site || "読めません"}）</span>}
                                                        <select
                                                            value={choice}
                                                            onChange={(e) => setSiteChoice({ ...siteChoice, [i]: e.target.value })}
                                                            className="rounded-lg border border-slate-600 bg-slate-800 px-2 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
                                                        >
                                                            <option value="" disabled>現場を選んでください</option>
                                                            {siteList.map((s) => (
                                                                <option key={s.value} value={s.value}>{s.label}</option>
                                                            ))}
                                                            {plan.siteLabel && !plan.site && (
                                                                <option value={NEW_SITE}>＋「{plan.siteLabel}」を新しい現場として登録</option>
                                                            )}
                                                        </select>
                                                    </label>

                                                    {plan.members.length > 0 && (
                                                        <div>
                                                            <p className="mb-1 text-[11px] text-slate-400">
                                                                一緒に作業する人（{plan.members.filter((m) => !skipped[`${i}:${m.board}`] && !m.ambiguous).length}人）
                                                            </p>
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {plan.members.map((m) => {
                                                                    const off = !!skipped[`${i}:${m.board}`];
                                                                    return (
                                                                        <button
                                                                            key={m.board}
                                                                            type="button"
                                                                            onClick={() => setSkipped({ ...skipped, [`${i}:${m.board}`]: !off })}
                                                                            aria-pressed={!off}
                                                                            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${off
                                                                                ? "border-slate-600 text-slate-500 line-through"
                                                                                : m.matched
                                                                                    ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-200"
                                                                                    : "border-amber-500/50 bg-amber-500/10 text-amber-200"
                                                                                }`}
                                                                        >
                                                                            {m.matched ?? m.board}
                                                                            {m.isSelf && <span className="ml-1 font-normal opacity-70">（自分）</span>}
                                                                            {!m.matched && !m.ambiguous && <span className="ml-1 font-normal opacity-80">名簿にない→追加</span>}
                                                                            {m.ambiguous && <span className="ml-1 font-normal opacity-80">同名が複数→外す</span>}
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {d.note && <p className="text-[11px] text-slate-500">メモ：{d.note}</p>}
                                                    <button
                                                        type="button"
                                                        disabled={!canApply}
                                                        onClick={() => applyDay(i)}
                                                        className="w-full rounded-xl bg-sky-600 px-3 py-2.5 text-sm font-bold text-white active:bg-sky-700 disabled:opacity-40"
                                                    >
                                                        この日を入力する
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
