# このリポジトリで作業するAIへ

最初に [開発ガイド](docs/DEVELOPMENT-GUIDE.md) を読み、今回の依頼に必要な手順だけ参照してください。これは操作方法の案内であり、調査・変更・有料テスト・デプロイを毎回行う指示ではありません。現在の利用者の依頼と最新のコード・設定を優先してください。

- 日本語で説明する。利用者と共同開発者による最新の変更を確認し、上書きしない。
- 履歴確認や実AIテストの接続方法は [接続・調査の手順](docs/OPERATIONS.md)。ローカルに鍵がないだけで接続不能と判断したり、キーの再登録・履歴の手動送付を要求したりせず、既存のVercel側の実行方法を確認する。
- 過去の試験回数の許可は恒久的な予算ではない。同じ継続タスクで許可済みなら残数を引き継ぎ、別件へ自動転用しない。
- 作業先は `codex/museum-preview`。家族用は廃止済み。履歴文書を根拠に復活・同期しない。`main` と `codex/museum-preview` を削除しない。
- 新しく分かった再利用可能な操作方法は該当ガイドに追記する。今回限りの依頼・実験案を恒久ルールへ変えない。未検証の方法と確認済みの方法を区別する。

## 作業環境と効率

- タスク専用の一時作業環境では、目的達成に役立つツールの導入、検証用スクリプトの作成、設定の調整を必要な範囲で自律的に行ってよい。既存の方法で十分なら環境を増やさず、準備・維持コストも含めて効率を判断する。
- GitHubの共有ブランチ、Vercel、Redis、APIキーや課金設定は一時作業環境とは区別する。共有設定の変更、重要データの削除、本番反映、有料API試験は今回の依頼と明示的な許可範囲に従う。

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
