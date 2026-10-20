import type { SelectionFailureDiagnostic } from "./types";

// Only fixed Japanese labels reach the UI. Never render SDK/provider messages.
export function failureMessage(failure: SelectionFailureDiagnostic): string {
  const messages: Record<SelectionFailureDiagnostic["kind"], string> = {
    timeout:
      "MiMoからの応答が待ち時間の上限を超えました。自動で再送はしていません。",
    cancelled: "展示の選定が中断されました。自動で再送はしていません。",
    network: "MiMoとの通信が途中で失敗しました。自動で再送はしていません。",
    provider_auth: "MiMoの認証に失敗しました。接続設定の確認が必要です。",
    provider_limit:
      "MiMoの利用制限に達しました。残高・利用枠を確認してください。",
    provider_error: "MiMo側でエラーが発生し、選定結果を受け取れませんでした。",
    provider_request:
      "MiMoが選定リクエストを受け付けませんでした。接続仕様の確認が必要です。",
    invalid_response: "MiMoの応答を選定結果として読み取れませんでした。",
    invalid_selection:
      "MiMoの選定結果が展示の条件を満たさなかったため、展示を停止しました。",
  };
  return messages[failure.kind];
}
