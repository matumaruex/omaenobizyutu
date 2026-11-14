import type { SearchTrace } from "@/lib/history/types";
export default function SearchTraceView({
  search,
  selectedIds,
}: {
  search: SearchTrace;
  selectedIds: string[];
}) {
  const aiTags =
    search.method === "ai-tags-v1" || search.method === "ai-tags-v2";
  const sampled = search.method === "ai-tags-v2" || Boolean(search.sampling);
  const extendedHistory = search.sampling?.version === "weighted-exposure-v2";
  const semantic =
    search.method === "ai-semantic-v1" ||
    search.method === "ai-semantic-v2" ||
    search.method === "ai-semantic-v3";
  return (
    <details className="search-trace">
      <summary>候補検索から選定までの流れ</summary>
      {aiTags ? (
        <>
          <ol>
            <li>
              入力原文とDBに登録された感情タグの一覧・意味をMiMoに渡します。この段階では作品資料を送りません。
            </li>
            <li>
              {search.classificationComplete
                ? `MiMoが選んだタグ：${search.detectedCategories.join("・") || "該当なし"}。否定されたタグ：${search.excludedCategories?.join("・") || "なし"}。`
                : "タグ判定の応答は未記録です。"}
            </li>
            <li>
              プログラムが選ばれたタグから均等に候補を集めます。同じ作者は最大2点、全体で最大24点。一致が少ない場合は他の作品も補います。
              {extendedHistory
                ? "新しい展示ごとに抽選し、このブラウザの直近5展示は強め、6〜20展示前は弱めに再登場を調整します。再登場は可能です。"
                : sampled
                  ? "新しい展示ごとに抽選し、このブラウザの直近5展示で出た作品は少し出にくくします。再登場は可能です。"
                  : "同条件の順序は入力ごとに変えます。"}
              語句の一致点では順位を付けません。
            </li>
            <li>
              タグに一致する作品は{search.matchingCount ?? "未記録"}点。候補
              {search.candidates.length}
              点の詳しい資料と入力原文を、別のMiMo呼び出しに渡して8点を選定します。
              {sampled &&
                "適合度の数字は渡さず、主題・背景・合う理由・注意事項から判断します。"}
            </li>
            {extendedHistory && (
              <li>
                最終MiMoには鑑賞履歴も伝えます。送るのは、最近・以前・繰り返し見た候補の番号だけです。原文と作品の具体的な接点を優先し、十分に合う未鑑賞作品があれば、小さな適合度の差より新しさを優先します。
              </li>
            )}
          </ol>
          <p className="small">
            タグ判定と最終選定を各1回のAPI呼び出しとして記録します。一致タグ数は表示用で、候補の順位には使いません。AI内部の推論過程は記録しません。
          </p>
        </>
      ) : semantic ? (
        <>
          <ol>
            <li>
              作品DB {search.catalogCount}点から、タグの有無を問わず
              {search.eligibleCount ?? search.catalogCount}
              点の短い主題・背景・留保と入力原文をMiMoに渡します。
            </li>
            <li>
              MiMoが文章全体の意味から24点を提案します。単語の一致点で絞り込まず、タグは作品理解の手掛かりとして使います。同じ作者は最大2点です。
              {search.method === "ai-semantic-v3" &&
                "同じ作者の3点目以降は提案順を保って除き、8点未満なら停止します。"}
            </li>
            <li>
              {search.candidates.length
                ? `候補${search.candidates.length}点を記録済み。`
                : "候補の応答は未記録です。"}
              その候補の詳しい根拠資料と入力原文で、別のMiMo呼び出しが8点を選定します。
            </li>
          </ol>
          <p className="small">
            {search.method !== "ai-semantic-v1"
              ? "候補選びは作品IDだけを出力して時間と費用を抑え、選定理由は最終8作品について生成します。"
              : "下の候補理由はAIによる短い選定説明で、内部の推論過程ではありません。"}
            候補選びと最終選定は各1回のAPI呼び出しとして料金を記録します。
          </p>
        </>
      ) : (
        <>
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
              実際に渡した{search.candidates.length}
              点の資料と入力原文をMiMoが読み、{selectedIds.length}
              点を選定。下の一覧で「選定」と付いたものが最終結果です。
            </li>
          </ol>
          <p className="small">
            これは当時の検索処理の記録です。検索点は語彙と登録タグによる絞り込み用の値で、AIの評価点ではありません。AI内部の推論過程は記録しません。
          </p>
        </>
      )}
      <ol className="review-works">
        {search.candidates.map((c) => (
          <li key={c.id}>
            <strong>
              {c.title}
              {selectedIds.includes(c.id) && " · 選定"}
            </strong>
            <small>
              {c.id} · {c.artist}
              {!semantic && ` · ${aiTags ? "一致タグ数" : "検索点"} ${c.score}`}
            </small>
            <p className="small">
              主タグ：{c.primary.join("・") || "なし"} ／ 補助タグ：
              {c.secondary.join("・") || "なし"}
              {!semantic && (
                <>
                  <br />
                  一致したタグ：{c.matchedTags.join("・") || "なし"}
                </>
              )}
            </p>
            {semantic && c.reason && <p>{c.reason}</p>}
          </li>
        ))}
      </ol>
      <p className="small">参照DB版：{search.catalogCommit}</p>
    </details>
  );
}
