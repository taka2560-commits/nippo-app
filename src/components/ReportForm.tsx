"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import MultiSelectField from "./MultiSelectField";
import GroupedSelectField from "./GroupedSelectField";
import WorkEntryRow from "./WorkEntryRow";
import SuccessOverlay from "./SuccessOverlay";
import CalendarPicker from "./CalendarPicker";
import VoiceInputButton from "./VoiceInputButton";
import { addDays, isWeekend, formatShortDate, getMissingWeekdays, todayStr, toDateStr } from "@/lib/dates";
import {
    getSettings,
    saveSettings,
    saveReport,
    getReportByDate,
    deleteReport,
    getReports,
    getDraft,
    saveDraft,
    clearDraft,
    sortByUsage,
    getBackupReminder,
    snoozeBackupReminder,
    SiteGroup,
    StorageSettings,
    StoredReport,
    WorkPreset,
    WorkEntry as StorageWorkEntry,
    MaterialItem as StorageMaterialItem,
} from "@/lib/storage";



interface Options {
    workerNames: string[];
    workSiteGroups: SiteGroup[];
    workContents: string[];
    manDayOptions: string[];
    overtimeOptions: string[];
    earlyStartOptions: string[];
    overtimeHoursOptions: string[];
    locationOptions: string[];
    materialOptions: string[];
    presets: WorkPreset[];
}

// まとめて登録できる最大日数
const MAX_BULK_DAYS = 31;

// 何も入力していない状態のフォーム内容（下書きを残すかどうかの判定の基準）
const EMPTY_SIG = JSON.stringify([[], "", "0", "0", [["", "", "", "0"]], [], ""]);

interface MaterialEntry {
    id: number;
    name: string;
    quantity: string;
}

interface WorkEntry {
    id: number;
    location: string;
    content: string;
    manDays: string;
    overtime: string;
}

type FormStatus = "idle" | "submitting" | "success" | "error";

let entryIdCounter = 1;
let materialIdCounter = 1;

