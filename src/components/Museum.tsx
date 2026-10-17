"use client";
import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  Check,
  CircleHelp,
  Compass,
  LoaderCircle,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { collection } from "@/lib/collection";
import type { Exhibit, Exhibition } from "@/lib/types";
import type { Motion } from "./Room";
import ArtworkView from "./ArtworkView";
import Dialog from "./Dialog";
import Joystick from "./Joystick";
const Room = dynamic(() => import("./Room"), {
  ssr: false,
  loading: () => (
    <div className="room-loading">
      白い展示室を準備しています
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
const prompts = ["なんだか寂しい", "明日が楽しみ", "懐かしい気持ち"];
export default function Museum() {
  const [formOpen, setFormOpen] = useState(true),
    [text, setText] = useState("");
  const [mode, setMode] = useState<"demo" | "ai">("demo"),
    [aiAvailable, setAIAvailable] = useState(false);
  const [exhibitionVersion, setExhibitionVersion] = useState(0);
  const [exhibition, setExhibition] = useState<Exhibition | null>(null),
    [exhibits, setExhibits] = useState<Exhibit[]>([]);
  const [selected, setSelected] = useState<number | null>(null),
    [help, setHelp] = useState(false),
    [settings, setSettings] = useState(false),
    [list, setList] = useState(false);
  const [phase, setPhase] = useState<
    "idle" | "selecting" | "loading" | "fading" | "ready"
  >("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 }),
    [error, setError] = useState("");
  const [locked, setLocked] = useState(false),
    [lowQuality, setLowQuality] = useState(false),
    [reducedMotion, setReducedMotion] = useState(false),
    [webglError, setWebglError] = useState(false);
  const [position, setPosition] = useState([0, 7.2]);
  const joystick = useRef<Motion>({ x: 0, y: 0 });
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
  const select = useCallback((id: number) => {
    document.exitPointerLock?.();
    setSelected(id);
  }, []);
  const onPosition = useCallback(
    (x: number, z: number) => setPosition([x, z]),
    [],
  );
  const failWebgl = useCallback(() => setWebglError(true), []);
  const busy = ["selecting", "loading", "fading"].includes(phase);
  const active = !formOpen && !selected && !help && !settings && !list && !busy;
  function openForm() {
    document.exitPointerLock?.();
    setFormOpen(true);
    setText("");
    setError("");
  }
  async function createExhibition(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setError("");
    setPhase("selecting");
    try {
      const response = await fetch("/api/exhibition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, mode }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "選定に接続できませんでした。");
      const result = data as Exhibition;
      const candidates = result.selections.flatMap((selection) => {
        const artwork = collection.find((a) => a.id === selection.id);
        return artwork ? [{ ...selection, artwork }] : [];
      });
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
          if (success) loaded.push({ ...exhibit, image: img });
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
    <main className={`museum ${reducedMotion ? "reduce-motion" : ""}`}>
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
              joystick={joystick}
              onSelect={select}
              onLock={setLocked}
              onPosition={onPosition}
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
      <header className="header">
        <a href="/" className="brand" aria-label="余白の美術館 トップ">
          <span className="brand-mark" aria-hidden="true">
            余
          </span>
          <span>
            余白の美術館<small>MUSEUM OF YOUR MOMENT</small>
          </span>
        </a>
        <div className="header-right">
          <span className="private-note">
            <i />
            あなただけの展示室
          </span>
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
      </header>
      <div className="room-number">
        <span>ROOM 01</span>
        <i />
        {exhibition ? `${exhibits.length}点の絵画` : "まだ、何もない場所"}
      </div>
      {formOpen && (
        <section
          className={`intro ${exhibition ? "intro-update" : ""}`}
          aria-labelledby="intro-heading"
        >
          {exhibition && !busy && (
            <button
              className="icon-button form-close"
              onClick={() => setFormOpen(false)}
              aria-label="展示に戻る"
            >
              <X size={18} />
            </button>
          )}
          <span className="eyebrow">
            <span className="tiny-line" /> A SPACE FOR WHAT YOU FEEL
          </span>
          <h1 id="intro-heading">
            {exhibition ? (
              <>
                今の気持ちで、
                <br />
                もう一度。
              </>
            ) : (
              <>
                その気持ちに、
                <br />
                ひとつの美術館を。
              </>
            )}
          </h1>
          <p className="intro-description">
            言葉にした想いから、実在の絵画と出会う。
            <br />
            ここは、あなたのためだけに生まれる展示室。
          </p>
          <form className="feeling-form" onSubmit={createExhibition}>
            <label htmlFor="feeling">今、何を感じていますか？</label>
            <textarea
              id="feeling"
              placeholder="うまく言葉にならなくても、大丈夫。"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={800}
              disabled={busy}
              rows={3}
            />
            <div className="form-bottom">
              <span>
                {text.length > 0
                  ? `${text.length} / 800`
                  : "あなたの言葉のままで。"}
              </span>
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
                    美術館をつくる
                    <ArrowRight size={17} />
                  </>
                )}
              </button>
            </div>
          </form>
          <div className="prompt-row">
            <span>たとえば</span>
            {prompts.map((prompt) => (
              <button
                key={prompt}
                disabled={busy}
                onClick={() => setText(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>
          <div className="mode-row">
            <button
              className={mode === "demo" ? "mode active" : "mode"}
              disabled={busy}
              onClick={() => setMode("demo")}
            >
              {mode === "demo" && <Check size={11} />}無料デモ
            </button>
            <button
              className={mode === "ai" ? "mode active" : "mode"}
              disabled={busy || !aiAvailable}
              onClick={() => setMode("ai")}
              title={
                aiAvailable
                  ? "文章をOpenAIに送信して選定します"
                  : "サーバーにAPIキーとモデルの設定が必要です"
              }
            >
              AIで選ぶ{!aiAvailable && "（未設定）"}
            </button>
          </div>
          <p className="privacy-note">
            {mode === "demo"
              ? "デモは感情の手がかりを用いたローカル選定です。AIは使用しません。"
              : "入力文と候補作品をOpenAIへ送信します。API利用料が発生します。"}
            <br />
            入力した言葉は、この美術館に保存されません。
          </p>
          {error && (
            <div className="form-error" role="alert">
              {error}
              {mode === "ai" && (
                <button
                  className="text-button"
                  onClick={() => {
                    setMode("demo");
                    setError("");
                  }}
                >
                  無料デモに切り替える <ArrowRight size={13} />
                </button>
              )}
            </div>
          )}
          {busy && (
            <div className="progress-status" role="status" aria-live="polite">
              <span className="loading-line" />
              {phase === "selecting"
                ? mode === "ai"
                  ? "言葉の背景から、作品を選んでいます。"
                  : "言葉の手がかりから、作品を選んでいます。"
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
          {!exhibition && !busy && (
            <button
              className="walk-empty text-button"
              onClick={() => setFormOpen(false)}
            >
              白い部屋を歩いてみる <ArrowRight size={13} />
            </button>
          )}
        </section>
      )}
      {!formOpen && (
        <>
          <div className="exhibition-caption">
            <span className="eyebrow">
              {exhibition ? "YOUR EXHIBITION" : "THE EMPTY ROOM"}
            </span>
            <h1>{exhibition?.title || "色彩を待つ、余白。"}</h1>
            <p>{exhibition?.atmosphere || "この静けさから、始まります。"}</p>
            {exhibition && (
              <span className="exhibition-mode">
                {exhibition.mode === "ai"
                  ? "AIによる選定"
                  : "無料デモによる選定"}
              </span>
            )}
          </div>
          <div className="exhibition-actions">
            <button className="pill-button" onClick={openForm}>
              気持ちをことばにする <ArrowRight size={15} />
            </button>
            {exhibition && (
              <button
                className="text-button"
                onClick={() => {
                  document.exitPointerLock?.();
                  setList(true);
                }}
              >
                作品一覧{" "}
                <span>{exhibits.length.toString().padStart(2, "0")}</span>
              </button>
            )}
          </div>
          {active && !webglError && (
            <>
              <div className="crosshair" aria-hidden="true" />
              <Joystick motion={joystick} />
              <div className="navigation-note">
                <Compass size={15} />
                <span className="desktop-help">
                  W A S D で移動<span>·</span>
                  {locked
                    ? "マウスで視点 / ESC で解除"
                    : "ドラッグで視点 / 画面クリックで散策"}
                  <span>·</span>作品をクリックして鑑賞
                </span>
                <span className="mobile-help">
                  スティックで移動 · スワイプで視点 · 作品をタップ
                </span>
              </div>
              <div className="minimap" aria-label="展示室内の現在位置">
                <span
                  style={{
                    left: `${((position[0] + 10) / 20) * 100}%`,
                    top: `${((position[1] + 10) / 20) * 100}%`,
                  }}
                />
                <small>現在地</small>
              </div>
            </>
          )}
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
      {formOpen && !busy && (
        <div className="bottom-note">
          <span>何もない空間に、あなたの気持ちが色を灯す。</span>
          <ArrowDown size={13} />
        </div>
      )}
      <footer className="footer">
        <span>余白を、感じる。</span>
        <a
          href="https://www.artic.edu/open-access"
          target="_blank"
          rel="noreferrer"
        >
          ART COLLECTION · THE ART INSTITUTE OF CHICAGO
        </a>
      </footer>
      {viewed && (
        <ArtworkView
          key={viewed.id}
          exhibit={viewed}
          mode={exhibition?.mode || "demo"}
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
                短くても、まとまらなくても。今の気持ちを書くと、実在する絵画が白い壁に現れます。
              </p>
            </div>
          </div>
          <div className="guide-step">
            <span>02</span>
            <div>
              <h3>自由に、歩く。</h3>
              <p>
                PCはWASD・矢印キーで移動。ドラッグ、または画面クリック後のマウスで視点を変更。ESCでマウスを解除します。
              </p>
              <p>
                スマホは左下のスティックで移動し、空間をスワイプして見回せます。
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
            会員登録・履歴保存はありません。無料デモはAIを使用しません。AIモードは入力文をOpenAIに送信します。
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
          <p className="license-note">
            端末の「動きを減らす」設定を初期値に反映します。
          </p>
        </Dialog>
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
