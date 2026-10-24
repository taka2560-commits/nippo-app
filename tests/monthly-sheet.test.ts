import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
    buildMonthlySheet,
    defaultPrescribedDays,
    formatClock,
    formatHours,
    siteDisplayName,
    toDisplayNames,
} from "../src/lib/monthly-sheet.ts";
import type { StoredReport } from "../src/lib/storage.ts";

const report = (date: string, extra: Partial<StoredReport> = {}): StoredReport => ({
    reportDate: date,
    workerNames: [],
    workSite: "事務所",
    earlyStart: "0",
    overtimeHours: "0",
    workEntries: [{ location: "", content: "図面作成", manDays: 1, overtime: 0 }],
    materials: [],
    remarks: "",
    submittedAt: "",
    ...extra,
});

describe("月報の見出し・期間", () => {
    test("令和・月度・期間の表記が元のExcelと同じ", () => {
        const s = buildMonthlySheet([], 2026, 10);
        assert.equal(s.title, "月報　令和　8年　10月度");
        assert.equal(s.periodText, "2026/9/16～2026/10/15");
        assert.equal(s.rows.length, 30); // 9/16〜10/15
        assert.equal(s.rows[0].day, 16);
        assert.equal(s.rows[0].weekday, "水");
    });

    test("年をまたぐ月度（1月度）", () => {
        const s = buildMonthlySheet([], 2027, 1);
        assert.equal(s.periodText, "2026/12/16～2027/1/15");
        assert.equal(s.title, "月報　令和　9年　1月度");
        assert.equal(s.rows.length, 31);
    });
});

describe("各日の行", () => {
    test("作業のない土日は灰色、作業のある土日・作業のない平日は灰色にしない", () => {
        const s = buildMonthlySheet([report("2026-09-26")], 2026, 10); // 9/26(土)は出勤
        const row = (d: string) => s.rows.find((r) => r.date === d)!;
        assert.equal(row("2026-09-19").greyed, true); // 土・作業なし
        assert.equal(row("2026-09-20").greyed, true); // 日・作業なし
        assert.equal(row("2026-09-26").greyed, false); // 土・作業あり
        assert.equal(row("2026-09-17").greyed, false); // 平日・作業なし
    });

    test("作業時間は 8:00〜17:00 を基準に、早出・残業ぶんだけ広がる", () => {
        const s = buildMonthlySheet(
            [
                report("2026-09-25", { overtimeHours: "1" }),
                report("2026-09-24", { earlyStart: "1" }),
                report("2026-09-23", { earlyStart: "0.5", overtimeHours: "1.5" }),
                report("2026-09-22"),
            ],
            2026,
            10
        );
        const time = (d: string) => s.rows.find((r) => r.date === d)!.time;
        assert.equal(time("2026-09-25"), "8:00～18:00");
        assert.equal(time("2026-09-24"), "7:00～17:00");
        assert.equal(time("2026-09-23"), "7:30～18:30");
        assert.equal(time("2026-09-22"), "8:00～17:00");
    });

    test("現場名は「グループ - 現場」の現場の部分だけ", () => {
        assert.equal(siteDisplayName("鹿島建設 - 東京現場A"), "東京現場A");
        assert.equal(siteDisplayName("事務所"), "事務所");
    });

    test("作業内容は全角スペースでつなぎ、同じ内容は1回だけ", () => {
        const s = buildMonthlySheet(
            [
                report("2026-09-16", {
                    workEntries: [
                        { location: "A棟", content: "基準墨出し", manDays: 1, overtime: 0 },
                        { location: "B棟", content: "階段調整墨出し", manDays: 1, overtime: 0 },
                        { location: "C棟", content: "基準墨出し", manDays: 1, overtime: 0 },
                    ],
                }),
            ],
            2026,
            10
        );
        assert.equal(s.rows[0].content, "基準墨出し　階段調整墨出し");
    });
});

describe("人員欄", () => {
    test("名字だけを書き、氏名に入れた本人は載せない", () => {
        assert.deepEqual(toDisplayNames(["吉本 貴洋", "藤原 一郎", "谷口 次郎"], "吉本 貴洋"), ["藤原", "谷口"]);
        assert.deepEqual(toDisplayNames(["吉本　貴洋", "田中"], "吉本貴洋"), ["田中"]); // 空白の違いは無視
        assert.deepEqual(toDisplayNames(["勇大", "誠人"], ""), ["勇大", "誠人"]); // 名前だけの人はそのまま
    });

    test("氏名が未入力なら全員を載せる", () => {
        assert.deepEqual(toDisplayNames(["山田 太郎"], ""), ["山田"]);
    });

    test("同じ名字が重なるときは氏名をつなげて区別する", () => {
        assert.deepEqual(toDisplayNames(["田中 太郎", "田中 次郎", "佐藤 花子"], ""), ["田中太郎", "田中次郎", "佐藤"]);
    });
});

describe("集計・備考", () => {
    test("元のExcelと同じ数え方：出勤＝日報のある日、早出・残業＝早と残の合計", () => {
        const s = buildMonthlySheet(
            [
                report("2026-09-16"),
                report("2026-09-17"),
                report("2026-09-25", { overtimeHours: "1" }),
                report("2026-09-26", { earlyStart: "0.5" }),
                report("2026-08-30"), // 期間外
            ],
            2026,
            10
        );
        assert.equal(s.workDays, 4);
        assert.equal(s.overtimeTotal, 1.5);
    });

    test("備考は、時間外のある日は内訳欄へ、ない日は備考欄へ", () => {
        const s = buildMonthlySheet(
            [
                report("2026-09-25", { overtimeHours: "1", remarks: "現況測量が延びた" }),
                report("2026-09-24", { earlyStart: "1", overtimeHours: "1", remarks: "段取り" }),
                report("2026-09-28", { remarks: "雨天のため午後中止" }),
            ],
            2026,
            10
        );
        const note = (d: string) => s.rows.find((r) => r.date === d)!.overtimeNote;
        assert.equal(note("2026-09-25"), "残：現況測量が延びた");
        assert.equal(note("2026-09-24"), "早・残：段取り");
        assert.equal(note("2026-09-28"), "");
        assert.deepEqual(s.remarkLines, ["9/28 雨天のため午後中止"]);
    });

    test("規定出勤日数は、指定がなければ期間内の平日の日数", () => {
        assert.equal(defaultPrescribedDays(2026, 10), 22); // 9/16〜10/15
        assert.equal(buildMonthlySheet([], 2026, 10).prescribedDays, 22);
        assert.equal(buildMonthlySheet([], 2026, 10, { prescribedDays: 24 }).prescribedDays, 24);
    });
});

describe("表示の整形", () => {
    test("時刻・時間", () => {
        assert.equal(formatClock(7.5), "7:30");
        assert.equal(formatClock(17), "17:00");
        assert.equal(formatHours(1), "1");
        assert.equal(formatHours(0.5), "0.5");
        assert.equal(formatHours(0), "");
    });
});
