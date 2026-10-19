import type { CatalogMaterial } from "../types";
const vocabulary: Record<string, string[]> = {
  安心: ["安心", "ほっと", "落ち着", "穏やか", "静か", "疲れ", "休み"],
  寂しさ: ["寂し", "さびし", "会いたい", "会えない"],
  孤独: ["孤独", "ひとり", "一人", "居場所", "誰も"],
  懐かしさ: ["懐かし", "なつかし", "昔", "思い出", "故郷", "子ども", "子供"],
  不安: ["不安", "心配", "怖", "焦", "迷", "わから", "分から", "うまくいか"],
  好奇心: ["好奇心", "知りたい", "気になる", "不思議", "探り", "謎"],
  希望: ["希望", "未来", "挑戦", "新し", "始ま"],
  喪失感: ["喪失", "失っ", "亡く", "失恋", "別れ"],
  未練: ["未練", "戻りたい", "忘れられない", "やり直し"],
  怒り: ["怒", "腹が立", "むかつ", "ムカつ", "許せない", "理不尽"],
  喜び: ["喜", "嬉し", "うれし", "幸せ", "楽しい", "笑"],
  期待: ["期待", "楽しみ", "わくわく", "ワクワク", "明日"],
  悲しみ: ["悲し", "かなしい", "つら", "辛", "涙", "苦し"],
  畏敬: ["畏敬", "圧倒", "壮大", "神秘", "畏れ"],
  慈しみ: ["慈し", "大切", "愛", "家族", "守りたい", "いたわ", "温もり"],
};
export function searchCandidates(text: string, catalog: CatalogMaterial[]) {
  const profile = Object.fromEntries(
    Object.entries(vocabulary).map(([emotion, terms]) => [
      emotion,
      terms.reduce((score, term) => {
        const at = text.indexOf(term);
        if (at < 0) return score;
        const tail = text.slice(at + term.length, at + term.length + 6);
        return score + (/^(くない|ではない|じゃない|ない)/.test(tail) ? 0 : 1);
      }, 0),
    ]),
  );
  // Both primary and secondary tags are indexes. Untagged works remain in the
  // database but are outside this first, inexpensive retrieval experiment.
  const ranked = catalog
    .filter((a) => a.primary.length || a.secondary.length)
    .map((a) => ({
      art: a,
      score: [...a.primary, ...a.secondary].reduce(
        (s, e) =>
          s +
          (profile[e] || 0) * (a.strengths[e as keyof typeof a.strengths] || 1),
        0,
      ),
    }))
    .sort((a, b) => b.score - a.score || a.art.id.localeCompare(b.art.id));
  const chosen: CatalogMaterial[] = [];
  for (const { art } of ranked) {
    if (chosen.filter((a) => a.artist === art.artist).length >= 2) continue;
    chosen.push(art);
    if (chosen.length === 24) break;
  }
  return {
    chosen,
    taggedCount: ranked.length,
    matchingCount: ranked.filter((a) => a.score > 0).length,
    detectedCategories: Object.keys(profile).filter((e) => profile[e] > 0),
    candidates: chosen.map((art) => ({
      id: art.id,
      title: art.title,
      artist: art.artist,
      primary: art.primary,
      secondary: art.secondary,
      matchedTags: [...new Set([...art.primary, ...art.secondary])].filter(
        (e) => profile[e] > 0,
      ),
      score: ranked.find((a) => a.art.id === art.id)!.score,
    })),
  };
}

export function selectCandidates(text: string, catalog: CatalogMaterial[]) {
  return searchCandidates(text, catalog).chosen;
}
