import { collection } from "./collection";
import {
  emotions,
  type Emotion,
  type Artwork,
  type Exhibition,
  type Role,
  type Selection,
} from "./types";
const vocabulary: Record<Emotion, string[]> = {
  solitude: ["寂し", "さびし", "孤独", "ひとり", "一人", "誰も", "居場所"],
  loss: [
    "別れ",
    "失恋",
    "つら",
    "辛い",
    "悲し",
    "亡く",
    "喪失",
    "失っ",
    "涙",
    "会えない",
  ],
  hope: ["明日", "期待", "楽しみ", "始ま", "未来", "挑戦", "新し", "希望"],
  joy: [
    "嬉し",
    "うれし",
    "幸せ",
    "楽しい",
    "わくわく",
    "ワクワク",
    "喜び",
    "笑",
  ],
  nostalgia: [
    "懐かし",
    "なつかし",
    "昔",
    "思い出",
    "故郷",
    "子供",
    "子ども",
    "戻り",
  ],
  calm: [
    "穏やか",
    "落ち着",
    "静か",
    "安堵",
    "ほっと",
    "のんびり",
    "休み",
    "疲れ",
  ],
  love: [
    "愛",
    "恋人",
    "大切",
    "好き",
    "家族",
    "温もり",
    "ぬくもり",
    "ありがとう",
  ],
  conflict: [
    "不安",
    "後悔",
    "うまくいか",
    "分から",
    "わから",
    "迷",
    "怒",
    "焦",
    "けれど",
    "なのに",
  ],
};
export const emotionLabels: Record<Emotion, string> = {
  solitude: "ひとりの時間",
  loss: "喪失のそばで",
  hope: "まだ見ぬ明日",
  joy: "光のある方へ",
  nostalgia: "記憶の輪郭",
  calm: "静けさにほどける",
  love: "親しい距離",
  conflict: "揺れる心のままに",
};
// Deliberately modest local approximation. This is never presented as AI analysis.
export function demoProfile(text: string): Record<Emotion, number> {
  const profile = Object.fromEntries(emotions.map((e) => [e, 0.08])) as Record<
    Emotion,
    number
  >;
  for (const emotion of emotions)
    for (const term of vocabulary[emotion]) {
      let start = text.indexOf(term);
      while (start >= 0) {
        const tail = text.slice(start + term.length, start + term.length + 6);
        profile[emotion] += /^(くない|ではない|じゃない|ない)/.test(tail)
          ? 0.05
          : 1;
        start = text.indexOf(term, start + term.length);
      }
    }
  if (emotions.every((e) => profile[e] === 0.08)) profile.calm = 0.8;
  return profile;
}
export function rankCandidates(text: string, artworks = collection) {
  const profile = demoProfile(text);
  const total = emotions.reduce((s, e) => s + profile[e], 0);
  return artworks
    .map((artwork) => ({
      artwork,
      score: emotions.reduce(
        (s, e) => s + (profile[e] / total) * artwork.emotions[e],
        0,
      ),
    }))
    .sort((a, b) => b.score - a.score || a.artwork.id - b.artwork.id);
}
export function createDemoExhibition(
  text: string,
  artworks = collection,
): Exhibition {
  const profile = demoProfile(text);
  const ordered = [...emotions].sort((a, b) => profile[b] - profile[a]);
  const ranked = rankCandidates(text, artworks);
  const first = ranked[0]?.score ?? 0;
  const relevant = ranked.filter(
    (a) => a.score >= Math.max(0.25, first * 0.76),
  );
  const desired = Math.min(8, Math.max(4, relevant.length));
  const picked: Artwork[] = [];
  // Reserve different artists/subjects for alternate perspectives; do not force positivity.
  for (const entry of ranked) {
    if (picked.length >= desired - 1) break;
    if (picked.filter((a) => a.artist === entry.artwork.artist).length >= 2)
      continue;
    if (entry.score >= first * 0.48 || picked.length < 4)
      picked.push(entry.artwork);
  }
  const unexpected = [...ranked]
    .reverse()
    .find(
      (a) =>
        !picked.some((p) => p.id === a.artwork.id) && a.score >= first * 0.42,
    );
  if (unexpected && picked.length < desired)
    picked.splice(Math.max(1, picked.length - 1), 0, unexpected.artwork);
  const roleAt = (index: number): Role => {
    if (index === picked.length - 1) return "余韻";
    if (index === picked.length - 2) return "偶然の出会い";
    if (index === 0 || (index === 1 && picked.length >= 6)) return "共鳴";
    return "別のまなざし";
  };
  return {
    title: emotionLabels[ordered[0]],
    atmosphere: "今の気持ちと、絵画のあいだに。",
    mode: "demo",
    selections: picked.map((artwork, index) => ({
      id: artwork.id,
      role: roleAt(index),
      reason: `${artwork.interpretation} この展示では「${emotionLabels[ordered[0]]}」という視点から選びました。`,
    })),
  };
}
export function validateSelections(
  selections: Selection[],
  allowedIds: number[],
) {
  return (
    selections.length >= 4 &&
    selections.length <= 12 &&
    new Set(selections.map((s) => s.id)).size === selections.length &&
    selections.every((s) => allowedIds.includes(s.id))
  );
}
