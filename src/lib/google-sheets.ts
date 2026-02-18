import { google } from "googleapis";

// 環境変数でモックモードを判定
export function isMockMode(): boolean {
  return !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY || !process.env.GOOGLE_SPREADSHEET_ID;
}

// Google Sheets APIクライアントを初期化
function getGoogleSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({ version: "v4", auth });
}

// スプレッドシートに行を追加
export async function appendRow(values: string[]): Promise<void> {
  if (isMockMode()) {
    // モックモード: 1秒の遅延でダミー成功を返す
    console.log("[モック] スプレッドシートに書き込み:", values);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return;
  }

  const sheets = getGoogleSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "Sheet1!A:E",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [values],
    },
  });
}
