import { test, describe, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
    addDays,
    formatShortDate,
    getMissingWeekdays,
    getPeriodOfMonth,
    isWeekend,
    toDateStr,
} from "../src/lib/dates.ts";

afterEach(() => mock.timers.reset());

describe("日付の計算", () => {
    test("月・年をまたいで日付をずらせる", () => {
        assert.equal(addDays("2026-01-31", 1), "2026-02-01");
        assert.equal(addDays("2026-12-31", 1), "2027-01-01");
        assert.equal(addDays("2026-03-01", -1), "2026-02-28");
        assert.equal(addDays("2028-02-28", 1), "2028-02-29"); // うるう年
    });

    test("曜日つきの短い表示", () => {
        assert.equal(formatShortDate("2026-09-29"), "9/29（火）");
        assert.equal(formatShortDate("2026-10-10"), "10/10（土）");
    });

    test("土日の判定", () => {
        assert.equal(isWeekend("2026-10-10"), true); // 土
        assert.equal(isWeekend("2026-10-11"), true); // 日
        assert.equal(isWeekend("2026-10-12"), false); // 月
    });

    test("日付を端末の時間で文字にする（UTCにずれない）", () => {
        assert.equal(toDateStr(new Date(2026, 9, 10, 0, 30)), "2026-10-10");
        assert.equal(toDateStr(new Date(2026, 9, 10, 23, 59)), "2026-10-10");
    });

    test("月報の集計期間は前月16日〜当月15日", () => {
        assert.deepEqual(getPeriodOfMonth(2026, 10), { from: "2026-09-16", to: "2026-10-15" });
        assert.deepEqual(getPeriodOfMonth(2026, 1), { from: "2025-12-16", to: "2026-01-15" });
    });
});

describe("未入力の平日", () => {
    // 今日を 2026-10-10（土）に固定する
    const freezeToday = () => mock.timers.enable({ apis: ["Date"], now: new Date(2026, 9, 10, 9, 0) });

    test("日報が1件も無いときは何も数えない", () => {
        freezeToday();
        assert.deepEqual(getMissingWeekdays("2026-10-01", "2026-10-31", []), []);
    });

    test("最初の日報の日以降の、入力していない平日だけを返す", () => {
        freezeToday();
        // 10/5(月)と10/8(木)だけ入力済み。10/1〜10/2は最初の日報より前なので数えない
        const missing = getMissingWeekdays("2026-10-01", "2026-10-31", ["2026-10-05", "2026-10-08"]);
        assert.deepEqual(missing, ["2026-10-06", "2026-10-07", "2026-10-09"]);
    });

    test("今日と未来は数えない・土日は数えない", () => {
        freezeToday();
        const missing = getMissingWeekdays("2026-10-01", "2026-10-31", ["2026-10-08"]);
        assert.ok(!missing.includes("2026-10-10")); // 今日（土）
        assert.ok(!missing.includes("2026-10-12")); // 未来
        assert.deepEqual(missing, ["2026-10-09"]);
    });

    test("期間の途中だけを見るときは、その期間内に限る", () => {
        freezeToday();
        const missing = getMissingWeekdays("2026-10-07", "2026-10-09", ["2026-10-01"]);
        assert.deepEqual(missing, ["2026-10-07", "2026-10-08", "2026-10-09"]);
    });
});
