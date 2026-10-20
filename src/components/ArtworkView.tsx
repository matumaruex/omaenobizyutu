"use client";
import { useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import type { Exhibit } from "@/lib/types";
import Dialog from "./Dialog";
const authorDescriptions: Record<string, { heading: string; note?: string }> = {
  direct_for_this_work: { heading: "作者がこの作品について述べたこと" },
  related_motif_or_series: {
    heading: "同じ主題・連作についての作者の考え",
    note: "関連する主題や連作についての資料です。この作品そのものへの発言とは限りません。",
  },
  related_artistic_program: {
    heading: "作者の制作への考え",
    note: "作者の制作姿勢についての資料です。この作品そのものへの発言とは限りません。",
  },
};
export default function ArtworkView({
  exhibit,
  onClose,
}: {
  exhibit: Exhibit;
  onClose: () => void;
}) {
  const [info, setInfo] = useState(false),
    [reason, setReason] = useState(false),
    [error, setError] = useState(false);
  const art = exhibit.artwork;
  const explanation = art.interpretation;
  const author = explanation?.author_intent;
  const authorDescription =
    author?.summary?.trim() &&
    author.source_url &&
    Object.hasOwn(authorDescriptions, author.status)
      ? authorDescriptions[author.status]
      : undefined;
  return (
    <Dialog title="作品を鑑賞する" onClose={onClose} className="artwork-dialog">
      <div className="artwork-stage">
        <img
          src={art.localImage}
          alt={`${art.titleJa} — ${art.artist}`}
          onError={() => {
            setError(true);
          }}
        />
      </div>
      {error && (
        <p className="subtle-message" role="status">
          画像に接続できませんでした。少し時間をおいてお試しください。
        </p>
      )}
      <div className="artwork-details">
        <button
          className="disclosure artwork-reading-toggle"
          aria-expanded={info}
          aria-controls="art-info"
          onClick={() => setInfo(!info)}
        >
          {info ? "解説を閉じる" : "解説を開く"}{" "}
          <ChevronDown size={16} className={info ? "rotated" : ""} />
        </button>
        {info && (
          <div id="art-info" className="disclosure-content">
            <span className="eyebrow">作品の解説</span>
            <h2>{art.titleJa}</h2>
            <p className="original-title">{art.title}</p>
            <p>
              {art.artist} · {art.date}
            </p>
            <section
              className="artwork-description"
              aria-label="描かれているもの"
            >
              <h3>描かれているもの</h3>
              <p>{explanation?.visual_clues || art.facts}</p>
            </section>
            {explanation?.creation_context.trim() && (
              <section className="artwork-description" aria-label="制作背景">
                <h3>制作背景</h3>
                <p>{explanation.creation_context}</p>
              </section>
            )}
            {explanation?.scholarly_interpretation.summary.trim() && (
              <section
                className="artwork-description"
                aria-label="作品の読み解き"
              >
                <h3>作品の読み解き</h3>
                <p>{explanation.scholarly_interpretation.summary}</p>
                {explanation.uncertainty_note.trim() && (
                  <p className="artwork-description-note">
                    {explanation.uncertainty_note}
                  </p>
                )}
              </section>
            )}
            {authorDescription && author && (
              <section
                className="artwork-description"
                aria-label={authorDescription.heading}
              >
                <h3>{authorDescription.heading}</h3>
                <p>{author.summary}</p>
                {authorDescription.note && (
                  <p className="artwork-description-note">
                    {authorDescription.note}
                  </p>
                )}
              </section>
            )}
            <button
              className="disclosure"
              aria-expanded={reason}
              aria-controls="art-reason"
              onClick={() => setReason(!reason)}
            >
              この作品が選ばれた理由{" "}
              <ChevronDown size={16} className={reason ? "rotated" : ""} />
            </button>
            {reason && (
              <div id="art-reason" className="disclosure-content">
                <span className="interpretation-label">
                  AIによる鑑賞上の解釈 · {exhibit.role}
                </span>
                <p className="reason-text">{exhibit.reason}</p>
                <p className="license-note">
                  作品の歴史的な事実や、あなたの心理を断定する説明ではありません。感じ方は、あなた自身のものです。
                </p>
              </div>
            )}
            <details className="artwork-sources">
              <summary>画像・出典・所蔵情報</summary>
              <p className="small">
                {art.museum}
                <br />
                {art.medium}
                <br />
                {art.credit}
              </p>
              <div className="artwork-source-links">
                <a
                  href={art.localImage}
                  target="_blank"
                  rel="noreferrer"
                  className="source-link"
                >
                  元の画像を開く <ExternalLink size={13} />
                </a>
                <a
                  href={art.source}
                  target="_blank"
                  rel="noreferrer"
                  className="source-link"
                >
                  美術館の作品ページ <ExternalLink size={13} />
                </a>
                {explanation?.scholarly_interpretation.source_url && (
                  <a
                    href={explanation.scholarly_interpretation.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="source-link"
                  >
                    作品解説の出典 <ExternalLink size={13} />
                  </a>
                )}
                {authorDescription && author?.source_url && (
                  <a
                    href={author.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="source-link"
                  >
                    作者の発言・考えの出典 <ExternalLink size={13} />
                  </a>
                )}
                <a
                  href={art.imageSource}
                  target="_blank"
                  rel="noreferrer"
                  className="image-credit"
                >
                  保存画像の出典と権利情報 <ExternalLink size={11} />
                </a>
                <a
                  href={art.imageLicense}
                  target="_blank"
                  rel="noreferrer"
                  className="image-credit"
                >
                  画像の利用条件 <ExternalLink size={11} />
                </a>
              </div>
              <p className="license-note">{art.licenseNote}</p>
            </details>
          </div>
        )}
      </div>
    </Dialog>
  );
}
