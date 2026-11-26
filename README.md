# お前の美術館

日本語で書いた気持ちを入口に、AIが作品を選ぶ3D美術館です。正八角形の部屋に8作品を展示し、自由に見回して作品や解説を鑑賞できます。作品の参照元は [matumaruex/kaiga-data](https://github.com/matumaruex/kaiga-data) だけです。

## 開発を始める

通常の作業先は `codex/museum-preview`。 `main` は案内用です。AIは [AGENTS.md](AGENTS.md) を入口に、[開発ガイド](docs/DEVELOPMENT-GUIDE.md) の作業別案内から必要なコード・テスト・仕様を探してください。

## 起動

Node.js 24で次を実行します。

```sh
npm ci
npm run dev
```

http://localhost:3000 を開きます。実サービスの接続が必要なときだけ、既存の設定を上書きせず `.env.example` を参考に `.env.local` を用意します。秘密値に `NEXT_PUBLIC_` を付けません。MiMoとRedisが未設定の場合は選定エラーになり、ローカル選定やAPIなしの展示はありません。Vercelの既存設定を利用できる場合はローカルへ鍵を追加する必要はありません。[接続・調査の手順](docs/OPERATIONS.md)

## 説明書

| 知りたいこと | 参照先 |
| --- | --- |
| 開発・変更・検証・接続先 | [開発ガイド](docs/DEVELOPMENT-GUIDE.md) |
| 体験・展示室・作品表示 | [デザイン](docs/DESIGN.md) |
| 作品DB・キャッシュ・選定方式・画像 | [作品データ](docs/COLLECTION.md) |
| 費用・上限・モデル設定 | [API使用量](docs/API-USAGE.md) |
| 選定・料金の保存と読み取り | [履歴仕様](docs/HISTORY.md) |
| 公開範囲・プレビュー | [プレビュー](docs/PREVIEW.md) |
| その他の仕様・過去の検証 | [説明書の目次](docs/README.md) |

[過去の検証資料](docs/history/README.md) は当時の条件・判断の記録であり、現行仕様ではありません。作品数・実際に利用したDB版・稼働環境の設定は作業時点で調べてください。
