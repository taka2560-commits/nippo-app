// 予定表の写真を読み取るサーバー側の処理。Claude API（画像の読み取り）を使う。
// ・APIキー（ANTHROPIC_API_KEY）と合言葉（SCHEDULE_PASSCODE）の両方が設定されているときだけ動く
// ・合言葉・回数・画像の大きさを制限する（だれでも呼べる状態で費用が膨らむのを防ぐため）
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const DEFAULT_MODEL = "claude-opus-5-5";
// Vercelのリクエスト上限（約4.5MB）とClaudeの画像上限（5MB）の両方に収まる大きさ
export const MAX_IMAGE_BYTES = 4_300_000;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type MediaType = (typeof ALLOWED_TYPES)[number];

const RATE_LIMIT = { max: 30, windowMs: 60 * 60 * 1000 };
const hits = new Map<string, number[]>();

// AIに返してもらう形
export const ScheduleOutputSchema = z.object({
    days: z.array(
        z.object({
            day: z.number().describe("見出しの日付（日）。例：19"),
            weekday: z.string().describe("見出しの曜日（月火水木金土日のいずれか）。読めなければ空文字"),
            status: z.enum(["site", "office", "off", "not_found"]),
            site: z.string().describe("status が site のとき、そのマスの現場名（書かれているとおり）。それ以外は空文字"),
            registeredSite: z
                .string()
                .describe("site が、登録済みの現場名（knownSites）のどれかと同じと判断できるときのその名前。自信がなければ空文字"),
            members: z.array(z.string()).describe("status が site のとき、同じマスにいる全員の名前（対象の人を含む）。1人ずつ分ける"),
            confidence: z.enum(["high", "medium", "low"]),
            note: z.string().describe("読み取りに迷った点。なければ空文字"),
        })
    ),
});

export interface ScheduleMeta {
    targetNames: string[]; // 探す人の予定表での呼び名（例：吉本）
    knownNames: string[]; // 登録済みの名前（名前の区切りの手がかり）
    knownSites: string[]; // 登録済みの現場名
}

const SYSTEM_PROMPT = `あなたは、測量会社の「人員配置予定表」（ホワイトボードを撮影した写真）を読み取る係です。

【予定表の見方】
- 横方向が日付です。上の見出しに「19 月」「20 火」のように、日と曜日が書かれています。
- 縦方向が現場の行です。上のほうの行は、左端に現場名のラベル（色付きの札）があります。下のほうの行にはラベルがなく、マスの上部に手書きで現場名が書かれていることがあります。
- マスの中には、人の名前が書かれたマグネット（青・緑・黄・白など）が並びます。名字だけ、または名前だけが書かれ、名前どうしの間に空白はありません（例：「池田勇吉本」＝「池田勇」「吉本」の2人）。名前の区切りは knownNames を手がかりにしてください。
- 日付の列ごと、現場のマスごとに、そのマスにいる人が決まります。

【やること】
指定された人（targetNames のどれかの呼び名）が、日付ごとにどこにいるかを読み取り、写真に見えるすべての日付について1件ずつ答えます。

【判定のルール】
1. 現場のマスの中に対象の人の名前がある → status は "site"。site にはそのマスの現場名（左端のラベル、または手書き）を書かれているとおりに入れます。members にはそのマスにいる全員（対象の人を含む）を1人ずつ分けて入れます。
2. 表の枠の外に対象の人の名前がある → status は "office"（事務所で図面作成）。
3. 表の一番下の行に対象の人の名前がある → status は "off"（休み）。
4. その日の列に対象の人が見つからない → status は "not_found"。
- site が knownSites のどれかと同じ現場を指していると判断できるときだけ、registeredSite にその名前を入れます。
- 手書きや小さい文字で自信がないときは、推測で埋めずに confidence を "low" にして、note に理由を書いてください。
- 同じ日に対象の人が複数の場所にいる場合は、最もはっきりした1つを選び、note に書きます。
- 対象の人以外の人の予定は答える必要はありません（ただし同じマスにいる人の名前は members に入れます）。`;

export const buildScheduleRequest = (imageBase64: string, mediaType: MediaType, meta: ScheduleMeta, model: string) => ({
    model,
    max_tokens: 12000,
    system: SYSTEM_PROMPT,
    output_config: { effort: "medium" as const, format: zodOutputFormat(ScheduleOutputSchema) },
    messages: [
        {
            role: "user" as const,
            content: [
                { type: "image" as const, source: { type: "base64" as const, media_type: mediaType, data: imageBase64 } },
                {
                    type: "text" as const,
                    text: [
                        "この予定表を読み取ってください。",
                        `targetNames（探す人の呼び名）: ${JSON.stringify(meta.targetNames)}`,
                        `knownNames（登録済みの名前）: ${JSON.stringify(meta.knownNames)}`,
                        `knownSites（登録済みの現場名）: ${JSON.stringify(meta.knownSites)}`,
                    ].join("\n"),
                },
            ],
        },
    ],
});

