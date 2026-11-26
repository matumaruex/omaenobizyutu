# 開発ガイド

この文書は、チャットや担当するAIが変わったときの案内です。読み込みだけで作業を開始するチェックリストではありません。利用者の今回の依頼に応じて、必要な手順を選びます。過去の依頼を自動的に再実行しません。

## 作業を始めるとき

1. `git status --short`、現在のブランチ、変更履歴、対象リモートブランチの先頭を確認する。作業途中の差分を消さない。利用者と共同開発者も直接編集するため、前のチャットのコミットを最新版と決めつけない。
2. 今回の目的と関係するコード・説明書を読む。チャットの要約、文書、実装が食い違う場合は [AI共通方針](../AGENTS.md) に従う。
3. 必要な範囲で変更・検証する。見た目や文書だけの変更に有料AI試験を付けない。調査だけの依頼をアプリの仕様変更や本番リリースの許可と解釈しない。

## 接続先の目印

以下は2026-11-12確認時点の識別情報です。秘密情報ではありません。作業時には接続先を再確認してください。

| 対象 | 場所・識別子 |
| --- | --- |
| アプリ | お前の美術館 |
| GitHub | `matumaruex/omaenobizyutu`（旧名 `bijutsukan`、同じリポジトリ） |
| GitHubリポジトリID | `1422390730` |
| 作業フォルダー | `/workspace/bijutsukan`（リポジトリ名変更後もこの名前の場合がある） |
| 通常の確認用ブランチ | `codex/museum-preview` |
| 作品DB | `matumaruex/kaiga-data` の `main` |
| Vercelプロジェクト | `bijutsukan` / `prj_1r0t7dUOXUvTlaKKLMFa6MkQANI4` |
| Vercelチーム | `matumaruexs-projects` / `team_3WXepmm5Zf7xTUTu7kvh0bRU` |
| 確認用URL | https://bijutsukan-git-codex-museum-preview-matumaruexs-projects.vercel.app |

家族用は利用者が不要としたため運用対象外です。[旧家族用の記録](history/FAMILY-TEST.md) は過去の構成の記録です。通常の作業で家族用ブランチを作り直したり、配信先を増やしたりしません。既存の古い配信の停止・削除も、別途その作業が必要なときに扱います。

## 目的別の説明書

全体の一覧は [説明書の目次](README.md) を参照してください。現在の仕様・操作方法と、過去の検証・旧運用を分けて案内しています。

| やりたいこと | 現行文書 | 実装の入口 | 代表テスト |
| --- | --- | --- | --- |
| 履歴調査・実AI試験・鍵 | [接続・調査](OPERATIONS.md) | [ledger](../src/lib/usage/ledger.ts) | [ledger](../tests/ledger.test.ts) |
| 履歴・料金・上限 | [履歴](HISTORY.md)・[API使用量](API-USAGE.md) | [usage](../src/lib/usage/)・[history API](../src/app/api/history/route.ts) | [履歴](../tests/history.test.ts)・[使用量](../tests/usage.test.ts) |
| 公開範囲・認証 | [プレビュー](PREVIEW.md) | [access](../src/lib/access.ts)・[config API](../src/app/api/config/route.ts) | [認証](../tests/access.test.ts)・[ゲスト画面](../tests/e2e/guest.spec.ts) |
| 入口・展示室・操作 | [デザイン](DESIGN.md) | [Museum](../src/components/Museum.tsx)・[Room](../src/components/Room.tsx)・[CSS](../src/app/globals.css)・[layout](../src/lib/layout.ts) | [配置](../tests/layout.test.ts)・[画面](../tests/e2e/museum.spec.ts) |
| 候補・最終選定・意味検索 | [作品データ](COLLECTION.md) | [tag-profile](../src/lib/ai/tag-profile.ts)・[tag-candidates](../src/lib/ai/tag-candidates.ts)・[select](../src/lib/ai/select.ts)・[semantic-search](../src/lib/ai/semantic-search.ts) | [タグ](../tests/tag-profile.test.ts)・[抽選](../tests/candidate-sampling.test.ts)・[AI](../tests/ai.test.ts) |
| 作品DB・画像 | [作品データ](COLLECTION.md)・[画像の再取得](IMAGE-RECOVERY.md) | [catalog](../src/lib/catalog/)・[images](../src/lib/images/)・[ArtworkView](../src/components/ArtworkView.tsx) | [DB](../tests/catalog.test.ts)・[キャッシュ](../tests/cache.test.ts)・[画像復旧](../tests/image-recovery.test.ts) |
| 気持ちのカテゴリ | [選択肢](FEELING-CHOICES.md) | [feeling-choices](../src/lib/feeling-choices.ts) | [選択画面](../tests/e2e/feeling-choices.spec.ts) |
| 過去の試験条件・結果 | [履歴資料の目次](history/README.md) | 当時のコミット・ブランチ | 当時の実測 |

