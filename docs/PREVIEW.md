# スマホで繰り返し確認する

このアプリはGitHubの変更をVercelに配信する構成です。Next.jsをそのまま動かせるため、今回はVercelを選んでいます。Cloudflareでもホストできますが、今回さらに別の基盤を追加する必要はありません。

## 普段の流れ

1. このチャットで修正内容を依頼する。
2. コードを確認用ブランチへ保存・送信する。
3. Vercelがその変更を自動ビルドし、確認用URLを発行する。
4. スマホでURLを開いて確認し、気づいたことをこのチャットに伝える。

ブランチのURLはそのブランチの新しいデプロイへ追従します。特定の時点の状態を残したい場合は、そのデプロイ固有のURLを使えます。

所有者用プレビューはVercelの認証保護を維持します。接続済みのVercelアカウントでログインしてください。所有者用の共有リンクは発行しません。AIによる調査で直接アクセスできない場合は [接続・調査の手順](OPERATIONS.md) を参照してください。

## 費用とデータ

個人の非商用テストはVercelの無料プランの利用枠で始められます。プラン・使用量の上限に依存するため、無制限無料とはしていません。有料プランへの変更、独自ドメイン購入は今回行いません。

MiMoの従量課金用APIキーはVercelのSecret `MIMO_API_KEY` に設定済みです。作品選定には実APIの料金がかかります。利用者の依頼に基づき、入力文・候補・選定結果・使用量をRedisへ試験履歴として保存します。[履歴の説明](HISTORY.md)を参照してください。新しい作業環境にキーがないだけで、Vercel側の再登録が必要になるわけではありません。

## 接続先

- リポジトリ：`matumaruex/omaenobizyutu`（非公開、旧名 `bijutsukan`）
- Vercelプロジェクト：`bijutsukan`
- Vercelチーム：`matumaruexs-projects`
- 用途：スマホで確認するためのテスト用サイト（初回の自動配信はVercel上でproductionとして作成）

確認用ブランチは `codex/museum-preview` です。`main` への反映は別の作業として扱います。家族用ブランチは現在の運用対象外です。

- 継続確認用URL：[美術館を開く](https://bijutsukan-git-codex-museum-preview-matumaruexs-projects.vercel.app)
- 管理画面：[Vercelプロジェクト](https://vercel.com/matumaruexs-projects/bijutsukan)
- 初期の変更レビュー：[PR #1](https://github.com/matumaruex/omaenobizyutu/pull/1)（過去の記録）

Vercelの認証保護を維持しています。初回はスマホでも同じVercelアカウントでログインしてください。配信確認では、現在のデプロイの状態・コミット・継続確認用URLの割り当てを確認します。初回配信や過去のHTTP 200だけで現在の正常動作を判断しません。
