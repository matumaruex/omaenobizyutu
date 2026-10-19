"use client";
import { useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import type { Exhibit } from "@/lib/types";
import Dialog from "./Dialog";
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
      <div className="artwork-toolbar">
        <p>ただ、絵と向き合う時間。</p>
        <a
          href={art.localImage}
          target="_blank"
          rel="noreferrer"
          className="text-button"
        >
          元の画像を開く <ExternalLink size={13} />
        </a>
      </div>
      {error && (
        <p className="subtle-message" role="status">
          画像に接続できませんでした。少し時間をおいてお試しください。
        </p>
      )}
      <div className="artwork-details">
        <button
          className="disclosure"
          aria-expanded={info}
          aria-controls="art-info"
          onClick={() => setInfo(!info)}
        >
          作品について{" "}
          <ChevronDown size={16} className={info ? "rotated" : ""} />
        </button>
        {info && (
          <div id="art-info" className="disclosure-content">
            <span className="eyebrow">ABOUT THE ARTWORK</span>
            <h2>{art.titleJa}</h2>
            <p className="original-title">{art.title}</p>
            <p>
              {art.artist} · {art.date}
            </p>
            <p className="art-facts">{art.facts}</p>
            <p className="small">
              {art.museum}
              <br />
              {art.medium}
              <br />
              {art.credit}
            </p>
            <a
              href={art.source}
              target="_blank"
              rel="noreferrer"
              className="source-link"
            >
              美術館の作品ページ <ExternalLink size={13} />
            </a>
            <a
              href={art.imageSource}
              target="_blank"
              rel="noreferrer"
              className="image-credit"
            >
              保存画像の出典と権利情報 <ExternalLink size={11} />
            </a>
            <p className="license-note">{art.licenseNote}</p>
          </div>
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
      </div>
    </Dialog>
  );
}
