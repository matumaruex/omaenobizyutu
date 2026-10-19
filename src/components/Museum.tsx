"use client";
import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CircleHelp,
  Compass,
  LoaderCircle,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { Exhibit, Exhibition, SelectionReview } from "@/lib/types";
import ArtworkView from "./ArtworkView";
import Dialog from "./Dialog";
import SelectionReviewView from "./SelectionReviewView";
const Room = dynamic(() => import("./Room"), {
  ssr: false,
  loading: () => (
    <div className="room-loading">
      空間を準備しています
      <span className="loading-line" />
    </div>
  ),
});
class CanvasBoundary extends Component<
  { children: React.ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
export default function Museum() {
  const [entered, setEntered] = useState(false);
  const [formOpen, setFormOpen] = useState(false),
    [text, setText] = useState("");
  const [aiAvailable, setAIAvailable] = useState<boolean | null>(null);
  const [reviewEnabled, setReviewEnabled] = useState(false);
  const [review, setReview] = useState<SelectionReview | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [exhibitionVersion, setExhibitionVersion] = useState(0);
  const [exhibition, setExhibition] = useState<Exhibition | null>(null),
    [exhibits, setExhibits] = useState<Exhibit[]>([]);
  const [selected, setSelected] = useState<string | null>(null),
    [help, setHelp] = useState(false),
    [settings, setSettings] = useState(false),
    [list, setList] = useState(false);
  const [phase, setPhase] = useState<
    "idle" | "selecting" | "loading" | "fading" | "ready"
  >("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 }),
    [error, setError] = useState("");
  const [lowQuality, setLowQuality] = useState(false),
    [reducedMotion, setReducedMotion] = useState(false),
    [webglError, setWebglError] = useState(false);
  const [roomVisit, setRoomVisit] = useState(0);
  const abort = useRef<AbortController | null>(null),
    pendingImages = useRef<HTMLImageElement[]>([]);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    fetch("/api/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (mounted.current) setAIAvailable(Boolean(d?.aiAvailable));
      })
      .catch(() => {});
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(media.matches);
    const change = () => setReducedMotion(media.matches);
    media.addEventListener("change", change);
    setLowQuality(matchMedia("(max-width: 760px)").matches);
    try {
      const canvas = document.createElement("canvas");
      if (!canvas.getContext("webgl2")) setWebglError(true);
    } catch {
      setWebglError(true);
    }
    return () => {
      mounted.current = false;
      abort.current?.abort();
      pendingImages.current.forEach((img) => {
        img.src = "";
      });
      media.removeEventListener("change", change);
    };
  }, []);
  const select = useCallback((id: string) => {
    document.exitPointerLock?.();
    setSelected(id);
  }, []);
  const failWebgl = useCallback(() => setWebglError(true), []);
  const busy = ["selecting", "loading", "fading"].includes(phase);
  const active =
    entered &&
    !formOpen &&
    !selected &&
    !help &&
    !settings &&
    !list &&
    !reviewOpen &&
    !busy;
  function openForm() {
    document.exitPointerLock?.();
    setFormOpen(true);
    setText("");
    setError("");
  }
  function leaveRoom() {
    abort.current?.abort();
    document.exitPointerLock?.();
    setEntered(false);
    setFormOpen(false);
    setText("");
    setError("");
    setPhase("idle");
    setSelected(null);
    setList(false);
    setReview(null);
    setReviewOpen(false);
    setExhibition(null);
    setExhibits([]);
    setRoomVisit((visit) => visit + 1);
  }
  async function createExhibition(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    abort.current?.abort();
    const inputText = text.trim();
    const controller = new AbortController();
    abort.current = controller;
    setError("");
    setPhase("selecting");
    try {
      const response = await fetch("/api/exhibition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: inputText }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "選定に接続できませんでした。");
      const result = data as Exhibition;
      if (controller.signal.aborted || !mounted.current) return;
      setReview({ input: inputText, exhibition: result, displayedIds: [] });
      const candidates = result.selections.flatMap((selection) =>
        selection.artwork ? [{ ...selection, artwork: selection.artwork }] : [],
      );
      setPhase("loading");
      setProgress({ done: 0, total: candidates.length });
      // Three concurrent decoded images, never an unbounded texture load.
      const loaded: Exhibit[] = [];
      let cursor = 0,
        done = 0;
      const load = async () => {
        while (cursor < candidates.length && !controller.signal.aborted) {
          const exhibit = candidates[cursor++];
          const img = new Image();
          pendingImages.current.push(img);
          const success = await new Promise<boolean>((resolve) => {
            let finished = false;
            const finish = (ok: boolean) => {
              if (finished) return;
              finished = true;
              clearTimeout(timer);
              controller.signal.removeEventListener("abort", cancel);
              img.onload = null;
              img.onerror = null;
              resolve(ok);
            };
            const cancel = () => {
              finish(false);
              img.src = "";
            };
            const timer = setTimeout(() => {
              finish(false);
              img.src = "";
            }, 15000);
            controller.signal.addEventListener("abort", cancel, { once: true });
            img.onload = () => {
              img
                .decode()
                .then(() => finish(true))
                .catch(() => finish(false));
            };
            img.onerror = () => finish(false);
            img.src = exhibit.artwork.localImage;
          });
          if (success)
            loaded.push({
              ...exhibit,
              artwork: {
                ...exhibit.artwork,
                width: img.naturalWidth,
                height: img.naturalHeight,
              },
              image: img,
            });
          done++;
          if (mounted.current && !controller.signal.aborted)
            setProgress({ done, total: candidates.length });
        }
      };
      await Promise.all([load(), load(), load()]);
      pendingImages.current = [];
      if (controller.signal.aborted || !mounted.current) return;
      loaded.sort(
        (a, b) =>
          candidates.findIndex((c) => c.id === a.id) -
          candidates.findIndex((c) => c.id === b.id),
      );
      setReview({
        input: inputText,
        exhibition: result,
        displayedIds: loaded.map((a) => a.id),
      });
      if (loaded.length < 4)
        throw new Error(
          "作品画像を十分に読み込めませんでした。通信を確認して、もう一度お試しください。",
        );
      setPhase("fading");
      // Wait for the actual transition; reduced-motion users skip this pause.
      if (exhibits.length && !reducedMotion)
        await new Promise((resolve) => setTimeout(resolve, 650));
      if (controller.signal.aborted || !mounted.current) return;
      setExhibitionVersion((v) => v + 1);
      setExhibits(loaded);
      setExhibition({
        ...result,
        selections: loaded.map(({ id, role, reason }) => ({
          id,
          role,
          reason,
        })),
      });
      setText("");
      setFormOpen(false);
      setPhase("ready");
      if (loaded.length < candidates.length)
        setError(
          "一部の画像を読み込めなかったため、読み込めた作品だけで展示しました。",
        );
    } catch (failure) {
      if (controller.signal.aborted) return;
      setError(
        failure instanceof Error
          ? failure.message
          : "展示を作れませんでした。もう一度お試しください。",
      );
      setPhase("idle");
    }
  }
  const viewed = exhibits.find((e) => e.id === selected);
  return (
    <main
      className={`museum ${entered ? "is-entered" : ""} ${reducedMotion ? "reduce-motion" : ""}`}
    >
      <div className="room-layer">
        {!webglError && (
          <CanvasBoundary onError={failWebgl}>
            <Room
              exhibits={exhibits}
              exhibitionVersion={exhibitionVersion}
              fading={phase === "fading"}
              active={active}
              reducedMotion={reducedMotion}
              lowQuality={lowQuality}
              onSelect={select}
              key={roomVisit}
            />
          </CanvasBoundary>
        )}
        {webglError && (
          <div className="no-webgl">
            <Compass size={24} />
            <p>この環境では3Dを表示できません。</p>
            <span>展示の作成と、作品一覧からの鑑賞をご利用いただけます。</span>
          </div>
        )}
      </div>
      {!entered && (
        <section className="entrance" aria-labelledby="entrance-heading">
          <h1 id="entrance-heading">余白の美術館</h1>
          <button className="entrance-button" onClick={() => setEntered(true)}>
            部屋に入る <ArrowRight size={16} />
          </button>
          <div className="entrance-tools">
            <button
              className="icon-button"
              onClick={() => {
                document.exitPointerLock?.();
                setHelp(true);
              }}
              aria-label="美術館の楽しみ方"
            >
              <CircleHelp size={19} />
            </button>
            <button
              className="icon-button"
              onClick={() => {
                document.exitPointerLock?.();
                setSettings(true);
              }}
              aria-label="表示設定"
            >
              <SlidersHorizontal size={18} />
            </button>
          </div>
        </section>
      )}
      {entered && (
        <>
          <button className="leave-room" onClick={leaveRoom}>
            部屋から出る
          </button>
          {formOpen && (
            <section className="feeling-panel" aria-label="気持ちを入力">
              {!busy && (
                <button
                  className="icon-button form-close"
                  onClick={() => setFormOpen(false)}
                  aria-label={exhibition ? "展示に戻る" : "部屋を見回す"}
                >
                  <X size={16} />
                </button>
              )}
              {aiAvailable === false && (
                <p className="form-error" role="status">
                  MiMoの接続設定が完了していません。
                </p>
              )}
              <form className="feeling-form" onSubmit={createExhibition}>
                <label htmlFor="feeling">今の気持ちを教えてください</label>
                <textarea
                  id="feeling"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={800}
                  disabled={busy}
                  rows={2}
                />
                <div className="form-bottom">
                  <span>{text.length > 0 ? `${text.length} / 800` : ""}</span>
                  <button
                    type="submit"
                    className="create-button"
                    disabled={!text.trim() || busy}
                  >
                    {busy ? (
                      <>
                        <LoaderCircle size={15} className="spin" />
                        選定中
                      </>
                    ) : (
                      <>
                        展示する
                        <ArrowRight size={17} />
                      </>
                    )}
                  </button>
                </div>
              </form>
              {exhibition && !busy && (
                <button
                  className="text-button artwork-list-button"
                  onClick={() => {
                    setFormOpen(false);
                    setList(true);
                  }}
                >
                  作品一覧
                </button>
              )}
              {reviewEnabled && review && !busy && (
                <button
                  className="text-button"
                  onClick={() => {
                    setReviewOpen(true);
                    setFormOpen(false);
                  }}
                >
                  選定結果を確認（試験用）
                </button>
              )}
              <p className="privacy-note">
                入力文と候補作品の資料をXiaomi
                MiMoへ送信します。API利用料が発生します。
                入力した言葉は、この美術館に保存されません。
              </p>
              {error && (
                <div className="form-error" role="alert">
                  {error}
                </div>
              )}
              {busy && (
                <div
                  className="progress-status"
                  role="status"
                  aria-live="polite"
                >
                  <span className="loading-line" />
                  {phase === "selecting"
                    ? "言葉の背景から、作品を選んでいます。"
                    : phase === "loading"
                      ? `作品の画像を準備しています。 ${progress.done} / ${progress.total}`
                      : "前の展示が、静かに消えていきます。"}
                  <button
                    className="text-button"
                    onClick={() => {
                      abort.current?.abort();
                      setPhase("idle");
                    }}
                  >
                    キャンセル
                  </button>
                </div>
              )}
            </section>
          )}
          {!formOpen && (
            <>
              <div className="room-actions">
                <button className="pill-button" onClick={openForm}>
                  気持ちを教える
                </button>
              </div>
              {error && (
                <div className="toast" role="status">
                  {error}
                  <button
                    className="icon-button"
                    onClick={() => setError("")}
                    aria-label="通知を閉じる"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
      {viewed && (
        <ArtworkView
          key={viewed.id}
          exhibit={viewed}
          onClose={() => setSelected(null)}
        />
      )}
      {help && (
        <Dialog title="美術館の楽しみ方" onClose={() => setHelp(false)}>
          <span className="eyebrow">A QUIET GUIDE</span>
          <h2>絵と、今のあなたと。</h2>
          <div className="guide-step">
            <span>01</span>
            <div>
              <h3>気持ちを、ことばに。</h3>
              <p>
                短くても、まとまらなくても。今の気持ちを書くと、実在する絵画が、部屋の四方の壁に現れます。
              </p>
            </div>
          </div>
          <div className="guide-step">
            <span>02</span>
            <div>
              <h3>ゆっくり、見回す。</h3>
              <p>
                部屋の中央から、ドラッグやスワイプで自由に見回せます。歩行や床タップの操作はありません。
              </p>
              <p>
                絵をクリック・タップすると、大きく鑑賞できます。PCの矢印キーでも向きを変えられます。
              </p>
            </div>
          </div>
          <div className="guide-step">
            <span>03</span>
            <div>
              <h3>気になる一枚と、向き合う。</h3>
              <p>
                作品をクリック・タップすると拡大します。情報と選定理由は、読みたいときだけ。閉じると元の場所へ戻ります。
              </p>
            </div>
          </div>
          <p className="license-note">
            会員登録・履歴保存はありません。展示の作成時に入力文と候補作品の資料をXiaomi
            MiMoに送信します。
          </p>
        </Dialog>
      )}
      {settings && (
        <Dialog title="表示設定" onClose={() => setSettings(false)}>
          <span className="eyebrow">YOUR COMFORT</span>
          <h2>心地よい、余白に。</h2>
          <label className="setting-row">
            <span>
              描画を軽くする<small>スマートフォンや動きが重いときに</small>
            </span>
            <input
              type="checkbox"
              checked={lowQuality}
              onChange={(e) => setLowQuality(e.target.checked)}
            />
          </label>
          <label className="setting-row">
            <span>
              動きを減らす<small>作品のフェードインを省略します</small>
            </span>
            <input
              type="checkbox"
              checked={reducedMotion}
              onChange={(e) => setReducedMotion(e.target.checked)}
            />
          </label>
          <label className="setting-row">
            <span>
              選定結果を確認する<small>試験用。入力欄から結果を開けます</small>
            </span>
            <input
              type="checkbox"
              checked={reviewEnabled}
              onChange={(e) => setReviewEnabled(e.target.checked)}
            />
          </label>
          <p className="license-note">
            作品はGitHubの絵画DBから、MiMoが選定します。入力と試験結果は、このページを開いている間だけ保持し、退出すると消去します。
          </p>
        </Dialog>
      )}
      {reviewOpen && review && (
        <SelectionReviewView
          review={review}
          onClose={() => {
            setReviewOpen(false);
            setFormOpen(true);
          }}
        />
      )}
      {list && (
        <Dialog
          title="展示作品一覧"
          onClose={() => setList(false)}
          className="list-dialog"
        >
          <span className="eyebrow">THE COLLECTION</span>
          <h2>{exhibition?.title}</h2>
          <p className="small">気になる一枚を、選んでください。</p>
          <div className="artwork-grid">
            {exhibits.map((exhibit) => (
              <button
                key={exhibit.id}
                onClick={() => {
                  setList(false);
                  select(exhibit.id);
                }}
              >
                <img
                  src={exhibit.artwork.localImage}
                  alt={exhibit.artwork.titleJa}
                />
                <span>{exhibit.artwork.titleJa}</span>
                <small>{exhibit.artwork.artist}</small>
              </button>
            ))}
          </div>
        </Dialog>
      )}
    </main>
  );
}
