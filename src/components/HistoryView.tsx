"use client";
import { useEffect, useRef, useState } from "react";
import type { HistoryReport } from "@/lib/history/types";
import Dialog from "./Dialog";
import { UsageDetail, yen } from "./UsageView";
import SearchTraceView from "./SearchTraceView";
export default function HistoryView({ onClose }: { onClose: () => void }) {
  const [report, setReport] = useState<HistoryReport | null>(null);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  async function load(offset = 0) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/history?offset=${offset}&limit=20`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok)
        throw Error(data.error || "履歴を読み込めませんでした。");
      if (!controller.signal.aborted) setReport(data);
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error ? e.message : "履歴を読み込めませんでした。",
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
      title="選定・料金の履歴（試験用）"
      onClose={onClose}
      className="review-dialog"
    >
      <h2>選定・料金の履歴</h2>
      <p className="small">
        入力文・検索候補・選定理由・使用量と推定料金を保存しています。同じ確認用アプリの利用者で共有する試験記録です。履歴を見る操作ではAIを呼びません。
      </p>
      <button
        className="text-button"
        disabled={loading}
        onClick={() => void load(report?.offset || 0)}
      >
        {loading ? "読み込み中" : "履歴を更新"}
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {report && (
        <>
          <p className="small">
            累計{report.calls}件
            {report.entries.length > 0 &&
              ` · ${report.offset + 1}〜${report.offset + report.entries.length}件目`}
          </p>
          {report.entries.length === 0 && <p>記録はまだありません。</p>}
          <div className="history-records">
            {report.entries.map(({ accounting: a, history: h }) => (
              <details className="history-entry" key={a.id}>
                <summary>
                  <span>
                    {new Date(a.createdAt).toLocaleString("ja-JP", {
                      timeZone: "Asia/Tokyo",
                    })}
                    （日本時間）
                    <br />
                    <strong>
                      {h?.input.slice(0, 80) || "選定記録の保存開始前"}
                    </strong>
                    <br />
                    <small>
                      {a.pipeline?.stage === "retrieval"
                        ? "候補選び · "
                        : a.pipeline?.stage === "selection"
                          ? "最終選定 · "
                          : ""}
                      {a.status === "succeeded"
                        ? "成功"
                        : a.status === "failed"
                          ? "選定失敗・中断"
                          : "応答未確認"}{" "}
                      · {a.estimate ? yen(a.estimate.nanoJpy) : "料金未取得"}
                    </small>
                  </span>
                </summary>
                {h ? (
                  <>
                    <h3>入力した文章</h3>
                    <p className="review-input">{h.input}</p>
                    {h.selection ? (
                      <>
                        <h3>展示全体の構成意図</h3>
                        <p>{h.selection.atmosphere}</p>
                        <h3>選ばれた作品・配置順</h3>
                        <p className="small">
                          番号は配置順で、鑑賞の順路ではありません。
                        </p>
                        <ol className="review-works">
                          {h.selection.works.map((w) => (
                            <li key={w.id}>
                              <strong>{w.titleJa || w.title}</strong>
                              <small>
                                {w.id} · {w.artist} · {w.role}
                              </small>
                              <p>{w.reason}</p>
                              {h.display && (
                                <small>
                                  {h.display.displayedIds.includes(w.id)
                                    ? "画像読み込み済み"
                                    : "画像未読み込み"}
                                </small>
                              )}
                            </li>
                          ))}
                        </ol>
                        {!h.display && (
                          <p className="small">
                            画像の読み込み結果は未報告です。
                          </p>
                        )}
                      </>
                    ) : a.pipeline?.stage === "retrieval" ? (
                      <p>
                        候補選びの記録です。最終8作品と表示結果は、同じ展示IDの最終選定の記録に保存します。
                      </p>
                    ) : (
                      <p>
                        この記録には選定結果がありません。失敗・中断などで結果を保存できなかった可能性があります。
                      </p>
                    )}
                    {h.search && (
                      <SearchTraceView
                        search={h.search}
                        selectedIds={h.selection?.works.map((w) => w.id) || []}
                      />
                    )}
                  </>
                ) : (
                  <p>
                    使用量・料金は残っていますが、選定結果はこの機能の追加前のため保存されていません。
                  </p>
                )}
                <h3>API使用量・推定料金</h3>
                <UsageDetail record={a} />
                <p className="small">記録ID：{a.id}</p>
              </details>
            ))}
          </div>
          <div className="history-pagination">
            <button
              className="text-button"
              disabled={loading || report.offset === 0}
              onClick={() =>
                void load(Math.max(0, report.offset - report.limit))
              }
            >
              新しい記録
            </button>
            <button
              className="text-button"
              disabled={loading || report.offset + report.limit >= report.calls}
              onClick={() => void load(report.offset + report.limit)}
            >
              以前の記録
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}
