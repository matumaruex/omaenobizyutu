"use client";
import type { SelectionReview } from "@/lib/types";
import Dialog from "./Dialog";
import { UsageDetail } from "./UsageView";
export default function SelectionReviewView({
  review,
  onClose,
}: {
  review: SelectionReview;
  onClose: () => void;
}) {
  const result = review.exhibition;
  return (
    <Dialog
      title="選定結果（試験用）"
      onClose={onClose}
      className="review-dialog"
    >
      <span className="eyebrow">SELECTION REVIEW</span>
      <h2>選定結果</h2>
      <h3>入力した文章</h3>
      <p className="review-input">{review.input}</p>
      <h3>展示全体の構成意図</h3>
      <p>{result.atmosphere}</p>
      <p className="small">
        番号は配置順です。鑑賞の順路を指定するものではありません。理由は検証用の短い説明です。
      </p>
      <ol className="review-works">
        {result.selections.map((selection) => (
          <li key={selection.id}>
            <strong>{selection.artwork?.titleJa || selection.id}</strong>
            <small>
              {selection.id} · {selection.role}
              {!review.displayedIds.includes(selection.id) && " · 画像未表示"}
            </small>
            <p>{selection.reason}</p>
          </li>
        ))}
      </ol>
      {result.verification.accounting && (
        <section aria-label="今回のAPI使用量">
          <h3>今回のAPI使用量</h3>
          <UsageDetail record={result.verification.accounting.record} />
          {!result.verification.accounting.persisted && (
            <p role="alert">
              この使用量を保存できませんでした。累計に反映されていない可能性があります。自動再送はしません。
            </p>
          )}
        </section>
      )}
      <p className="small">
        {result.verification.model} · 候補 {result.verification.candidateCount}{" "}
        / DB {result.verification.catalogCount}作品
        <br />
        DB版 {result.verification.catalogCommit.slice(0, 12)} · 入力{" "}
        {result.verification.inputTokens ?? "未取得"} / 出力{" "}
        {result.verification.outputTokens ?? "未取得"} トークン
      </p>
    </Dialog>
  );
}
