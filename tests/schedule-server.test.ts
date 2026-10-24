import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
    MAX_IMAGE_BYTES,
    buildScheduleRequest,
    handleScheduleRequest,
    handleScheduleStatus,
    parseMeta,
    resetRateLimit,
} from "../src/lib/schedule-server.ts";

const env = { ANTHROPIC_API_KEY: "sk-test", SCHEDULE_PASSCODE: "合言葉123" };
const meta = JSON.stringify({ targetNames: ["吉本"], knownNames: ["吉本 貴洋"], knownSites: ["桜島"] });

const makeRequest = (opts: { passcode?: string; type?: string; bytes?: number; meta?: string | null; noImage?: boolean } = {}) => {
    const form = new FormData();
    if (!opts.noImage) {
        const body = new Uint8Array(opts.bytes ?? 1000);
        form.set("image", new File([body], "board.jpg", { type: opts.type ?? "image/jpeg" }));
    }
    if (opts.meta !== null) form.set("meta", opts.meta ?? meta);
    return new Request("http://localhost/api/schedule", {
        method: "POST",
        headers: { "x-schedule-passcode": encodeURIComponent(opts.passcode ?? "合言葉123") },
        body: form,
    });
};

const fakeClient = (result: { stop_reason?: string | null; parsed_output: unknown }) => {
    const calls: unknown[] = [];
    return {
        calls,
        client: {
            messages: {
                parse: async (params: unknown) => {
                    calls.push(params);
                    return { stop_reason: result.stop_reason ?? "end_turn", parsed_output: result.parsed_output as never };
                },
            },
        },
    };
};

const okDays = { days: [{ day: 19, weekday: "月", status: "site" as const, site: "桜島", registeredSite: "桜島", members: ["吉本"], confidence: "high" as const, note: "" }] };

beforeEach(() => resetRateLimit());

describe("設定の確認", () => {
    test("キーと合言葉の両方があるときだけ「使える」", async () => {
        assert.deepEqual(await handleScheduleStatus(env).json(), { enabled: true });
        assert.deepEqual(await handleScheduleStatus({ ANTHROPIC_API_KEY: "x" }).json(), { enabled: false });
        assert.deepEqual(await handleScheduleStatus({ SCHEDULE_PASSCODE: "x" }).json(), { enabled: false });
        assert.deepEqual(await handleScheduleStatus({}).json(), { enabled: false });
    });
});

describe("読み取りの受け付け", () => {
    test("未設定なら 503、合言葉が違えば 401（AIは呼ばない）", async () => {
        const f = fakeClient({ parsed_output: okDays });
        assert.equal((await handleScheduleRequest(makeRequest(), {}, f.client)).status, 503);
        assert.equal((await handleScheduleRequest(makeRequest({ passcode: "違う" }), env, f.client)).status, 401);
        assert.equal((await handleScheduleRequest(makeRequest({ passcode: "" }), env, f.client)).status, 401);
        assert.equal(f.calls.length, 0);
    });

    test("壊れた合言葉の値でも落ちずに 401", async () => {
        const req = new Request("http://localhost/api/schedule", { method: "POST", headers: { "x-schedule-passcode": "%E0%A4%A" }, body: new FormData() });
        assert.equal((await handleScheduleRequest(req, env, fakeClient({ parsed_output: okDays }).client)).status, 401);
    });

    test("写真が無い・形式が違う・大きすぎる・名前の指定が無い場合は、AIを呼ばずに断る", async () => {
        const f = fakeClient({ parsed_output: okDays });
        assert.equal((await handleScheduleRequest(makeRequest({ noImage: true }), env, f.client)).status, 400);
        assert.equal((await handleScheduleRequest(makeRequest({ type: "application/pdf" }), env, f.client)).status, 400);
        assert.equal((await handleScheduleRequest(makeRequest({ bytes: MAX_IMAGE_BYTES + 1 }), env, f.client)).status, 413);
        assert.equal((await handleScheduleRequest(makeRequest({ meta: null }), env, f.client)).status, 400);
        assert.equal((await handleScheduleRequest(makeRequest({ meta: "{broken" }), env, f.client)).status, 400);
        assert.equal((await handleScheduleRequest(makeRequest({ meta: JSON.stringify({ targetNames: [] }) }), env, f.client)).status, 400);
        assert.equal(f.calls.length, 0);
    });

    test("成功すると読み取り結果を返し、写真と名前を最初のリクエストに入れる", async () => {
        const f = fakeClient({ parsed_output: okDays });
        const res = await handleScheduleRequest(makeRequest(), env, f.client);
        assert.equal(res.status, 200);
        assert.deepEqual((await res.json()).days, okDays.days);
        assert.equal(f.calls.length, 1);
        const params = f.calls[0] as ReturnType<typeof buildScheduleRequest>;
        assert.equal(params.model, "claude-opus-5-5");
        assert.equal(params.messages[0].content[0].type, "image");
        assert.match(params.messages[0].content[1].text as string, /吉本/);
    });

    test("モデルは環境変数で変えられる", async () => {
        const f = fakeClient({ parsed_output: okDays });
        await handleScheduleRequest(makeRequest(), { ...env, ANTHROPIC_MODEL: "claude-sonnet-5-5" }, f.client);
        assert.equal((f.calls[0] as { model: string }).model, "claude-sonnet-5-5");
    });

    test("AIが断った・結果が空の場合はエラーにする", async () => {
        assert.equal((await handleScheduleRequest(makeRequest(), env, fakeClient({ stop_reason: "refusal", parsed_output: null }).client)).status, 422);
        assert.equal((await handleScheduleRequest(makeRequest(), env, fakeClient({ parsed_output: null }).client)).status, 502);
    });

    test("AIサービスのエラーは、内容を見せずに汎用のメッセージで返す", async () => {
        const failing = { messages: { parse: async () => { throw new Error("秘密の詳細 sk-test 写真の内容"); } } };
        const res = await handleScheduleRequest(makeRequest(), env, failing);
        assert.equal(res.status, 502);
        const text = await res.text();
        assert.ok(!text.includes("秘密") && !text.includes("sk-test"));
    });

    test("1時間に30回を超えると 429", async () => {
        const f = fakeClient({ parsed_output: okDays });
        for (let i = 0; i < 30; i++) assert.equal((await handleScheduleRequest(makeRequest(), env, f.client)).status, 200);
        assert.equal((await handleScheduleRequest(makeRequest(), env, f.client)).status, 429);
        assert.equal(f.calls.length, 30);
    });
});

describe("探す人・名簿の受け取り", () => {
    test("多すぎる・長すぎる指定は切り詰める", () => {
        const m = parseMeta(JSON.stringify({ targetNames: ["a".repeat(100)], knownNames: Array(500).fill("名"), knownSites: [] }));
        assert.ok(m);
        assert.equal(m.targetNames[0].length, 30);
        assert.equal(m.knownNames.length, 200);
    });
});