表は入口です。変更に応じて呼び出し元や関連する検証も調べます。

過去の検証文書に書かれた作品数、ブランチ、単価、URL、制限値はその時点の記録です。現在の状態を保証しません。`artifacts/` はGit対象外なので、次の作業環境にも残るとは限りません。再利用する方法や重要な結論は、秘密情報と利用者の入力原文を除き `docs/` に残します。

## 変更時に押さえること

- `summary_for_ai` は削除済み。過去の方式の復元を理由に再導入しない。
- 作品DBは別リポジトリ。アプリの修正とDBへの書き込みを混同しない。作品数は随時変わる。稼働中アプリにはキャッシュと同梱初期DBがあり、GitHub最新と一致するとは限らない。
- 現行方式は原則「タグ判定 → 24候補の抽選 → 8作品の選定」、MiMoは2回。直近表示IDはブラウザ側に最大20展示保存する。現行値は実装で再確認する。
- 2026-11-14の依頼により継続確認用URLは公開。`codex/museum-preview` は `MUSEUM_GUEST_MODE=1` で履歴を非公開にする。このURLだけの公開例外を使い、プロジェクト全体・過去の個別デプロイの認証保護は維持する。詳細は [プレビュー](PREVIEW.md)。履歴調査のための共有リンクは発行しない。
- テストは変更に合うものを選ぶ。文書変更はリンク・内容・差分を確認すればよく、アプリの全試験や有料APIを毎回実行しない。

## 作業完了と検証

- 文書だけの変更：リンク・内容・差分。アプリ試験は省略でき、実AI通信は行わない。
- 実装変更：関連テストに加え、`npm run typecheck` と `npm test`。画面・配信に関係する変更は `npm run build` と `CI=1 PLAYWRIGHT_USE_PRODUCTION=1 npm run test:e2e` を必要な範囲で実施する。ビルドはDB同期を含む。
- 自動試験の模擬通信と、実サービスの選定品質・端末性能は別。実AI試験には今回の許可が必要。
- 作業ブランチとPRを優先する変更：選定方式・料金や上限・認証・保存形式・DB参照・配信設定・AIの作業方針、または影響範囲が不明な変更。通常の軽微な修正も今回の依頼の反映範囲に従う。通常の作業先へのpushは自動配信につながり得るため、調査だけの依頼を反映許可とみなさない。
- 実施できなかった検証とその理由を報告し、必要な検証が済むまで配信しない。

## 次のチャットへの引き継ぎ

AGENTS.mdを自動認識するAIはルートの `AGENTS.md` からこのガイドを見つけられます。別の一般チャットやリポジトリに接続していない環境では、自動で読まれる保証はありません。その場合の入口は「`matumaruex/omaenobizyutu` の `codex/museum-preview` を開き、`AGENTS.md` を読んで」です。操作手順を毎回説明し直す必要を減らすための案内です。
