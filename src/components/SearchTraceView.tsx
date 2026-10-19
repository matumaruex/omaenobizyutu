import type { SearchTrace } from "@/lib/history/types";
export default function SearchTraceView({
  search,
  selectedIds,
}: {
  search: SearchTrace;
  selectedIds: string[];
}) {
  return (
    <details className="search-trace">
      <summary>候補検索から選定までの流れ</summary>
      <ol>
        <li>
          作品DB {search.catalogCount}点のうち、主タグ・補助タグのある
          {search.taggedCount}点を検索。
        </li>
        <li>
          入力の語彙に対応した分類：
          {search.detectedCategories.join("・") || "一致なし"}
          。検索点が付いた作品は{search.matchingCount}点。
        </li>
        <li>
          検索点の高い順に、同点は作品ID順。同じ作者は最大2点、全体で最大24点を候補にします。一致がない場合も、この既定順でタグ付き作品から候補を取ります。
        </li>
        <li>
          実際に渡した{search.candidates.length}点の資料と入力原文をMiMoが読み、
          {selectedIds.length}
          点を選定。下の一覧で「選定」と付いたものが最終結果です。
        </li>
      </ol>
      <p className="small">
        これは実際の検索処理の記録です。検索点は語彙と登録タグによる絞り込み用の値で、AIの評価点ではありません。AI内部の推論過程は記録しません。
      </p>
      <ol className="review-works">
        {search.candidates.map((c) => (
          <li key={c.id}>
            <strong>
              {c.title}
              {selectedIds.includes(c.id) && " · 選定"}
            </strong>
            <small>
              {c.id} · {c.artist} · 検索点 {c.score}
            </small>
            <p className="small">
              主タグ：{c.primary.join("・") || "なし"} ／ 補助タグ：
              {c.secondary.join("・") || "なし"}
              <br />
              一致したタグ：{c.matchedTags.join("・") || "なし"}
            </p>
          </li>
        ))}
      </ol>
      <p className="small">参照DB版：{search.catalogCommit}</p>
    </details>
  );
}
