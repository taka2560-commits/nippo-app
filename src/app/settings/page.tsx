"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    getSettings,
    saveSettings,
    StorageSettings,
    SiteGroup,
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

    // 設定読み込み
    useEffect(() => {
        const currentSettings = getSettings();
        setSettings(currentSettings);
    }, []);

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
