"use client";
import { useEffect, useRef, useState } from "react";
import type {
  AccountingResult,
  UsageRecord,
  UsageReport,
} from "@/lib/usage/types";
import Dialog from "./Dialog";
import { failureMessage } from "@/lib/usage/failure";
export const yen = (nano: number) =>
  new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(nano / 1_000_000_000);
const tokens = (value: number | null) =>
  value === null ? "未取得" : value.toLocaleString("ja-JP");
export function UsageDetail({ record }: { record: UsageRecord }) {
  return (
    <>
      {record.pipeline && (
        <p className="small">
          {record.pipeline.stage === "retrieval" ? "候補選び" : "最終選定"} ·
          展示ID：{record.pipeline.exhibitionId}
        </p>
      )}
      {record.failure && (
        <p className="small">
          {failureMessage(record.failure)} 問い合わせ開始から
          {(record.failure.elapsedMs / 1000).toFixed(1)}秒
          {record.failure.httpStatus !== undefined &&
            ` · 応答番号：${record.failure.httpStatus}`}
        </p>
      )}
      {!record.failure && record.elapsedMs !== undefined && (
        <p className="small">
          MiMo応答時間：{(record.elapsedMs / 1000).toFixed(1)}秒
        </p>
      )}
      <dl className="usage-tokens">
        <div>
          <dt>入力</dt>
          <dd>{tokens(record.usage.inputTokens)}</dd>
        </div>
        <div>
          <dt>出力</dt>
          <dd>{tokens(record.usage.outputTokens)}</dd>
        </div>
        <div>
          <dt>推論（出力の内数）</dt>
          <dd>{tokens(record.usage.reasoningTokens)}</dd>
        </div>
        <div>
          <dt>キャッシュ（入力の内数）</dt>
          <dd>{tokens(record.usage.cachedInputTokens)}</dd>
        </div>
      </dl>
      <p>
        推定料金：{record.estimate ? yen(record.estimate.nanoJpy) : "未取得"}
      </p>
      {!record.estimate && record.status === "failed" && (
        <p className="small">
          使用量を取得できなかったため、料金は未確定です。0円を意味しません。
        </p>
      )}
      <p className="small">
        換算：1米ドル＝{record.pricing.usdJpy}円（設定値）。単価版：
        {record.pricing.version}
      </p>
      {record.estimate?.cacheAssumedMiss && (
        <p className="small">
          キャッシュ数が未取得のため、入力すべてを通常単価で概算しています。
        </p>
      )}
    </>
  );
}
export function UsageDetails({ accounting }: { accounting: AccountingResult }) {
  return (
    <>
      {(accounting.records ?? [accounting.record]).map((record) => (
        <UsageDetail key={record.id} record={record} />
      ))}
    </>
  );
}
export default function UsageView({ onClose }: { onClose: () => void }) {
  const [report, setReport] = useState<UsageReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const request = useRef<AbortController | null>(null);
  async function load() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/usage", {
        cache: "no-store",
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok)
        throw Error(data.error || "使用量を読み込めませんでした。");
      if (!controller.signal.aborted) setReport(data);
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error ? e.message : "使用量を読み込めませんでした。",
        );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    return () => request.current?.abort();
  }, []);
  return (
    <Dialog
      title="API使用量・料金（試験用）"
      onClose={onClose}
      className="review-dialog"
    >
      <h2>API使用量・料金</h2>
      <p className="small">
        この美術館の記録開始以降・同じ環境の全利用者の累計です。MiMoの実際の請求額とは異なる推定値です。税・決済手数料・保存先や配信の料金は含みません。
      </p>
      <button
        className="text-button"
        disabled={loading}
        onClick={() => void load()}
      >
        {loading ? "読み込み中" : "記録を更新"}
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {report && (
        <>
          <div className="usage-summary">
            <p>
              累計API呼び出し：<strong>{report.calls}回</strong> ／ 上限{" "}
              {report.limit}回
            </p>
            <p>
              累計推定料金：<strong>{yen(report.totalNanoJpy)}</strong>
              {report.unpricedCalls > 0 && "（取得できた分のみ）"}
            </p>
          </div>
          {report.unpricedCalls > 0 && (
            <p className="small">
              料金未取得が{report.unpricedCalls}
              件あります。未取得は0円を意味しません。
            </p>
          )}
          <p className="small">
            1展示は候補選び・最終選定の原則2回です。呼び出し回数は送信直前の予約を含みます。中断や通信障害で応答を確認できない場合も上限枠を使います。自動で再送しません。
          </p>
          <details className="usage-rates">
            <summary>現在の単価・換算設定</summary>
            <p className="small">
              海外向け従量課金の100万トークンあたり：入力{" "}
              {report.pricing.inputUsdPerMillion}
              米ドル、キャッシュ入力 {report.pricing.cachedInputUsdPerMillion}
              米ドル、出力 {report.pricing.outputUsdPerMillion}
              米ドル。推論は出力に含み、別途加算しません。
            </p>
            <p className="small">
              1米ドル＝{report.pricing.usdJpy}
              円の設定値で換算。実勢レートの自動取得は行いません。単価確認日：
              {report.pricing.checkedOn}。
            </p>
            <a
              className="text-button"
              href={report.pricing.source}
              target="_blank"
              rel="noreferrer"
            >
              MiMo公式料金表
            </a>
          </details>
          <h3>呼び出しごとの記録</h3>
          {report.records.length === 0 && <p>記録はまだありません。</p>}
          <ol className="review-works usage-records">
            {report.records.map((record) => (
              <li key={record.id}>
                <strong>
                  {new Date(record.createdAt).toLocaleString("ja-JP", {
                    timeZone: "Asia/Tokyo",
                  })}
                  （日本時間）
                </strong>
                <small>
                  {record.pipeline?.stage === "retrieval"
                    ? "候補選び · "
                    : record.pipeline?.stage === "selection"
                      ? "最終選定 · "
                      : ""}
                  {record.status === "succeeded"
                    ? "選定成功"
                    : record.status === "failed"
                      ? "選定失敗・中断"
                      : "応答未確認"}{" "}
                  · {record.model}
                </small>
                <UsageDetail record={record} />
              </li>
            ))}
          </ol>
          <p className="small">
            最新100件を表示。累計にはそれ以前も含みます。過去の推定料金は各呼び出し時の単価・為替設定によります。
          </p>
        </>
      )}
    </Dialog>
  );
}