const strList = (v: unknown, maxItems: number, maxLen: number): string[] =>
    Array.isArray(v)
        ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, maxLen)).filter(Boolean).slice(0, maxItems)
        : [];

export const parseMeta = (raw: unknown): ScheduleMeta | null => {
    if (typeof raw !== "string" || raw.length > 60_000) return null;
    try {
        const m = JSON.parse(raw) as Record<string, unknown>;
        const meta = {
            targetNames: strList(m.targetNames, 5, 30),
            knownNames: strList(m.knownNames, 200, 30),
            knownSites: strList(m.knownSites, 300, 60),
        };
        return meta.targetNames.length > 0 ? meta : null;
    } catch {
        return null;
    }
};

const safeEqual = (a: string, b: string): boolean => {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    return ba.length === bb.length && timingSafeEqual(ba, bb);
};

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

// 使う環境変数：ANTHROPIC_API_KEY・SCHEDULE_PASSCODE（必須）、ANTHROPIC_MODEL（任意）
export type ScheduleEnv = Record<string, string | undefined>;

// 使えるように設定されているか（キーや合言葉の中身は返さない）
export const isScheduleEnabled = (env: ScheduleEnv): boolean => !!env.ANTHROPIC_API_KEY && !!env.SCHEDULE_PASSCODE;

export const handleScheduleStatus = (env: ScheduleEnv) => json({ enabled: isScheduleEnabled(env) });

interface ParseClient {
    messages: { parse: (params: ReturnType<typeof buildScheduleRequest>) => Promise<{
        stop_reason: string | null;
        parsed_output: z.infer<typeof ScheduleOutputSchema> | null;
    }> };
}

export const resetRateLimit = () => hits.clear();

export async function handleScheduleRequest(request: Request, env: ScheduleEnv, client?: ParseClient): Promise<Response> {
    if (!isScheduleEnabled(env)) {
        return json({ error: "not_configured", message: "この機能はまだ設定されていません。" }, 503);
    }
    // ヘッダーには日本語をそのまま入れられないので、合言葉は URL エンコードして受け取る
    let passcode = "";
    try {
        passcode = decodeURIComponent(request.headers.get("x-schedule-passcode") ?? "");
    } catch {
        // 壊れた値は、合言葉が違うものとして扱う
    }
    if (!safeEqual(passcode, env.SCHEDULE_PASSCODE ?? "")) {
        return json({ error: "bad_passcode", message: "合言葉が違います。" }, 401);
    }

    // 回数の制限（このサーバーごとの目安）
    const key = (request.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs);
    if (recent.length >= RATE_LIMIT.max) {
        return json({ error: "rate_limited", message: "読み取りの回数が多すぎます。しばらくしてからもう一度お試しください。" }, 429);
    }
    hits.set(key, [...recent, now]);

    let form: FormData;
    try {
        form = await request.formData();
    } catch {
        return json({ error: "bad_request", message: "送信内容を読み取れませんでした。" }, 400);
    }
    const image = form.get("image");
    if (!(image instanceof File)) return json({ error: "bad_request", message: "写真がありません。" }, 400);
    if (!(ALLOWED_TYPES as readonly string[]).includes(image.type)) {
        return json({ error: "bad_image", message: "写真の形式は JPEG・PNG・WebP のいずれかにしてください。" }, 400);
    }
    if (image.size > MAX_IMAGE_BYTES) return json({ error: "too_large", message: "写真が大きすぎます。" }, 413);
    const meta = parseMeta(form.get("meta"));
    if (!meta) return json({ error: "bad_request", message: "探す人の名前が指定されていません。" }, 400);

    const base64 = Buffer.from(await image.arrayBuffer()).toString("base64");
    const params = buildScheduleRequest(base64, image.type as MediaType, meta, env.ANTHROPIC_MODEL || DEFAULT_MODEL);

    try {
        const api: ParseClient = client ?? (new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) as unknown as ParseClient);
        const response = await api.messages.parse(params);
        if (response.stop_reason === "refusal") {
            return json({ error: "refused", message: "この写真は読み取れませんでした。" }, 422);
        }
        if (!response.parsed_output) {
            return json({ error: "bad_output", message: "読み取り結果を解釈できませんでした。もう一度お試しください。" }, 502);
        }
        return json({ days: response.parsed_output.days });
    } catch (e) {
        if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
            return json({ error: "upstream_auth", message: "AIサービスの認証に失敗しました。APIキーを確認してください。" }, 502);
        }
        if (e instanceof Anthropic.RateLimitError) {
            return json({ error: "upstream_rate_limit", message: "AIサービスが混み合っています。しばらくしてからお試しください。" }, 429);
        }
        if (e instanceof Anthropic.APIConnectionTimeoutError) {
            return json({ error: "upstream_timeout", message: "読み取りに時間がかかりすぎました。もう一度お試しください。" }, 504);
        }
        // 詳しい内容は利用者には見せない（写真や名前が含まれる可能性があるため、記録もしない）
        return json({ error: "upstream_error", message: "読み取りに失敗しました。もう一度お試しください。" }, 502);
    }
}
