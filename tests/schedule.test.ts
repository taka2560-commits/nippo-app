import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
    buildSchedulePlan,
    matchSite,
    matchWorker,
    normalizeForMatch,
    parseScheduleDays,
    resolveBoardDate,
    type ScheduleDay,
} from "../src/lib/schedule.ts";

const groups = [
    { group: "鹿島建設", sites: ["東京現場A", "ウインズ梅田", "桜島"] },
    { group: "その他", sites: ["事務所", "東山公園"] },
];
const workers = ["吉本 貴洋", "池田 勇", "池田 健", "青木 一郎", "田中 二郎", "勇大", "誠人"];

describe("予定表の日付の決め方", () => {
    test("基準日に近い、日が同じ日付を選ぶ（月をまたぐ場合も）", () => {
        assert.equal(resolveBoardDate(19, "月", "2026-10-20"), "2026-10-19");
        assert.equal(resolveBoardDate(1, "日", "2026-10-30"), "2026-11-01");
        assert.equal(resolveBoardDate(31, "土", "2026-11-02"), "2026-10-31");
    });

    test("曜日が合う日を優先し、曜日が読めない・合わないときは日だけで探す", () => {
        // 10/19 は月曜。曜日「火」とは合わないが、日だけで探すと 10/19 になる
        assert.equal(resolveBoardDate(19, "火", "2026-10-20"), "2026-10-19");
        assert.equal(resolveBoardDate(19, "", "2026-10-20"), "2026-10-19");
    });

    test("20日以内に無い日は null", () => {
        assert.equal(resolveBoardDate(31, "", "2026-11-05"), "2026-10-31"); // 5日前
        assert.equal(resolveBoardDate(15, "", "2026-10-01"), "2026-10-15");
    });
});

describe("現場名の照合", () => {
    test("完全一致・部分一致・似た文字で、登録済みの現場を見つける", () => {
        assert.equal(matchSite("桜島", groups)?.value, "鹿島建設 - 桜島");
        assert.equal(matchSite("ウインズ", groups)?.value, "鹿島建設 - ウインズ梅田"); // 一部だけ書かれている
        assert.equal(matchSite("ｳｲﾝｽﾞ梅田", groups)?.value, "鹿島建設 - ウインズ梅田"); // 半角
        assert.equal(matchSite("東山", groups)?.value, "その他 - 東山公園");
    });

    test("似ていないものは見つからない・AIが示した登録名を手がかりにできる", () => {
        assert.equal(matchSite("警和会", groups), null);
        assert.equal(matchSite("読めない字", groups, "桜島")?.value, "鹿島建設 - 桜島");
    });
});

describe("名前の照合", () => {
    test("名字だけ・名前だけ・氏名で名簿の人に結びつく", () => {
        assert.equal(matchWorker("吉本", workers).matched, "吉本 貴洋");
        assert.equal(matchWorker("貴洋", workers).matched, "吉本 貴洋");
        assert.equal(matchWorker("勇大", workers).matched, "勇大");
        assert.equal(matchWorker("青木", workers).matched, "青木 一郎");
    });

    test("同じ名字が複数いるときは「池田勇」のような書き方で区別する", () => {
        assert.equal(matchWorker("池田勇", workers).matched, "池田 勇");
        assert.equal(matchWorker("池田健", workers).matched, "池田 健");
        const amb = matchWorker("池田", workers);
        assert.equal(amb.matched, null);
        assert.equal(amb.ambiguous, true);
    });

    test("名簿にいない人は null", () => {
        assert.deepEqual(matchWorker("山元", workers), { matched: null, ambiguous: false });
        assert.deepEqual(matchWorker("", workers), { matched: null, ambiguous: false });
    });

    test("比べるときは全角半角・空白の違いを無視する", () => {
        assert.equal(normalizeForMatch("ＡＢＣ　ｄｅｆ"), "abcdef");
    });
});

describe("AIの返答の検証", () => {
    test("正しい項目だけを使い、壊れた項目は捨てる", () => {
        const days = parseScheduleDays({
            days: [
                { day: 19, weekday: "月", status: "site", site: "ウインズ", registeredSite: "", members: ["池田勇", "吉本"], confidence: "high", note: "" },
                { day: 40, weekday: "月", status: "site", site: "x", members: [] }, // 日が範囲外
                { day: 20, weekday: "火", status: "unknown" }, // 不明な種類
                { day: 21, weekday: "？", status: "office", site: "混入", members: ["誰か"] }, // 事務所では現場・人員を使わない
                null,
            ],
        });
        assert.equal(days.length, 2);
        assert.deepEqual(days[0].members, ["池田勇", "吉本"]);
        assert.equal(days[1].status, "office");
        assert.equal(days[1].site, "");
        assert.deepEqual(days[1].members, []);
        assert.equal(days[1].weekday, ""); // 曜日として読めない値は空にする
        assert.deepEqual(parseScheduleDays("x"), []);
        assert.deepEqual(parseScheduleDays({ days: "x" }), []);
    });
});

describe("入力内容の案", () => {
    const day = (patch: Partial<ScheduleDay>): ScheduleDay => ({
        day: 19, weekday: "月", status: "site", site: "桜島", registeredSite: "", members: ["吉本", "青木", "山元"],
        confidence: "high", note: "", ...patch,
    });

    test("現場と人員（本人・名簿にいる人・名簿にいない人）を分けて案にする", () => {
        const plan = buildSchedulePlan(day({}), "2026-10-19", workers, groups, "吉本 貴洋");
        assert.equal(plan.site?.value, "鹿島建設 - 桜島");
        assert.deepEqual(plan.members.map((m) => [m.board, m.matched, m.isSelf]), [
            ["吉本", "吉本 貴洋", true],
            ["青木", "青木 一郎", false],
            ["山元", null, false],
        ]);
        assert.equal(plan.content, "");
    });

    test("事務所の日は、現場＝事務所・作業内容＝図面作成・人員＝本人だけ", () => {
        const plan = buildSchedulePlan(day({ status: "office", site: "", members: [] }), "2026-10-21", workers, groups, "吉本 貴洋");
        assert.equal(plan.site?.value, "その他 - 事務所");
        assert.equal(plan.content, "図面作成");
        assert.deepEqual(plan.members.map((m) => m.matched), ["吉本 貴洋"]);
        assert.equal(plan.members[0].isSelf, true);
    });

    test("事務所が登録されていないときは site が null（呼び出し側で追加する）", () => {
        const plan = buildSchedulePlan(day({ status: "office", site: "", members: [] }), "2026-10-21", workers, [{ group: "鹿島建設", sites: ["桜島"] }], "吉本 貴洋");
        assert.equal(plan.site, null);
        assert.equal(plan.siteLabel, "事務所");
    });

    test("休み・見つからない日は現場も人員も空", () => {
        for (const status of ["off", "not_found"] as const) {
            const plan = buildSchedulePlan(day({ status, site: "", members: [] }), "2026-10-22", workers, groups, "吉本 貴洋");
            assert.equal(plan.site, null);
            assert.equal(plan.members.length, status === "off" || status === "not_found" ? 0 : 0);
        }
    });

    test("氏名が未設定でも動く（本人の判定ができないだけ）", () => {
        const plan = buildSchedulePlan(day({}), "2026-10-19", workers, groups, "");
        assert.ok(plan.members.every((m) => !m.isSelf));
    });
});