export default function ReportForm() {
    // 選択肢
    const [options, setOptions] = useState<Options | null>(null);

    // フォーム値
    const [reportDate, setReportDate] = useState(() => todayStr());
    const [workerNames, setWorkerNames] = useState<string[]>([]);
    const [workSite, setWorkSite] = useState("");
    const [earlyStart, setEarlyStart] = useState("0");
    const [overtimeHours, setOvertimeHours] = useState("0");
    const [workEntries, setWorkEntries] = useState<WorkEntry[]>([
        { id: entryIdCounter++, location: "", content: "", manDays: "", overtime: "0" },
    ]);
    const [materials, setMaterials] = useState<MaterialEntry[]>([]);
    const [remarks, setRemarks] = useState("");

    // 送信状態
    const [status, setStatus] = useState<FormStatus>("idle");
    const [errorMessage, setErrorMessage] = useState("");

    // 日報読み込み状態
    const [isLoading, setIsLoading] = useState(false);
    const [isExistingReport, setIsExistingReport] = useState(false);
    const [copiedFromDate, setCopiedFromDate] = useState<string | null>(null);

    // 複数日にまとめて登録
    const [bulkEnabled, setBulkEnabled] = useState(false);
    const [bulkEndDate, setBulkEndDate] = useState("");
    const [bulkSkipWeekends, setBulkSkipWeekends] = useState(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [lastSavedDate, setLastSavedDate] = useState<string | null>(null);

    // 下書き・バックアップの促し
    const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
    const [backupReminder, setBackupReminder] = useState({ show: false, daysSince: 0, neverBackedUp: false });
    // 「保存済みの状態」と比べて変更があるときだけ下書きを残す
    const baselineSig = useRef(EMPTY_SIG);
    const resyncBaseline = useRef(false); // true の間は、次に描画された内容を「保存済みの状態」とみなす

    // 入力済み日付一覧
    const [submittedDates, setSubmittedDates] = useState<string[]>([]);

    // 削除確認ダイアログ
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // 人工の合計計算
    const totalManDays = workEntries.reduce(
        (sum, e) => sum + (e.manDays ? parseFloat(e.manDays) : 0),
        0
    );
    const manDayLimit = workerNames.length;
    const isManDayOver = manDayLimit > 0 && totalManDays > manDayLimit;
    const isManDayUnder = manDayLimit > 0 && totalManDays > 0 && totalManDays < manDayLimit;

    // 全項目が選択済みか判定
    const isComplete =
        workerNames.length > 0 &&
        workSite &&
        workEntries.length > 0 &&
        workEntries.every((e) => e.content && e.manDays);

    // 未入力項目（送信ボタンを押したときに各欄の下へ表示）
    const [showErrors, setShowErrors] = useState(false);
    const [showBulkConfirm, setShowBulkConfirm] = useState(false);
    const entryErrors = workEntries.map((e) =>
        [!e.content && "作業内容", !e.manDays && "人工"].filter(Boolean).join("・")
    );
    const missingCount =
        (workerNames.length === 0 ? 1 : 0) + (workSite ? 0 : 1) + entryErrors.filter(Boolean).length;

    // 入力内容の署名（下書きを残すかどうかの判定用）
    const formSig = JSON.stringify([
        workerNames,
        workSite,
        earlyStart,
        overtimeHours,
        workEntries.map((e) => [e.location, e.content, e.manDays, e.overtime]),
        materials.map((m) => [m.name, m.quantity]),
        remarks,
    ]);

    // 入力のたびに下書きを自動保存（保存済みと同じ内容に戻ったら下書きは消す）
    useEffect(() => {
        if (!options) return;
        if (resyncBaseline.current) {
            baselineSig.current = formSig;
            resyncBaseline.current = false;
            return;
        }
        if (status === "success" || status === "submitting") return;
        if (formSig === baselineSig.current) {
            clearDraft(reportDate);
            return;
        }
        saveDraft({
            reportDate,
            workerNames,
            workSite,
            earlyStart,
            overtimeHours,
            workEntries: workEntries.map((e) => ({
                location: e.location,
                content: e.content,
                manDays: e.manDays,
                overtime: e.overtime,
            })),
            materials: materials.map((m) => ({ name: m.name, quantity: m.quantity })),
            remarks,
            savedAt: new Date().toISOString(),
        });
    }, [formSig, reportDate, options, status]); // eslint-disable-line react-hooks/exhaustive-deps

    // 入力済み日付一覧を取得
    const fetchSubmittedDates = useCallback(async () => {
        try {
            const reports = getReports();
            const dates = reports.map((r) => r.reportDate);
            setSubmittedDates(dates);
        } catch {
            // 取得失敗時は空のまま
        }
    }, []);

    // 下書きをフォームに反映
    const applyDraft = useCallback((draft: NonNullable<ReturnType<typeof getDraft>>) => {
        setReportDate(draft.reportDate);
        setWorkerNames(draft.workerNames);
        setWorkSite(draft.workSite);
        setEarlyStart(draft.earlyStart || "0");
        setOvertimeHours(draft.overtimeHours || "0");
        const entries = draft.workEntries.map((e) => ({
            id: entryIdCounter++,
            location: e.location ?? "",
            content: e.content ?? "",
            manDays: e.manDays ?? "",
            overtime: e.overtime ?? "0",
        }));
        setWorkEntries(
            entries.length > 0
                ? entries
                : [{ id: entryIdCounter++, location: "", content: "", manDays: "", overtime: "0" }]
        );
        setMaterials(
            draft.materials.map((m) => ({ id: materialIdCounter++, name: m.name ?? "", quantity: m.quantity ?? "1" }))
        );
        setRemarks(draft.remarks ?? "");
        setIsExistingReport(!!getReportByDate(draft.reportDate));
        setDraftSavedAt(draft.savedAt);
        baselineSig.current = EMPTY_SIG; // 下書きは「変更あり」として残す
        resyncBaseline.current = false;
    }, []);

    // 初回表示：選択肢・入力済み日付を読み込み、?date= の指定や書きかけの下書きがあれば開く
    useEffect(() => {
        setOptions(getSettings());
        fetchSubmittedDates();
        setBackupReminder(getBackupReminder());

        const dateParam = new URLSearchParams(window.location.search).get("date");
        const targetDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null;
        // 日付の指定があればその日の下書き、なければ最後に書いた下書き
        const draft = getDraft(targetDate ?? undefined);
        if (draft) {
            applyDraft(draft);
        } else {
            const date = targetDate ?? todayStr();
            setReportDate(date);
            loadReportByDate(date);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fetchSubmittedDates, applyDraft]);

    // 保存済み日報の内容をフォームに反映（再編集・前回コピーで共用）
    const fillFormFromReport = useCallback((report: StoredReport, includeRemarks: boolean) => {
        // 設定（選択肢）を取得して、保存された数値と一致する文字列表現を探す
        const settings = getSettings();
        const findOption = (val: number, options: string[]) => {
            const s = String(val);
            if (options.includes(s)) return s;
            const f1 = val.toFixed(1);
            if (options.includes(f1)) return f1;
            return s;
        };

        setWorkerNames(report.workerNames || []);
        setWorkSite(report.workSite || "");
        setEarlyStart(report.earlyStart || "0");
        setOvertimeHours(report.overtimeHours || "0");
        const entries = (report.workEntries || []).map((e) => ({
            id: entryIdCounter++,
            location: e.location || "",
            content: e.content,
            manDays: findOption(e.manDays, settings.manDayOptions),
            overtime: findOption(e.overtime || 0, settings.overtimeOptions),
        }));
        setWorkEntries(
            entries.length > 0
                ? entries
                : [{ id: entryIdCounter++, location: "", content: "", manDays: "", overtime: "0" }]
        );
        setMaterials(
            (report.materials || []).map((m) => ({
                id: materialIdCounter++,
                name: m.name,
                quantity: String(m.quantity),
            }))
        );
        setRemarks(includeRemarks ? report.remarks || "" : "");
    }, []);

    // 日付変更時に既存日報を読み込み
    const loadReportByDate = useCallback(async (date: string) => {
        setIsLoading(true);
        setIsExistingReport(false);
        setCopiedFromDate(null);
        setDraftSavedAt(null);
        try {
            // その日の書きかけがあれば、保存済みの内容より優先して開く
            const draft = getDraft(date);
            if (draft) {
                applyDraft(draft);
                return;
            }
            resyncBaseline.current = true;
            const report = getReportByDate(date);

            if (report) {
                fillFormFromReport(report, true);
                setIsExistingReport(true);
            } else {
                // 既存データなし → フォームリセット（日付はそのまま）
                setWorkerNames([]);
                setWorkSite("");
                setEarlyStart("0");
                setOvertimeHours("0");
                setWorkEntries([
                    { id: entryIdCounter++, location: "", content: "", manDays: "", overtime: "0" },
                ]);
                setMaterials([]);
                setRemarks("");
                setIsExistingReport(false);
            }
        } catch {
            // エラー時は何もしない
        } finally {
            setIsLoading(false);
        }
    }, [fillFormFromReport, applyDraft]);

    // 下書きを捨てて、保存済みの内容（なければ空）に戻す
    const discardDraft = () => {
        clearDraft(reportDate);
        loadReportByDate(reportDate);
        // loadReportByDate は下書きを先に探すので、消してから呼ぶ
    };

    // 選択中の日付より前で、いちばん新しい日報（連続する現場のコピー元）
    const previousReport = useMemo(() => {
        const prevDate = submittedDates
            .filter((d) => d < reportDate)
            .sort()
            .pop();
        return prevDate ? getReportByDate(prevDate) : undefined;
    }, [submittedDates, reportDate]);

    // 前回の日報をコピー（備考は日ごとに違うためコピーしない）
    const copyPreviousReport = () => {
        if (!previousReport) return;
        const hasInput =
            workerNames.length > 0 ||
            workSite !== "" ||
            workEntries.some((e) => e.content || e.location || e.manDays) ||
            materials.length > 0 ||
            remarks !== "";
        if (hasInput && !confirm("入力中の内容を前回の日報で置き換えますか？")) return;
        fillFormFromReport(previousReport, false);
        setCopiedFromDate(previousReport.reportDate);
    };

    // まとめて登録の対象日（選択日の翌日〜終了日）。入力済みの日は上書きせずスキップ
    const bulkPlan = useMemo(() => {
        const targets: string[] = [];
        const skipped: string[] = [];
        let tooLong = false;
        if (bulkEnabled && bulkEndDate > reportDate) {
            for (let i = 1, d = addDays(reportDate, 1); d <= bulkEndDate; i++, d = addDays(reportDate, i)) {
                if (i > MAX_BULK_DAYS) {
                    tooLong = true;
                    break;
                }
                if (bulkSkipWeekends && isWeekend(d)) continue;
                if (submittedDates.includes(d)) skipped.push(d);
                else targets.push(d);
            }
        }
        // 上限を超える指定は途中までの登録もしない
        return tooLong ? { targets: [], skipped: [], tooLong } : { targets, skipped, tooLong };
    }, [bulkEnabled, bulkEndDate, bulkSkipWeekends, reportDate, submittedDates]);

    // 作業内容・場所・材料の候補は、よく使うものを上にする
    const sortedOptions = useMemo(() => {
        if (!options) return null;
        const reports = getReports();
        return {
            workContents: sortByUsage(options.workContents, reports.flatMap((r) => r.workEntries.map((e) => e.content))),
            locationOptions: sortByUsage(
                options.locationOptions || [],
                reports.flatMap((r) => r.workEntries.map((e) => e.location).filter(Boolean))
            ),
            materialOptions: sortByUsage(options.materialOptions, reports.flatMap((r) => r.materials.map((m) => m.name))),
        };
    // submittedDates は保存のたびに更新される（使用回数の再計算のきっかけ）
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [options, submittedDates]);

    // 選択中の月の、入力していない平日
    const missingThisMonth = useMemo(() => {
        const [y, m] = reportDate.split("-").map(Number);
        const from = toDateStr(new Date(y, m - 1, 1));
        const to = toDateStr(new Date(y, m, 0));
        return getMissingWeekdays(from, to, submittedDates);
    }, [reportDate, submittedDates]);

    const toggleBulk = (enabled: boolean) => {
        setBulkEnabled(enabled);
        if (enabled && !(bulkEndDate > reportDate)) setBulkEndDate(addDays(reportDate, 1));
    };

    // よく使う組み合わせ
    const savePresets = (presets: WorkPreset[]) => {
        const updated = { ...getSettings(), presets };
        saveSettings(updated);
        setOptions(updated);
    };

    // 作業者を変えたとき、作業が1行だけで人工が未入力（または前回の自動入力のまま）なら、人数ぶんの人工を自動で入れる
    const handleWorkersChange = (names: string[]) => {
        const toManDays = (n: number) => (n > 0 ? n.toFixed(1) : "");
        const prevAuto = toManDays(workerNames.length);
        const next = toManDays(names.length);
        setWorkerNames(names);
        if (!options || workEntries.length !== 1) return;
        const current = workEntries[0].manDays;
        if (current !== "" && current !== prevAuto) return; // 手で選んだ人工は上書きしない
        const value = options.manDayOptions.includes(next) ? next : "";
        if (value !== current) {
            setWorkEntries([{ ...workEntries[0], manDays: value }]);
        }
    };

    const applyPreset = (preset: WorkPreset) => {
        handleWorkersChange(preset.workerNames);
        setWorkSite(preset.workSite);
    };

    const addPreset = () => {
        if (!options || workerNames.length === 0 || !workSite) return;
        const name = prompt("この組み合わせの名前を入力してください", workSite)?.trim();
        if (!name) return;
        const exists = options.presets.some((p) => p.name === name);
        if (exists && !confirm(`「${name}」はすでにあります。今の作業者・現場で上書きしますか？`)) return;
        const preset: WorkPreset = { name, workerNames: [...workerNames], workSite };
        savePresets(
            exists
                ? options.presets.map((p) => (p.name === name ? preset : p))
                : [...options.presets, preset]
        );
    };

    const isPresetActive = (preset: WorkPreset) =>
        preset.workSite === workSite &&
        preset.workerNames.length === workerNames.length &&
        preset.workerNames.every((n) => workerNames.includes(n));

    // 日付変更ハンドラ
    const handleDateChange = (newDate: string) => {
        setReportDate(newDate);
        setStatus("idle");
        setErrorMessage("");
        setShowErrors(false);
        loadReportByDate(newDate);
    };

    // 作業行の追加
    const addWorkEntry = () => {
        setWorkEntries([
            ...workEntries,
            { id: entryIdCounter++, location: "", content: "", manDays: "", overtime: "0" },
        ]);
    };

    // 作業行の削除
    const removeWorkEntry = (id: number) => {
        setWorkEntries(workEntries.filter((e) => e.id !== id));
    };

    // 作業行の更新
    const updateWorkEntry = (
        id: number,
        field: keyof Omit<WorkEntry, "id">,
        value: string
    ) => {
        setWorkEntries(
            workEntries.map((e) => (e.id === id ? { ...e, [field]: value } : e))
        );
    };

    // 材料の追加
    const addMaterial = () => {
        setMaterials([
            ...materials,
            { id: materialIdCounter++, name: "", quantity: "1" },
        ]);
    };

    // 材料の削除
    const removeMaterial = (id: number) => {
        setMaterials(materials.filter((m) => m.id !== id));
    };

    // 材料の更新
    const updateMaterial = (
        id: number,
        field: keyof Omit<MaterialEntry, "id">,
        value: string
    ) => {
        setMaterials(
            materials.map((m) => (m.id === id ? { ...m, [field]: value } : m))
        );
    };

    // 送信ボタン：未入力があれば該当欄へ移動、まとめて登録なら確認画面を挟む
    const handleSubmitClick = () => {
        if (status === "submitting") return;
        if (!isComplete) {
            setShowErrors(true);
            const firstId = workerNames.length === 0 ? "field-workers" : !workSite ? "field-site" : "field-entries";
            document.getElementById(firstId)?.scrollIntoView({ behavior: "smooth", block: "center" });
            return;
        }
        if (bulkPlan.targets.length > 0) {
            setShowBulkConfirm(true);
            return;
        }
        handleSubmit();
    };

    // 送信処理
    const handleSubmit = async () => {
        if (!isComplete || status === "submitting") return;

        setStatus("submitting");
        setErrorMessage("");
        setShowBulkConfirm(false);
        setShowErrors(false);

        try {
            const reportData: StoredReport = {
                reportDate,
                workerNames,
                workSite,
                earlyStart,
                overtimeHours,
                workEntries: workEntries.map((e) => ({
                    location: e.location,
                    content: e.content,
                    manDays: parseFloat(e.manDays),
                    overtime: parseFloat(e.overtime || "0"),
                })),
                materials: materials
                    .filter((m) => m.name)
                    .map((m) => ({
                        name: m.name,
                        quantity: parseInt(m.quantity || "1"),
                    })),
                remarks,
                submittedAt: new Date().toISOString(),
            };

            saveReport(reportData);

            // 同じ内容をほかの日にも登録（入力済みの日は対象外）
            for (const date of bulkPlan.targets) {
                saveReport({ ...reportData, reportDate: date });
            }
            setSuccessMessage(
                bulkPlan.targets.length > 0 ? `${bulkPlan.targets.length + 1}日分の日報を保存しました` : null
            );
            setLastSavedDate(bulkPlan.targets.length > 0 ? bulkPlan.targets[bulkPlan.targets.length - 1] : reportDate);
            setBulkEnabled(false);

            // 保存できたので下書きは不要（保存した内容を「保存済みの状態」にする）
            clearDraft(reportDate);
            setDraftSavedAt(null);
            resyncBaseline.current = true;

            // --- 手入力された新しい項目を記憶する処理 ---
            if (options) {
                let updatedSettings = { ...options };
                let hasChanges = false;

                // 新しい作業内容
                const newContents = workEntries.map(e => e.content.trim()).filter(Boolean);
                newContents.forEach(content => {
                    if (!updatedSettings.workContents.includes(content)) {
                        updatedSettings.workContents = [...updatedSettings.workContents, content];
                        hasChanges = true;
                    }
                });

                // 新しい場所
                const newLocations = workEntries.map(e => e.location.trim()).filter(Boolean);
                newLocations.forEach(location => {
                    if (!updatedSettings.locationOptions.includes(location)) {
                        updatedSettings.locationOptions = [...updatedSettings.locationOptions, location];
                        hasChanges = true;
                    }
                });

                // 新しい材料
                const newMaterials = materials.map(m => m.name.trim()).filter(Boolean);
                newMaterials.forEach(mat => {
                    if (!updatedSettings.materialOptions.includes(mat)) {
                        updatedSettings.materialOptions = [...updatedSettings.materialOptions, mat];
                        hasChanges = true;
                    }
                });

                if (hasChanges) {
                    saveSettings(updatedSettings); // localStorageに保存
                    setOptions(updatedSettings);   // stateも更新しておく
                }
            }
            // ------------------------------------------------

            setStatus("success");
            // 入力済み日付一覧を更新
            fetchSubmittedDates();
        } catch (err) {
            setStatus("error");
            setErrorMessage(
                err instanceof Error
                    ? err.message
                    : "送信に失敗しました。もう一度お試しください。"
            );
        }
    };

    // 保存完了画面を閉じる：保存した内容を再編集モードで表示したままにする
    const closeSuccess = () => {
        setStatus("idle");
        setSuccessMessage(null);
        setIsExistingReport(true);
        setCopiedFromDate(null);
    };

    // 保存完了画面から翌日へ：翌日に日報があればそれを開き、なければ今保存した内容をコピーして始める
    const goNextDay = () => {
        const base = lastSavedDate ?? reportDate;
        const next = addDays(base, 1);
        const source = getReportByDate(base);
        setStatus("idle");
        setSuccessMessage(null);
        setErrorMessage("");
        setShowErrors(false);
        setBulkEnabled(false);
        setReportDate(next);
        if (getReportByDate(next) || getDraft(next) || !source) {
            loadReportByDate(next);
        } else {
            setDraftSavedAt(null);
            setIsExistingReport(false);
            fillFormFromReport(source, false);
            setCopiedFromDate(source.reportDate);
            baselineSig.current = EMPTY_SIG;
            resyncBaseline.current = false;
        }
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    // 日報削除処理
    const handleDelete = async () => {
        if (!isExistingReport || isDeleting) return;
        setIsDeleting(true);
        try {
            deleteReport(reportDate);
            clearDraft(reportDate);
            setDraftSavedAt(null);
            resyncBaseline.current = true;

            // 削除成功 → フォームリセット & 日付一覧更新
            setWorkerNames([]);
            setWorkSite("");
            setWorkEntries([{ id: entryIdCounter++, location: "", content: "", manDays: "", overtime: "0" }]);
            setMaterials([]);
            setRemarks("");
            setIsExistingReport(false);
            setShowDeleteConfirm(false);
            setStatus("idle");
            setErrorMessage("");
            fetchSubmittedDates();
        } catch (err) {
            setErrorMessage(
                err instanceof Error ? err.message : "削除に失敗しました。"
            );
            setStatus("error");
        } finally {
            setIsDeleting(false);
            setShowDeleteConfirm(false);
        }
    };

    // 読み込み中
    if (!options) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="h-12 w-12 animate-spin rounded-full border-4 border-sky-500/30 border-t-sky-500" />
                    <p className="text-slate-400">読み込み中...</p>
                </div>
            </div>
        );
    }

    return (
        <>
            {/* 成功オーバーレイ */}
            {status === "success" && (
                <SuccessOverlay
                    onComplete={closeSuccess}
                    onNextDay={goNextDay}
                    nextDayLabel={`${formatShortDate(addDays(lastSavedDate ?? reportDate, 1))}を入力する（内容をコピー）`}
                    message={successMessage ?? (isExistingReport ? "日報を更新しました" : "日報を保存しました")}
                    // Googleカレンダーへの追加は1日分のみ（まとめて登録のときは出さない）
                    reportDate={successMessage ? undefined : reportDate}
                    workSite={workSite}
                    workContents={workEntries.map(e => e.content).filter(Boolean).join("\n")}
                    workerNames={workerNames}
                />
            )}

            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
                {/* まとめて登録の確認画面 */}
                {showBulkConfirm && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
                        <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-2xl border border-teal-500/30 bg-slate-800 p-5 shadow-2xl">
                            <h3 className="mb-3 text-base font-bold text-white">
                                {bulkPlan.targets.length + 1}日分を登録します。よろしいですか？
                            </h3>
                            <dl className="space-y-2 text-sm">
                                <div>
                                    <dt className="text-[11px] text-slate-400">登録する日</dt>
                                    <dd className="font-semibold text-teal-300">
                                        {[reportDate, ...bulkPlan.targets].map(formatShortDate).join("、")}
                                    </dd>
                                </div>
                                {bulkPlan.skipped.length > 0 && (
                                    <div>
                                        <dt className="text-[11px] text-slate-400">入力済みのためスキップ</dt>
                                        <dd className="text-slate-300">{bulkPlan.skipped.map(formatShortDate).join("、")}</dd>
                                    </div>
                                )}
                                <div>
                                    <dt className="text-[11px] text-slate-400">作業者・現場</dt>
                                    <dd className="text-white">{workerNames.join("、")} ／ {workSite}</dd>
                                </div>
                                <div>
                                    <dt className="text-[11px] text-slate-400">作業内容</dt>
                                    <dd className="text-white">
                                        {workEntries.map((e) => `${e.location ? e.location + " " : ""}${e.content}（${e.manDays}人工）`).join("、")}
                                    </dd>
                                </div>
                                {materials.some((m) => m.name) && (
                                    <div>
                                        <dt className="text-[11px] text-slate-400">材料</dt>
                                        <dd className="text-white">
                                            {materials.filter((m) => m.name).map((m) => `${m.name}×${m.quantity}`).join("、")}
                                        </dd>
                                    </div>
                                )}
                            </dl>
                            <div className="mt-5 flex gap-3">
                                <button type="button" onClick={() => setShowBulkConfirm(false)}
                                    className="flex-1 rounded-xl border border-slate-600 py-3 text-sm font-semibold text-slate-300 active:bg-slate-700/50">
                                    戻って直す
                                </button>
                                <button type="button" onClick={handleSubmit}
                                    className="flex-1 rounded-xl bg-teal-500 py-3 text-sm font-bold text-white active:bg-teal-600">
                                    登録する
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* 削除確認ダイアログ */}
                {showDeleteConfirm && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-6">
                        <div className="w-full max-w-sm rounded-2xl border border-red-500/30 bg-slate-800 p-5 shadow-2xl">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/20">
                                    <svg className="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                    </svg>
                                </div>
                                <h3 className="text-base font-bold text-white">日報を削除しますか？</h3>
                            </div>
                            <p className="text-sm text-slate-400 mb-5">
                                {reportDate} の日報を削除します。この操作は取り消せません。
                            </p>
                            <div className="flex gap-3">
                                <button type="button" onClick={() => setShowDeleteConfirm(false)} disabled={isDeleting}
                                    className="flex-1 rounded-xl border border-slate-600 py-3 text-sm font-semibold text-slate-300 active:bg-slate-700/50 transition-colors">
                                    キャンセル
                                </button>
                                <button type="button" onClick={handleDelete} disabled={isDeleting}
                                    className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-bold text-white active:bg-red-600 transition-colors disabled:opacity-50">
                                    {isDeleting ? "削除中..." : "削除する"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ヘッダー */}
                <header className="sticky top-0 z-10 border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-xl">
                    <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 shadow-lg shadow-sky-500/25">
                            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-base font-bold text-white">作業日報入力</h1>
                            <p className={`text-[11px] font-semibold ${isExistingReport ? "text-amber-300" : "text-sky-300"}`}>
                                {formatShortDate(reportDate)} {isExistingReport ? "の日報を編集中" : "の日報を入力中"}
                            </p>
                        </div>
                        <Link href="/settings" className="ml-auto rounded-full bg-slate-800 p-2 text-slate-400 transition-colors hover:bg-slate-700 hover:text-white">
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.332.183-.581.495-.644.869l-.212 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.581-.495.644-.869l.212-1.281z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </Link>
                    </div>
                </header>

                {/* フォーム */}
                <main className="mx-auto max-w-lg px-4 py-4">
                    <div className="space-y-4">
                        {/* バックアップの促し */}
                        {backupReminder.show && (
                            <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-3 text-xs text-sky-100">
                                <p className="font-bold">💾 バックアップを取っておきましょう</p>
                                <p className="mt-0.5 text-sky-200/80">
                                    {backupReminder.neverBackedUp
                                        ? `まだ一度もバックアップしていません（使い始めて${backupReminder.daysSince}日）。`
                                        : `前回のバックアップから${backupReminder.daysSince}日たちました。`}
                                    端末の故障や買い替えに備えて、ファイルに保存できます。
                                </p>
                                <div className="mt-2 flex gap-2">
                                    <Link
                                        href="/settings"
                                        className="rounded-lg bg-sky-500 px-3 py-1.5 font-bold text-white active:bg-sky-600"
                                    >
                                        バックアップする
                                    </Link>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            snoozeBackupReminder(7);
                                            setBackupReminder({ ...backupReminder, show: false });
                                        }}
                                        className="rounded-lg border border-sky-400/40 px-3 py-1.5 font-semibold text-sky-200 active:bg-sky-500/20"
                                    >
                                        あとで（7日間表示しない）
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* 下書きを復元したときの案内 */}
                        {draftSavedAt && (
                            <div className="flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs text-violet-200">
                                <span className="min-w-0 flex-1">
                                    📝 入力途中の内容を復元しました（{new Date(draftSavedAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} に自動保存）
                                </span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (confirm("書きかけの内容を破棄して、保存済みの状態に戻しますか？")) discardDraft();
                                    }}
                                    className="shrink-0 rounded-lg border border-violet-400/40 px-2 py-1 font-semibold active:bg-violet-500/20"
                                >
                                    破棄
                                </button>
                            </div>
                        )}

                        {/* 日付選択カレンダー */}
                        <div className="space-y-1.5">
                            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 uppercase tracking-wider">
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                                </svg>
                                作業日
                            </label>
                            <CalendarPicker
                                key={reportDate.slice(0, 7)}
                                value={reportDate}
                                onChange={handleDateChange}
                                submittedDates={submittedDates}
                            />
                            {isLoading && (
                                <p className="text-[11px] text-sky-400 animate-pulse">📋 日報データを読み込み中...</p>
                            )}
                            {missingThisMonth.length > 0 && !isLoading && (
                                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                                    <p className="text-xs font-bold text-amber-300">
                                        ⚠ この月の未入力の平日：{missingThisMonth.length}日（タップで開く）
                                    </p>
                                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                                        {missingThisMonth.slice(0, 8).map((d) => (
                                            <button
                                                key={d}
                                                type="button"
                                                onClick={() => handleDateChange(d)}
                                                className="rounded-full border border-amber-500/40 bg-slate-900/60 px-2.5 py-1 text-[11px] font-semibold text-amber-200 active:bg-amber-500/20"
                                            >
                                                {formatShortDate(d)}
                                            </button>
                                        ))}
                                        {missingThisMonth.length > 8 && (
                                            <Link href="/history" className="px-1 py-1 text-[11px] text-amber-300 underline">
                                                ほか{missingThisMonth.length - 8}日（履歴で見る）
                                            </Link>
                                        )}
                                    </div>
                                </div>
                            )}
                            {isExistingReport && !isLoading && (
                                <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-300">
                                    <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                    </svg>
                                    再編集モード — 編集後「日報を更新」で保存
                                </div>
                            )}
                            {!isExistingReport && !isLoading && previousReport && (
                                copiedFromDate === previousReport.reportDate ? (
                                    <div className="flex items-center gap-2 rounded-xl bg-teal-500/10 border border-teal-500/30 px-3 py-2 text-xs text-teal-300">
                                        <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                        </svg>
                                        {formatShortDate(previousReport.reportDate)} の内容をコピーしました — 変更があれば直して保存
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={copyPreviousReport}
                                        className="flex w-full items-center gap-2 rounded-xl border border-teal-500/40 bg-teal-500/10 px-3 py-2.5 text-left text-xs text-teal-200 active:bg-teal-500/20 transition-colors"
                                    >
                                        <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                                        </svg>
                                        <span className="min-w-0 flex-1">
                                            <span className="block font-bold">前回の日報をコピー</span>
                                            <span className="block truncate text-teal-300/80">
                                                {formatShortDate(previousReport.reportDate)} {previousReport.workSite}
                                            </span>
                                        </span>
                                    </button>
                                )
                            )}
                        </div>

                        {/* よく使う組み合わせ */}
                        <div className="space-y-1.5">
                            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 uppercase tracking-wider">
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                                </svg>
                                よく使う組み合わせ
                                <span className="ml-auto text-[10px] font-normal text-slate-500 normal-case">タップで作業者・現場を入力</span>
                            </label>
                            <div className="flex items-center gap-2 overflow-x-auto pb-1 noscrollbar">
                                {options.presets.map((preset) => (
                                    <button
                                        key={preset.name}
                                        type="button"
                                        onClick={() => applyPreset(preset)}
                                        className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${isPresetActive(preset)
                                            ? "bg-sky-500 text-white"
                                            : "border border-slate-600 bg-slate-800/60 text-slate-300 active:bg-slate-700"
                                            }`}
                                    >
                                        {preset.name}
                                        <span className="ml-1 font-normal opacity-70">{preset.workerNames.length}名</span>
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    onClick={addPreset}
                                    disabled={workerNames.length === 0 || !workSite}
                                    className="shrink-0 whitespace-nowrap rounded-full border border-dashed border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-400 transition-colors active:text-white disabled:opacity-40"
                                >
                                    ＋今の組み合わせを登録
                                </button>
                            </div>
                            {options.presets.length === 0 && (
                                <p className="text-[11px] text-slate-500">
                                    作業者と現場を選んでから「＋今の組み合わせを登録」を押すと、次回からワンタッチで入力できます。
                                </p>
                            )}
                        </div>

                        {/* 作業者名（複数選択） */}
                        <div id="field-workers" className="space-y-1">
                        <MultiSelectField
                            label="作業者名"
                            options={options.workerNames}
                            selectedValues={workerNames}
                            onChange={handleWorkersChange}
                            icon={
                                <svg
                                    className="h-4 w-4"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    strokeWidth={2}
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
                                    />
                                </svg>
                            }
                        />

                        {showErrors && workerNames.length === 0 && (
                            <p className="text-xs font-semibold text-red-400">⚠ 作業者を1人以上選んでください</p>
                        )}
                        </div>

                        {/* 作業現場（グループ化プルダウン） */}
                        <div id="field-site" className="space-y-1">
                        <GroupedSelectField
                            label="作業現場"
                            value={workSite}
                            groups={options.workSiteGroups}
                            placeholder="現場を選択してください"
                            onChange={setWorkSite}
                            icon={
                                <svg
                                    className="h-4 w-4"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    strokeWidth={2}
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
                                    />
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
                                    />
                                </svg>
                            }
                        />

                        {showErrors && !workSite && (
                            <p className="text-xs font-semibold text-red-400">⚠ 作業現場を選んでください</p>
                        )}
                        </div>

                        {/* 区切り線 */}
                        <div className="border-t border-slate-700/50 pt-2">
                            <div className="flex items-center justify-between">
                                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-300 uppercase tracking-wider">
                                    <svg
                                        className="h-4 w-4"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        strokeWidth={2}
                                        stroke="currentColor"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M11.42 15.17l-5.16-3.08A2.25 2.25 0 004.5 14.2v5.35a2.25 2.25 0 001.76 2.19l5.16 1.29a2.25 2.25 0 001.16 0l5.16-1.29a2.25 2.25 0 001.76-2.19V14.2a2.25 2.25 0 00-1.76-2.11l-5.16-3.08a2.25 2.25 0 00-2.26 0z"
                                        />
                                    </svg>
                                    作業内容
                                </h2>

                                {/* 人工サマリー */}
                                {workerNames.length > 0 && (
                                    <div
                                        className={`rounded-full px-3 py-1 text-xs font-bold ${isManDayOver
                                            ? "bg-red-500/20 text-red-400"
                                            : isManDayUnder
                                                ? "bg-amber-500/20 text-amber-400"
                                                : "bg-sky-500/20 text-sky-400"
                                            }`}
                                    >
                                        人工: {totalManDays.toFixed(2)} / {manDayLimit}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 作業内容行リスト */}
                        <div id="field-entries" className="space-y-3">
                            {workEntries.map((entry, index) => (
                                <div key={entry.id} className="space-y-1">
                                <WorkEntryRow
                                    key={entry.id}
                                    index={index}
                                    location={entry.location}
                                    content={entry.content}
                                    manDays={entry.manDays}
                                    overtime={entry.overtime}
                                    locationOptions={sortedOptions?.locationOptions ?? options.locationOptions ?? []}
                                    contentOptions={sortedOptions?.workContents ?? options.workContents}
                                    manDayOptions={options.manDayOptions}
                                    overtimeOptions={options.overtimeOptions}
                                    onLocationChange={(val) =>
                                        updateWorkEntry(entry.id, "location", val)
                                    }
                                    onContentChange={(val) =>
                                        updateWorkEntry(entry.id, "content", val)
                                    }
                                    onManDaysChange={(val) =>
                                        updateWorkEntry(entry.id, "manDays", val)
                                    }
                                    onOvertimeChange={(val) =>
                                        updateWorkEntry(entry.id, "overtime", val)
                                    }
                                    onRemove={() => removeWorkEntry(entry.id)}
                                    canRemove={workEntries.length > 1}
                                />
                                {showErrors && entryErrors[index] && (
                                    <p className="text-xs font-semibold text-red-400">
                                        ⚠ 作業{index + 1}：{entryErrors[index]}を入力してください
                                    </p>
                                )}
                                </div>
                            ))}
                        </div>

                        {/* 作業追加ボタン */}
                        <button type="button" onClick={addWorkEntry}
                            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-600/50 py-3 text-sm font-semibold text-slate-400 transition-all active:border-sky-500/50 active:text-sky-400 active:bg-sky-500/5">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                            </svg>
                            作業を追加
                        </button>

                        {/* 人工オーバー警告 */}
                        {isManDayOver && (
                            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
                                <div className="flex items-start gap-2">
                                    <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                                    </svg>
                                    <div>
                                        <p className="text-sm font-semibold text-red-300">⚠ 人工オーバー</p>
                                        <p className="text-xs text-red-400">
                                            合計 {totalManDays.toFixed(2)} / 作業者 {manDayLimit}名
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 人工不足警告 */}
                        {isManDayUnder && (
                            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                                <div className="flex items-start gap-2">
                                    <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                                    </svg>
                                    <div>
                                        <p className="text-sm font-semibold text-amber-300">⚠ 人工不足</p>
                                        <p className="text-xs text-amber-400">
                                            合計 {totalManDays.toFixed(2)} / 作業者 {manDayLimit}名
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 早出・残業セクション */}
                        <div className="border-t border-slate-700/50 pt-2 space-y-3">
                            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-300 uppercase tracking-wider">
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                早出・残業
                                <span className="ml-2 text-xs font-normal text-slate-500 normal-case">任意</span>
                            </h2>
                            <div className="grid grid-cols-2 gap-3">
                                {/* 早出 */}
                                <div className="space-y-1">
                                    <label className="text-[11px] text-slate-400">早出（時間）</label>
                                    <select
                                        value={earlyStart}
                                        onChange={(e) => setEarlyStart(e.target.value)}
                                        className="w-full rounded-xl border border-slate-600/50 bg-slate-800/50 px-3 py-2.5 text-sm font-medium text-white transition-all focus:border-sky-500/50 focus:outline-none focus:ring-4 focus:ring-sky-500/20 appearance-none"
                                    >
                                        {(options.earlyStartOptions || ["0", "0.5", "1.0", "1.5", "2.0", "2.5", "3.0"]).map((opt: string) => (
                                            <option key={opt} value={opt}>{opt === "0" ? "なし" : `${opt} 時間`}</option>
                                        ))}
                                    </select>
                                </div>
                                {/* 残業 */}
                                <div className="space-y-1">
                                    <label className="text-[11px] text-slate-400">残業（時間）</label>
                                    <select
                                        value={overtimeHours}
                                        onChange={(e) => setOvertimeHours(e.target.value)}
                                        className="w-full rounded-xl border border-slate-600/50 bg-slate-800/50 px-3 py-2.5 text-sm font-medium text-white transition-all focus:border-sky-500/50 focus:outline-none focus:ring-4 focus:ring-sky-500/20 appearance-none"
                                    >
                                        {(options.overtimeHoursOptions || ["0", "0.5", "1.0", "1.5", "2.0", "2.5", "3.0", "3.5", "4.0", "4.5", "5.0", "5.5", "6.0"]).map((opt: string) => (
                                            <option key={opt} value={opt}>{opt === "0" ? "なし" : `${opt} 時間`}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* 材料・リース */}
                        <div className="border-t border-slate-700/50 pt-2 space-y-3">
                            <div className="flex items-center justify-between">
                                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-300 uppercase tracking-wider">
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                                    </svg>
                                    材料・リース
                                    <span className="ml-2 text-xs font-normal text-slate-500 normal-case">任意</span>
                                </h2>
                            </div>

                            {/* 材料リスト */}
                            {materials.map((mat) => (
                                <div key={mat.id} className="rounded-2xl border-2 border-slate-600/30 bg-slate-800/30 p-3">
                                    <div className="flex items-center gap-2">
                                        <div className="relative flex-1">
                                            <input
                                                type="text"
                                                list={`material-list-${mat.id}`}
                                                value={mat.name}
                                                onChange={(e) => updateMaterial(mat.id, "name", e.target.value)}
                                                placeholder="材料を入力 or 選択"
                                                className={`w-full rounded-xl border-2 px-3 py-2.5 text-base font-medium transition-all duration-200 focus:outline-none focus:ring-4 ${mat.name ? "border-emerald-500/50 bg-emerald-500/10 text-white focus:ring-emerald-500/20" : "border-slate-600/50 bg-slate-800/50 text-slate-400 focus:border-sky-500/50 focus:ring-sky-500/20"}`}
                                            />
                                            <datalist id={`material-list-${mat.id}`}>
                                                {(sortedOptions?.materialOptions ?? options.materialOptions).map((opt) => (
                                                    <option key={opt} value={opt} />
                                                ))}
                                            </datalist>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <span className="text-xs text-slate-400">×</span>
                                            <input
                                                type="number"
                                                min="1"
                                                max="99"
                                                value={mat.quantity}
                                                onChange={(e) => updateMaterial(mat.id, "quantity", e.target.value)}
                                                className="w-16 rounded-xl border-2 border-slate-600/50 bg-slate-800/50 px-2 py-2.5 text-center text-base font-medium text-white transition-all duration-200 focus:border-sky-500/50 focus:outline-none focus:ring-4 focus:ring-sky-500/20"
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => removeMaterial(mat.id)}
                                            className="flex items-center rounded-lg p-1.5 text-red-400 hover:bg-red-500/10 transition-colors"
                                        >
                                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            ))}

                            {/* 材料追加ボタン */}
                            <button type="button" onClick={addMaterial}
                                className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-600/50 py-2.5 text-xs font-semibold text-slate-400 transition-all active:border-emerald-500/50 active:text-emerald-400">
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                </svg>
                                材料・リースを追加
                            </button>
                        </div>

                        {/* 備考 */}
                        <div className="space-y-1.5">
                            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 uppercase tracking-wider">
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                </svg>
                                備考
                                <span className="ml-auto flex items-center gap-2">
                                    <VoiceInputButton
                                        onText={(text) =>
                                            setRemarks((prev) => (prev && !prev.endsWith("\n") ? `${prev}\n${text}` : prev + text))
                                        }
                                    />
                                    <span className="text-[10px] font-normal text-slate-500 normal-case">任意</span>
                                </span>
                            </label>
                            <textarea
                                value={remarks}
                                onChange={(e) => setRemarks(e.target.value)}
                                placeholder="特記事項があれば入力"
                                rows={2}
                                className="w-full rounded-xl border border-slate-600/50 bg-slate-800/50 px-4 py-3 text-sm font-medium text-white placeholder-slate-500 transition-all duration-200 focus:border-sky-500/50 focus:outline-none focus:ring-4 focus:ring-sky-500/20 resize-none"
                            />
                        </div>

                        {/* 複数日にまとめて登録 */}
                        <div className={`rounded-2xl border p-3 space-y-3 transition-colors ${bulkEnabled ? "border-teal-500/40 bg-teal-500/5" : "border-slate-700/60 bg-slate-800/30"}`}>
                            <label className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                                <input
                                    type="checkbox"
                                    checked={bulkEnabled}
                                    onChange={(e) => toggleBulk(e.target.checked)}
                                    className="h-4 w-4 accent-teal-500"
                                />
                                同じ内容をほかの日にも登録する
                                <span className="ml-auto text-[10px] font-normal text-slate-500">連続する現場向け</span>
                            </label>
                            {bulkEnabled && (
                                <>
                                    <div className="flex items-center gap-2 text-xs text-slate-300">
                                        <span className="shrink-0">{formatShortDate(reportDate)} 〜</span>
                                        <input
                                            type="date"
                                            value={bulkEndDate}
                                            min={addDays(reportDate, 1)}
                                            max={addDays(reportDate, MAX_BULK_DAYS)}
                                            onChange={(e) => setBulkEndDate(e.target.value)}
                                            className="min-w-0 flex-1 rounded-xl border border-slate-600/50 bg-slate-800/50 px-3 py-2 text-sm text-white [color-scheme:dark] focus:border-teal-500/50 focus:outline-none"
                                        />
                                        <span className="shrink-0">まで</span>
                                    </div>
                                    <label className="flex items-center gap-2 text-xs text-slate-300">
                                        <input
                                            type="checkbox"
                                            checked={bulkSkipWeekends}
                                            onChange={(e) => setBulkSkipWeekends(e.target.checked)}
                                            className="h-4 w-4 accent-teal-500"
                                        />
                                        土日を除く
                                    </label>
                                    <div className="space-y-1 text-[11px] leading-relaxed">
                                        {!(bulkEndDate > reportDate) ? (
                                            <p className="text-amber-300">終了日は作業日より後の日付を選んでください。</p>
                                        ) : bulkPlan.tooLong ? (
                                            <p className="text-amber-300">まとめて登録できるのは{MAX_BULK_DAYS}日先までです。</p>
                                        ) : (
                                            <>
                                                <p className="text-teal-300">
                                                    {bulkPlan.targets.length > 0
                                                        ? `追加で登録：${bulkPlan.targets.map(formatShortDate).join("、")}`
                                                        : "追加で登録する日がありません。"}
                                                </p>
                                                {bulkPlan.skipped.length > 0 && (
                                                    <p className="text-slate-400">
                                                        入力済みのためスキップ：{bulkPlan.skipped.map(formatShortDate).join("、")}
                                                    </p>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* エラーメッセージ */}
                    {status === "error" && (
                        <div className="mt-5 rounded-2xl border-2 border-red-500/30 bg-red-500/10 px-5 py-4">
                            <div className="flex items-start gap-3">
                                <svg
                                    className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-400"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    strokeWidth={2}
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                                    />
                                </svg>
                                <div>
                                    <p className="font-semibold text-red-300">送信エラー</p>
                                    <p className="mt-1 text-sm text-red-400">{errorMessage}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 送信ボタンエリア */}
                    <div className="mt-6 pb-8 space-y-3">
                        <button
                            onClick={handleSubmitClick}
                            disabled={status === "submitting"}
                            className={`
                                relative w-full rounded-2xl px-6 py-4 text-lg font-bold
                                transition-all duration-200 shadow-lg
                                ${!isComplete
                                    ? "bg-slate-700/50 text-slate-400 shadow-none active:scale-[0.98]"
                                    : status === "submitting"
                                        ? "cursor-wait bg-sky-600/80 text-white shadow-sky-500/25"
                                        : isExistingReport
                                            ? "bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-amber-500/30 active:scale-[0.98]"
                                            : "bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-sky-500/30 active:scale-[0.98]"
                                }
                            `}
                        >
                            {status === "submitting" ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    送信中...
                                </span>
                            ) : (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d={isExistingReport
                                            ? "M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
                                            : "M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                                        } />
                                    </svg>
                                    {isExistingReport ? "日報を更新する" : "日報を送信する"}
                                    {bulkPlan.targets.length > 0 && `（計${bulkPlan.targets.length + 1}日分）`}
                                </span>
                            )}
                        </button>

                        {/* 削除ボタン（再編集モード時のみ） */}
                        {isExistingReport && status !== "submitting" && (
                            <button
                                type="button"
                                onClick={() => setShowDeleteConfirm(true)}
                                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-500/30 py-3 text-sm font-semibold text-red-400 transition-all active:bg-red-500/10"
                            >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                </svg>
                                この日報を削除する
                            </button>
                        )}

                        {/* Googleカレンダー連携ボタン（メイン画面用） */}
                        {workSite && (
                            <button
                                type="button"
                                onClick={() => {
                                    if (!reportDate || !workSite) return;
                                    const dateStr = reportDate.replace(/-/g, "");
                                    const nextDate = new Date(reportDate);
                                    nextDate.setDate(nextDate.getDate() + 1);
                                    const nextDateStr = nextDate.toISOString().split("T")[0].replace(/-/g, "");
                                    
                                    const text = encodeURIComponent(`現場: ${workSite}`);
                                    const workersStr = workerNames.length > 0 ? `作業員: ${workerNames.join(", ")}\n\n` : "";
                                    const details = encodeURIComponent(`${workersStr}作業内容:\n${workEntries.map(e => e.content).filter(Boolean).join("\n") || ""}`);
                                    
                                    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dateStr}/${nextDateStr}&details=${details}`;
                                    window.open(url, "_blank");
                                }}
                                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 py-3 text-sm font-semibold text-emerald-400 transition-all active:bg-emerald-500/20"
                            >
                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/>
                                </svg>
                                Googleカレンダーに予定を追加
                            </button>
                        )}

                        {!isComplete && !isManDayOver && status !== "submitting" && (
                            <p className={`text-center text-xs ${showErrors ? "font-semibold text-red-400" : "text-slate-500"}`}>
                                {showErrors
                                    ? `※ 未入力の項目が${missingCount}件あります（赤字の欄）`
                                    : "※ すべての項目を入力すると送信できます"}
                            </p>
                        )}

                    </div>

                </main>
            </div>
        </>
    );
}
