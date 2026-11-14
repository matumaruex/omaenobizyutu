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
  const validation = {
    tag_profile: "タグ判定の形式が条件を満たしていません。",
    candidate_count: "最終選定に必要な作品候補を確保できませんでした。",
    title: "展示タイトルの長さ・形式が条件を満たしていません。",
    atmosphere: "展示全体の説明の長さ・形式が条件を満たしていません。",
    selection_count: "選ばれた作品が8点になっていません。",
    selection_fields:
      "作品の選定理由・役割などの形式が条件を満たしていません。",
    duplicate_ids: "同じ作品が重複して選ばれました。",
    outside_candidates: "候補にない作品が選ばれました。",
  };
  return failure.validationIssue
    ? `${messages[failure.kind]} ${validation[failure.validationIssue]}`
    : messages[failure.kind];
}
