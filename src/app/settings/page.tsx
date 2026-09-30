"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    getSettings,
    saveSettings,
    StorageSettings,
    SiteGroup,
    BackupData,
    ImportMode,
    createBackup,
    getBackupFileName,
    parseBackup,
    restoreBackup,
} from "@/lib/storage";

export default function SettingsPage() {
    const router = useRouter();
    const [settings, setSettings] = useState<StorageSettings | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // 一時入力用state
    const [newWorkerName, setNewWorkerName] = useState("");
    const [newSiteName, setNewSiteName] = useState("");
    const [selectedSiteGroupIndex, setSelectedSiteGroupIndex] = useState(0);
    const [newWorkContent, setNewWorkContent] = useState("");
    const [newLocation, setNewLocation] = useState("");
    const [newMaterial, setNewMaterial] = useState("");

    // データ引き継ぎ用state
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [pendingBackup, setPendingBackup] = useState<BackupData | null>(null);
    const [transferMessage, setTransferMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [canShareFile, setCanShareFile] = useState(false);

    // 設定読み込み
    useEffect(() => {
        const currentSettings = getSettings();
        setSettings(currentSettings);

        // ファイル共有（LINE・メール・AirDrop等）に対応した端末か判定
        try {
            const probe = new File(["{}"], "probe.json", { type: "application/json" });
            setCanShareFile(!!navigator.canShare && navigator.canShare({ files: [probe] }));
        } catch {
            setCanShareFile(false);
        }
    }, []);

    // バックアップファイルを作成（未保存の変更も先に保存してから書き出す）
    const buildBackupFile = (): File => {
        if (settings) saveSettings(settings);
        const backup = createBackup();
        return new File([JSON.stringify(backup, null, 2)], getBackupFileName(), {
            type: "application/json",
        });
    };

    const handleDownloadBackup = () => {
        const file = buildBackupFile();
        const url = URL.createObjectURL(file);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setTransferMessage({ type: "success", text: `「${file.name}」を保存しました。新しい端末にこのファイルを移してください。` });
    };

    const handleShareBackup = async () => {
        const file = buildBackupFile();
        try {
            await navigator.share({ files: [file], title: "日報バックアップ" });
            setTransferMessage({ type: "success", text: "バックアップファイルを送信しました。新しい端末で受け取って読み込んでください。" });
        } catch (e) {
            // ユーザーが共有をキャンセルした場合は何もしない
            if (e instanceof DOMException && e.name === "AbortError") return;
            setTransferMessage({ type: "error", text: "共有できませんでした。「ファイルに保存」をお試しください。" });
        }
    };

    const handleSelectBackupFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = ""; // 同じファイルを再選択できるようにクリア
        if (!file) return;
        setTransferMessage(null);
        try {
            setPendingBackup(parseBackup(await file.text()));
        } catch (err) {
            setPendingBackup(null);
            setTransferMessage({ type: "error", text: err instanceof Error ? err.message : "読み込みに失敗しました。" });
        }
    };

    const handleImport = (mode: ImportMode) => {
        if (!pendingBackup) return;
        if (
            mode === "overwrite" &&
            !confirm("この端末の設定と日報をすべて削除し、バックアップの内容に置き換えます。よろしいですか？")
        ) {
            return;
        }
        if (mode === "merge" && settings) saveSettings(settings); // 未保存の変更を残したまま追加する
        const result = restoreBackup(pendingBackup, mode);
        setSettings(getSettings());
        setSelectedSiteGroupIndex(0);
        setPendingBackup(null);
        setTransferMessage({
            type: "success",
            text: `読み込みが完了しました（バックアップ内の日報 ${result.importedReportCount}件 / この端末の日報 合計${result.reportCount}件）。`,
        });
    };

    const formatDateTime = (iso: string) => {
        const d = new Date(iso);
        if (!iso || isNaN(d.getTime())) return "不明";
        return d.toLocaleString("ja-JP", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
    };

    const handleSave = () => {
        if (!settings) return;
        setIsSaving(true);
        saveSettings(settings);
        // 少し待ってから戻る（UX向上のため）
        setTimeout(() => {
            setIsSaving(false);
            router.push("/");
        }, 500);
    };

    const handleReset = () => {
        if (confirm("設定を初期値に戻しますか？現在のカスタマイズ内容はすべて失われます。")) {
            localStorage.removeItem("nippo_settings");
            const defaultSettings = getSettings(); // 再取得でデフォルトが返ってくる
            setSettings(defaultSettings);
        }
    };

    // グループ追加
    const handleAddGroup = () => {
        if (!settings) return;
        const groupName = prompt("新しい現場グループ名を入力してください（例: ○○建設）");
        if (!groupName || !groupName.trim()) return;

        if (settings.workSiteGroups.some(g => g.group === groupName.trim())) {
            alert("そのグループ名は既に存在します");
            return;
        }

        const newGroups = [...settings.workSiteGroups, { group: groupName.trim(), sites: [] }];
        setSettings({ ...settings, workSiteGroups: newGroups });
        setSelectedSiteGroupIndex(newGroups.length - 1); // 追加したグループを選択
    };

    // グループ削除
    const handleRemoveGroup = () => {
        if (!settings) return;
        const group = settings.workSiteGroups[selectedSiteGroupIndex];
        if (!confirm(`グループ「${group.group}」を削除しますか？\n含まれる現場名もすべて削除されます。`)) return;

        const newGroups = settings.workSiteGroups.filter((_, i) => i !== selectedSiteGroupIndex);
        setSettings({ ...settings, workSiteGroups: newGroups });
        setSelectedSiteGroupIndex(0); // 先頭に戻す
    };

    // 汎用的な追加・削除関数
    const addItem = (
        list: string[],
        item: string,
        updater: (newList: string[]) => void,
        clearInput: () => void
    ) => {
        if (!item.trim()) return;
        if (list.includes(item.trim())) {
            alert("すでに登録されています");
            return;
        }
        updater([...list, item.trim()]);
        clearInput();
    };

    const removeItem = (
        list: string[],
        index: number,
        updater: (newList: string[]) => void
    ) => {
        if (!confirm("削除しますか？")) return;
        const newList = [...list];
        newList.splice(index, 1);
        updater(newList);
    };

    if (!settings) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-900 text-white">
                読み込み中...
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-900 px-4 py-8 pb-32 text-slate-100 font-sans">
            <div className="mx-auto max-w-md space-y-8">
                {/* ヘッダー */}
                <div className="flex items-center justify-between">
                    <Link
                        href="/"
                        className="flex items-center gap-1 text-sm font-bold text-slate-400 hover:text-white transition-colors"
                    >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                        </svg>
                        戻る
                    </Link>
                    <h1 className="text-xl font-bold bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent">
                        設定
                    </h1>
                    <div className="w-10"></div>{/* スペーサー */}
                </div>

                {/* 作業者名設定 */}
                <section className="space-y-3">
                    <h2 className="flex items-center gap-2 text-lg font-bold text-white">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/20 text-sky-400">
                            👷
                        </span>
                        作業者リスト
                    </h2>
                    <div className="rounded-2xl border border-slate-700 bg-slate-800/50 p-4 space-y-4">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newWorkerName}
                                onChange={(e) => setNewWorkerName(e.target.value)}
                                placeholder="名前を追加"
                                className="flex-1 rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:border-sky-500"
                            />
                            <button
                                onClick={() =>
                                    addItem(
                                        settings.workerNames,
                                        newWorkerName,
                                        (l) => setSettings({ ...settings, workerNames: l }),
                                        () => setNewWorkerName("")
                                    )
                                }
                                className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-500"
                            >
                                追加
                            </button>
                        </div>
                        <ul className="space-y-2 max-h-40 overflow-y-auto">
                            {settings.workerNames.map((name, index) => (
                                <li key={index} className="flex items-center justify-between rounded-lg bg-slate-700/50 px-3 py-2 text-sm">
                                    <span>{name}</span>
                                    <button
                                        onClick={() =>
                                            removeItem(settings.workerNames, index, (l) =>
                                                setSettings({ ...settings, workerNames: l })
                                            )
                                        }
                                        className="text-slate-400 hover:text-red-400"
                                    >
                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>

                {/* 現場名設定 */}
                <section className="space-y-3">
                    <h2 className="flex items-center gap-2 text-lg font-bold text-white">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-400">
                            🏗️
                        </span>
                        現場リスト
                    </h2>
                    <div className="rounded-2xl border border-slate-700 bg-slate-800/50 p-4 space-y-4">
                        {/* グループ選択タブ */}
                        <div className="flex items-center gap-2 overflow-x-auto pb-2 noscrollbar">
                            {settings.workSiteGroups.map((group, index) => (
                                <button
                                    key={index}
                                    onClick={() => setSelectedSiteGroupIndex(index)}
                                    className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold transition-colors shrink-0 ${selectedSiteGroupIndex === index
                                        ? "bg-indigo-500 text-white"
                                        : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                                        }`}
                                >
                                    {group.group}
                                </button>
                            ))}
                            <button
                                onClick={handleAddGroup}
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-white transition-colors"
                                title="新しいグループを追加"
                            >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                </svg>
                            </button>
                        </div>

                        {settings.workSiteGroups.length > 0 && (
                            <div className="flex items-center justify-between px-1">
                                <span className="text-xs font-medium text-slate-400">
                                    {settings.workSiteGroups[selectedSiteGroupIndex]?.group} の現場
                                </span>
                                <button
                                    onClick={handleRemoveGroup}
                                    className="text-[10px] text-red-500 hover:text-red-400 hover:underline"
                                >
                                    このグループを削除
                                </button>
                            </div>
                        )}

                        {settings.workSiteGroups.length > 0 ? (
                            <>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={newSiteName}
                                        onChange={(e) => setNewSiteName(e.target.value)}
                                        placeholder="現場名を追加"
                                        className="flex-1 rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                                    />
                                    <button
                                        onClick={() => {
                                            const group = settings.workSiteGroups[selectedSiteGroupIndex];
                                            addItem(
                                                group.sites,
                                                newSiteName,
                                                (newSites) => {
                                                    const newGroups = [...settings.workSiteGroups];
                                                    newGroups[selectedSiteGroupIndex] = { ...group, sites: newSites };
                                                    setSettings({ ...settings, workSiteGroups: newGroups });
                                                },
                                                () => setNewSiteName("")
                                            );
                                        }}
                                        className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500"
                                    >
                                        追加
                                    </button>
                                </div>

                                <ul className="space-y-2 max-h-40 overflow-y-auto">
                                    {settings.workSiteGroups[selectedSiteGroupIndex].sites.map((site, index) => (
                                        <li key={index} className="flex items-center justify-between rounded-lg bg-slate-700/50 px-3 py-2 text-sm">
                                            <span>{site}</span>
                                            <button
                                                onClick={() => {
                                                    const group = settings.workSiteGroups[selectedSiteGroupIndex];
                                                    removeItem(
                                                        group.sites,
                                                        index,
                                                        (newSites) => {
                                                            const newGroups = [...settings.workSiteGroups];
                                                            newGroups[selectedSiteGroupIndex] = { ...group, sites: newSites };
                                                            setSettings({ ...settings, workSiteGroups: newGroups });
                                                        }
                                                    );
                                                }}
                                                className="text-slate-400 hover:text-red-400"
                                            >
                                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        ) : (
                            <div className="py-4 text-center text-sm text-slate-500">
                                グループを作成してください
                            </div>
                        )}
                    </div>
                </section>

                {/* 作業内容設定 */}
                <section className="space-y-3">
                    <h2 className="flex items-center gap-2 text-lg font-bold text-white">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
                            📝
                        </span>
                        作業内容リスト
                    </h2>
                    <div className="rounded-2xl border border-slate-700 bg-slate-800/50 p-4 space-y-4">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newWorkContent}
                                onChange={(e) => setNewWorkContent(e.target.value)}
                                placeholder="作業内容を追加"
                                className="flex-1 rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                            />
                            <button
                                onClick={() =>
                                    addItem(
                                        settings.workContents,
                                        newWorkContent,
                                        (l) => setSettings({ ...settings, workContents: l }),
                                        () => setNewWorkContent("")
                                    )
                                }
                                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500"
                            >
                                追加
                            </button>
                        </div>
                        <ul className="space-y-2 max-h-40 overflow-y-auto">
                            {settings.workContents.map((content, index) => (
                                <li key={index} className="flex items-center justify-between rounded-lg bg-slate-700/50 px-3 py-2 text-sm">
                                    <span>{content}</span>
                                    <button
                                        onClick={() =>
                                            removeItem(settings.workContents, index, (l) =>
                                                setSettings({ ...settings, workContents: l })
                                            )
                                        }
                                        className="text-slate-400 hover:text-red-400"
                                    >
                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>

                {/* 場所リスト設定 */}
                <section className="space-y-3">
                    <h2 className="flex items-center gap-2 text-lg font-bold text-white">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400">
                            📍
                        </span>
                        場所リスト
                    </h2>
                    <div className="rounded-2xl border border-slate-700 bg-slate-800/50 p-4 space-y-4">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newLocation}
                                onChange={(e) => setNewLocation(e.target.value)}
                                placeholder="場所を追加（例: E工区）"
                                className="flex-1 rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
                            />
                            <button
                                onClick={() =>
                                    addItem(
                                        settings.locationOptions,
                                        newLocation,
                                        (l) => setSettings({ ...settings, locationOptions: l }),
                                        () => setNewLocation("")
                                    )
                                }
                                className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-500"
                            >
                                追加
                            </button>
                        </div>
                        <ul className="space-y-2 max-h-40 overflow-y-auto">
                            {settings.locationOptions.map((loc, index) => (
                                <li key={index} className="flex items-center justify-between rounded-lg bg-slate-700/50 px-3 py-2 text-sm">
                                    <span>{loc}</span>
                                    <button
                                        onClick={() =>
                                            removeItem(settings.locationOptions, index, (l) =>
                                                setSettings({ ...settings, locationOptions: l })
                                            )
                                        }
                                        className="text-slate-400 hover:text-red-400"
                                    >
                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>

                {/* 材料リスト設定 */}
                <section className="space-y-3">
                    <h2 className="flex items-center gap-2 text-lg font-bold text-white">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/20 text-purple-400">
                            📦
                        </span>
                        材料リスト
                    </h2>
                    <div className="rounded-2xl border border-slate-700 bg-slate-800/50 p-4 space-y-4">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newMaterial}
                                onChange={(e) => setNewMaterial(e.target.value)}
                                placeholder="材料を追加"
                                className="flex-1 rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
                            />
                            <button
                                onClick={() =>
                                    addItem(
                                        settings.materialOptions,
                                        newMaterial,
                                        (l) => setSettings({ ...settings, materialOptions: l }),
                                        () => setNewMaterial("")
                                    )
                                }
                                className="rounded-xl bg-purple-600 px-4 py-2 text-sm font-bold text-white hover:bg-purple-500"
                            >
                                追加
                            </button>
                        </div>
                        <ul className="space-y-2 max-h-40 overflow-y-auto">
                            {settings.materialOptions.map((mat, index) => (
                                <li key={index} className="flex items-center justify-between rounded-lg bg-slate-700/50 px-3 py-2 text-sm">
                                    <span>{mat}</span>
                                    <button
                                        onClick={() =>
                                            removeItem(settings.materialOptions, index, (l) =>
                                                setSettings({ ...settings, materialOptions: l })
                                            )
                                        }
                                        className="text-slate-400 hover:text-red-400"
                                    >
                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>

                {/* データ引き継ぎ（機種変更） */}
                <section className="space-y-3">
                    <h2 className="flex items-center gap-2 text-lg font-bold text-white">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/20 text-teal-400">
                            📲
                        </span>
                        データの引き継ぎ（機種変更）
                    </h2>
                    <div className="rounded-2xl border border-slate-700 bg-slate-800/50 p-4 space-y-5">
                        <p className="text-xs leading-relaxed text-slate-400">
                            設定（作業者・現場・作業内容などのリスト）と、これまでに入力した日報をまとめて1つのファイルにできます。
                            古い端末で書き出し、新しい端末で読み込むとそのまま引き継げます。
                        </p>

                        {/* 書き出し */}
                        <div className="space-y-2">
                            <div className="text-sm font-bold text-slate-200">① 古い端末で書き出す</div>
                            {canShareFile && (
                                <button
                                    onClick={handleShareBackup}
                                    className="w-full rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white hover:bg-teal-500"
                                >
                                    LINE・メール等で送る
                                </button>
                            )}
                            <button
                                onClick={handleDownloadBackup}
                                className={`w-full rounded-xl px-4 py-3 text-sm font-bold text-white ${canShareFile
                                    ? "border border-teal-600 bg-transparent text-teal-300 hover:bg-teal-600/20"
                                    : "bg-teal-600 hover:bg-teal-500"
                                    }`}
                            >
                                ファイルに保存
                            </button>
                        </div>

                        {/* 読み込み */}
                        <div className="space-y-2">
                            <div className="text-sm font-bold text-slate-200">② 新しい端末で読み込む</div>
                            {/* acceptで絞るとLINE・ダウンロード経由のファイルが種類不明扱いになり
                                選択画面に表示されない端末があるため、種類は指定せず中身で判定する */}
                            <input
                                ref={fileInputRef}
                                type="file"
                                onChange={handleSelectBackupFile}
                                className="hidden"
                            />
                            {!pendingBackup ? (
                                <>
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-sm font-bold text-slate-200 hover:border-teal-500"
                                    >
                                        バックアップファイルを選択
                                    </button>
                                    <p className="text-[11px] leading-relaxed text-slate-500">
                                        「nippo_backup_」で始まるファイルを選んでください。
                                        LINEで受け取った場合は、先にトーク画面でファイルを開いて端末に保存してから選択してください。
                                    </p>
                                </>
                            ) : (
                                <div className="space-y-3 rounded-xl border border-teal-600/50 bg-slate-900 p-3">
                                    <div className="space-y-1 text-xs text-slate-300">
                                        <div>作成日時：{formatDateTime(pendingBackup.exportedAt)}</div>
                                        <div>日報：{pendingBackup.reports.length}件 ／ 作業者：{pendingBackup.settings.workerNames.length}人 ／ 現場グループ：{pendingBackup.settings.workSiteGroups.length}件</div>
                                    </div>
                                    <button
                                        onClick={() => handleImport("merge")}
                                        className="w-full rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white hover:bg-teal-500"
                                    >
                                        この端末のデータに追加する
                                    </button>
                                    <button
                                        onClick={() => handleImport("overwrite")}
                                        className="w-full rounded-xl border border-red-500/60 px-4 py-3 text-sm font-bold text-red-300 hover:bg-red-500/10"
                                    >
                                        すべて置き換える
                                    </button>
                                    <button
                                        onClick={() => setPendingBackup(null)}
                                        className="w-full py-1 text-xs text-slate-400 hover:text-white"
                                    >
                                        キャンセル
                                    </button>
                                    <p className="text-[11px] leading-relaxed text-slate-500">
                                        「追加する」：この端末のデータを残したまま取り込みます（同じ日付の日報はバックアップの内容になります）。<br />
                                        「置き換える」：この端末のデータを消して、バックアップの内容だけにします。
                                    </p>
                                </div>
                            )}
                        </div>

                        {transferMessage && (
                            <div
                                className={`rounded-xl px-3 py-2 text-xs leading-relaxed ${transferMessage.type === "success"
                                    ? "bg-emerald-500/10 text-emerald-300"
                                    : "bg-red-500/10 text-red-300"
                                    }`}
                            >
                                {transferMessage.text}
                            </div>
                        )}
                    </div>
                </section>

                {/* リセットボタン */}
                <div className="pt-8 pb-4 text-center">
                    <button
                        onClick={handleReset}
                        className="text-sm font-semibold text-slate-500 hover:text-red-400 underline underline-offset-4"
                    >
                        設定を初期値にリセット
                    </button>
                </div>
            </div>

            {/* フッター保存ボタン */}
            <div className="fixed bottom-0 left-0 right-0 border-t border-slate-800 bg-slate-900/80 p-4 backdrop-blur-xl">
                <div className="mx-auto max-w-md">
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className={`w-full rounded-2xl py-4 text-lg font-bold text-white shadow-lg transition-all ${isSaving
                            ? "cursor-not-allowed bg-slate-700 text-slate-400"
                            : "bg-gradient-to-r from-sky-500 to-indigo-600 shadow-sky-500/20 hover:scale-[1.02] active:scale-[0.98]"
                            }`}
                    >
                        {isSaving ? "保存中..." : "設定を保存する"}
                    </button>
                </div>
            </div>
        </div>
    );
}
