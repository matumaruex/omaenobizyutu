# スマホで繰り返し確認する

このアプリはGitHubの変更をVercelに配信する構成です。Next.jsをそのまま動かせるため、今回はVercelを選んでいます。Cloudflareでもホストできますが、今回さらに別の基盤を追加する必要はありません。

## 普段の流れ

1. このチャットで修正内容を依頼する。
2. コードを確認用ブランチへ保存・送信する。
3. Vercelがその変更を自動ビルドし、確認用URLを発行する。
4. スマホでURLを開いて確認し、気づいたことをこのチャットに伝える。

ブランチのURLはそのブランチの新しいデプロイへ追従します。特定の時点の状態を残したい場合は、そのデプロイ固有のURLを使えます。

プレビューにはVercelのログイン保護が適用される場合があります。その場合は接続済みのVercelアカウントでログインしてください。ログインの手間を省く確認用共有リンクは、有効期限を付けて発行できます。

## 費用とデータ

個人の非商用テストはVercelの無料プランの利用枠で始められます。プラン・使用量の上限に依存するため、無制限無料とはしていません。有料プランへの変更、独自ドメイン購入は今回行いません。

AIキーは設定しないので、今回の確認用展示は無料デモです。OpenAIを呼びません。入力した感情は履歴やDBに保存しません。

## 接続先

- リポジトリ：`matumaruex/bijutsukan`（非公開）
- Vercelプロジェクト：`bijutsukan`
- Vercelチーム：`matumaruexs-projects`
- 用途：スマホで確認するためのテスト用サイト（初回の自動配信はVercel上でproductionとして作成）

確認用ブランチは`codex/museum-preview`です。`main`への統合は行っていません。

- 継続確認用URL：[美術館を開く](https://bijutsukan-git-codex-museum-preview-matumaruexs-projects.vercel.app)
- 管理画面：[Vercelプロジェクト](https://vercel.com/matumaruexs-projects/bijutsukan)
- 変更のレビュー：[PR #1](https://github.com/matumaruex/bijutsukan/pull/1)

Vercelの認証保護を維持しています。初回はスマホでも同じVercelアカウントでログインしてください。初回配信のHTTP 200とAI未設定の応答を確認済みです。実機の操作感はスマホで確認してください。
