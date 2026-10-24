import { test, describe, beforeEach, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { installBrowserGlobals } from "./helpers.ts";

const ls = installBrowserGlobals();
// window を用意してから読み込む
const storage = await import("../src/lib/storage.ts");
type StoredReport = import("../src/lib/storage.ts").StoredReport;

const report = (date: string, extra: Partial<StoredReport> = {}): StoredReport => ({
    reportDate: date,
    workerNames: ["山田 太郎"],
    workSite: "東京現場A",
    earlyStart: "0",
    overtimeHours: "0",
    workEntries: [{ location: "A棟", content: "測量作業", manDays: 1, overtime: 0 }],
    materials: [],
    remarks: "",
    submittedAt: "",
    ...extra,
});

beforeEach(() => ls.clear());
afterEach(() => mock.timers.reset());

describe("候補の並び替え", () => {
    test("使用回数の多い順に並べ、同数は元の順を保つ", () => {
        // 使用回数：C=3回, B=2回, D=1回, A=0回
        const sorted = storage.sortByUsage(["A", "B", "C", "D"], ["C", "B", "C", "D", "B", "C"]);
        assert.deepEqual(sorted, ["C", "B", "D", "A"]);
        // 同数（どれも0回）なら元の順のまま
        assert.deepEqual(storage.sortByUsage(["X", "Y", "Z"], []), ["X", "Y", "Z"]);
    });

    test("元の配列は変更しない", () => {
        const original = ["A", "B"];
        storage.sortByUsage(original, ["B", "B"]);
        assert.deepEqual(original, ["A", "B"]);
    });
});

describe("日報の保存", () => {
    test("同じ日付は上書き、別の日付は追加", () => {
        storage.saveReport(report("2026-10-01"));
        storage.saveReport(report("2026-10-02"));
        storage.saveReport(report("2026-10-01", { remarks: "更新" }));
        const all = storage.getReports();
        assert.equal(all.length, 2);
        assert.equal(storage.getReportByDate("2026-10-01")?.remarks, "更新");
    });

    test("壊れた保存データでも落ちずに空として扱う", () => {
        ls.setItem(storage.REPORTS_KEY, "{broken");
        assert.deepEqual(storage.getReports(), []);
        ls.setItem(storage.REPORTS_KEY, '{"not":"array"}');
        assert.deepEqual(storage.getReports(), []);
    });
});

describe("バックアップの読み込みチェック", () => {
    const valid = () => ({
        app: "nippo-app",
        version: 1,
        exportedAt: "2026-10-01T00:00:00.000Z",
        settings: { ...storage.getSettings(), presets: [{ name: "A班", workerNames: ["山田 太郎"], workSite: "東京現場A" }] },
        reports: [report("2026-10-01")],
    });

    test("正しいファイルを読める", () => {
        const b = storage.parseBackup(JSON.stringify(valid()));
        assert.equal(b.reports.length, 1);
        assert.equal(b.settings.presets.length, 1);
    });

    test("書き出し→読み込みで内容が変わらない", () => {
        storage.saveReport(report("2026-10-03"));
        const text = JSON.stringify(storage.createBackup());
        const b = storage.parseBackup(text);
        assert.equal(b.reports[0].reportDate, "2026-10-03");
        assert.deepEqual(b.settings.workerNames, storage.getSettings().workerNames);
    });

    test("JSONでないファイル・他のアプリのファイルは拒否する", () => {
        assert.throws(() => storage.parseBackup("これは写真です"), /読み込めませんでした/);
        assert.throws(() => storage.parseBackup('{"a":1}'), /バックアップではありません/);
        assert.throws(() => storage.parseBackup(JSON.stringify({ ...valid(), app: "other" })), /バックアップではありません/);
    });

    test("新しい形式のバックアップは拒否する", () => {
        assert.throws(() => storage.parseBackup(JSON.stringify({ ...valid(), version: 99 })), /新しいバージョン/);
    });

    test("設定・日報が壊れているバックアップは拒否する", () => {
        assert.throws(
            () => storage.parseBackup(JSON.stringify({ ...valid(), settings: { workerNames: "x" } })),
            /設定データが壊れています/
        );
        assert.throws(() => storage.parseBackup(JSON.stringify({ ...valid(), reports: "x" })), /日報データが壊れています/);
    });

    test("日付の無い日報・不正な組み合わせは取り除く", () => {
        const data = valid();
        (data.reports as unknown[]).push({ nodate: true }, null);
        (data.settings.presets as unknown[]).push({ name: 1 }, null);
        const b = storage.parseBackup(JSON.stringify(data));
        assert.equal(b.reports.length, 1);
        assert.equal(b.settings.presets.length, 1);
    });

    test("組み合わせの無い古いバックアップは空として扱う", () => {
        const data = valid() as { settings: Record<string, unknown> };
        delete data.settings.presets;
        assert.deepEqual(storage.parseBackup(JSON.stringify(data)).settings.presets, []);
    });
});

describe("バックアップの取り込み", () => {
    const backupWith = (reports: StoredReport[], settingsPatch: object = {}) =>
        storage.parseBackup(
            JSON.stringify({
                app: "nippo-app",
                version: 1,
                exportedAt: "",
                settings: { ...storage.getSettings(), ...settingsPatch },
                reports,
            })
        );

    test("追加：同じ日付はバックアップが優先、別の日付は両方残る", () => {
        storage.saveReport(report("2026-10-01", { remarks: "この端末" }));
        storage.saveReport(report("2026-10-02", { remarks: "この端末だけ" }));
        const result = storage.restoreBackup(
            backupWith([report("2026-10-01", { remarks: "バックアップ" }), report("2026-10-03")]),
            "merge"
        );
        const all = storage.getReports();
        assert.equal(result.reportCount, 3);
        assert.equal(result.importedReportCount, 2);
        assert.deepEqual(all.map((r) => r.reportDate), ["2026-10-01", "2026-10-02", "2026-10-03"]);
        assert.equal(all[0].remarks, "バックアップ");
        assert.equal(all[1].remarks, "この端末だけ");
    });

    test("追加：リストは重複なく結合し、組み合わせは同名ならこの端末を残す", () => {
        storage.saveSettings({
            ...storage.getSettings(),
            workerNames: ["山田 太郎"],
            presets: [{ name: "A班", workerNames: ["山田 太郎"], workSite: "この端末の現場" }],
        });
        storage.restoreBackup(
            backupWith([], {
                workerNames: ["山田 太郎", "新人 一郎"],
                presets: [
                    { name: "A班", workerNames: ["別人"], workSite: "バックアップの現場" },
                    { name: "B班", workerNames: ["新人 一郎"], workSite: "大阪現場A" },
                ],
            }),
            "merge"
        );
        const s = storage.getSettings();
        assert.deepEqual(s.workerNames, ["山田 太郎", "新人 一郎"]);
        assert.deepEqual(s.presets.map((p) => `${p.name}:${p.workSite}`), ["A班:この端末の現場", "B班:大阪現場A"]);
    });

    test("追加：現場グループは同名グループの中の現場を結合する", () => {
        storage.saveSettings({ ...storage.getSettings(), workSiteGroups: [{ group: "鹿島建設", sites: ["東京現場A"] }] });
        storage.restoreBackup(
            backupWith([], {
                workSiteGroups: [
                    { group: "鹿島建設", sites: ["東京現場A", "新現場"] },
                    { group: "新グループ", sites: ["X"] },
                ],
            }),
            "merge"
        );
        assert.deepEqual(storage.getSettings().workSiteGroups, [
            { group: "鹿島建設", sites: ["東京現場A", "新現場"] },
            { group: "新グループ", sites: ["X"] },
        ]);
    });

    test("置き換え：この端末の日報はすべてバックアップの内容になる", () => {
        storage.saveReport(report("2026-10-01"));
        storage.restoreBackup(backupWith([report("2026-11-01")]), "overwrite");
        assert.deepEqual(storage.getReports().map((r) => r.reportDate), ["2026-11-01"]);
    });
});

describe("下書き", () => {
    const draft = (date: string, savedAt = new Date().toISOString()) => ({
        reportDate: date,
        workerNames: ["山田 太郎"],
        workSite: "東京現場A",
        earlyStart: "0",
        overtimeHours: "0",
        workEntries: [{ location: "", content: "書きかけ", manDays: "", overtime: "0" }],
        materials: [],
        remarks: "",
        savedAt,
    });

    test("日付ごとに保存でき、別の日の下書きを消さない", () => {
        storage.saveDraft(draft("2026-10-01"));
        storage.saveDraft(draft("2026-10-02"));
        assert.equal(storage.getDraft("2026-10-01")?.workEntries[0].content, "書きかけ");
        storage.clearDraft("2026-10-01");
        assert.equal(storage.getDraft("2026-10-01"), null);
        assert.notEqual(storage.getDraft("2026-10-02"), null);
    });

    test("日付を指定しないと、最後に書いた下書きを返す", () => {
        storage.saveDraft(draft("2026-10-01", "2026-10-20T01:00:00.000Z"));
        storage.saveDraft(draft("2026-10-02", new Date().toISOString()));
        assert.equal(storage.getDraft()?.reportDate, "2026-10-02");
    });

    test("14日より古い下書きは使わない", () => {
        storage.saveDraft(draft("2026-10-01", new Date(Date.now() - 20 * 86400000).toISOString()));
        assert.equal(storage.getDraft("2026-10-01"), null);
    });

    test("壊れた下書きデータでも落ちない", () => {
        ls.setItem("nippo_drafts", "{broken");
        assert.equal(storage.getDraft(), null);
        ls.setItem("nippo_drafts", JSON.stringify({ "2026-10-01": { reportDate: "2026-10-01" } }));
        assert.equal(storage.getDraft("2026-10-01"), null);
    });

    test("最大10件まで（古いものから消える）", () => {
        for (let i = 1; i <= 12; i++) {
            const d = String(i).padStart(2, "0");
            storage.saveDraft(draft(`2026-10-${d}`, new Date(Date.now() + i * 1000).toISOString()));
        }
        assert.equal(storage.getDraft("2026-10-01"), null);
        assert.equal(storage.getDraft("2026-10-02"), null);
        assert.notEqual(storage.getDraft("2026-10-12"), null);
    });
});

describe("バックアップのお知らせ", () => {
    const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

    test("日報が無いうちは出さない", () => {
        assert.equal(storage.getBackupReminder().show, false);
    });

    test("使い始めてすぐは出さず、30日たつと出す", () => {
        storage.saveReport(report("2026-10-01"));
        assert.equal(storage.getBackupReminder().show, false); // 今日が使い始め
        ls.setItem("nippo_first_seen", daysAgo(31));
        const r = storage.getBackupReminder();
        assert.equal(r.show, true);
        assert.equal(r.neverBackedUp, true);
        assert.ok(r.daysSince >= 31);
    });

    test("バックアップすると消え、「あとで」で一時的に消える", () => {
        storage.saveReport(report("2026-10-01"));
        ls.setItem("nippo_first_seen", daysAgo(40));
        assert.equal(storage.getBackupReminder().show, true);
        storage.snoozeBackupReminder(7);
        assert.equal(storage.getBackupReminder().show, false);
        ls.removeItem("nippo_backup_snooze_until");
        storage.markBackupDone();
        assert.equal(storage.getBackupReminder().show, false);
        assert.ok(storage.getLastBackupAt());
    });

    test("前回のバックアップから30日たつと再び出す", () => {
        storage.saveReport(report("2026-10-01"));
        ls.setItem("nippo_last_backup", daysAgo(35));
        const r = storage.getBackupReminder();
        assert.equal(r.show, true);
        assert.equal(r.neverBackedUp, false);
    });
});

describe("設定の読み込み", () => {
    test("保存が無い・壊れているときは初期値、足りない項目は補う", () => {
        const defaults = storage.parseSettings(null);
        assert.ok(defaults.workerNames.length > 0);
        assert.deepEqual(storage.parseSettings("{broken"), defaults);
        const partial = storage.parseSettings(JSON.stringify({ workerNames: ["A"] }));
        assert.deepEqual(partial.workerNames, ["A"]);
        assert.deepEqual(partial.presets, []);
        assert.deepEqual(partial.manDayOptions, defaults.manDayOptions);
    });
});
