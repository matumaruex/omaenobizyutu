// Broad entry points, not fixed mappings to search tags.
export const FEELING_CHOICES = [
  "穏やか・あたたかい",
  "うれしい・楽しみ",
  "気になる・驚き",
  "寂しい・ひとり",
  "懐かしい・心残り",
  "悲しい・ぽっかり",
  "不安・そわそわ",
  "怒り・もどかしい",
] as const;
export const UNKNOWN_FEELING = "まだわからない";
export const UNKNOWN_FEELING_INPUT = "近い感覚：まだわからない";
export function feelingInput(choices: readonly string[], text: string) {
  const note = text.trim();
  if (!choices.length) return note;
  return `近い感覚：${choices.join("、")}${note ? `\n自分の言葉：${note}` : ""}`;
}
