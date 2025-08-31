# Export Discogs Bookmarks to CSV

Chrome 拡張機能（Manifest V3）。ブックマーク内の Discogs リンク（release/master）を走査し、アーティストや年などの情報を Discogs API から取得して CSV に出力します。API トークン不要で動作します。

## 特長

- Discogs の `release` / `master` URL のみ対象
- サブフォルダを含めた走査に対応（ON/OFF 切替）
- 重複 URL を自動除外
- 同時並列で API を呼び出し短時間で収集
- CSV には UTF-8 BOM を付与（Excel で文字化けしにくい）

## 収集して出力する列

```
artist, title, genre, style, year, url
```

## 動作要件

- Google Chrome（または Chromium 系ブラウザ）
- インターネット接続（`api.discogs.com` へのアクセス）

## インストール（開発者モード）

1. このリポジトリをローカルに取得
2. Chrome の「拡張機能」ページを開く（`chrome://extensions/`）
3. 右上で「デベロッパーモード」をオン
4. 「パッケージ化されていない拡張機能を読み込む」をクリックし、本フォルダを選択

インストール後、ツールバーの拡張機能アイコンからポップアップを開けます。

## 使い方

1. ポップアップにブックマークツリーが表示されます
2. 対象フォルダ（📁）をクリックして選択
   - 「サブフォルダも含める」のチェックで再帰的に走査するかを切替
3. 必要に応じてファイル名を入力（空ならフォルダ名.csv）
4. 「このフォルダをCSVにする」をクリック
5. 保存ダイアログが開いたら保存先を選択

## 権限について

- `bookmarks`: ブックマークツリーの取得に使用
- `downloads`: 生成した CSV の保存に使用
- `host_permissions` (`https://*.discogs.com/*`): Discogs API へのアクセスに使用

いずれも機能実現のために必要な最小限の権限です。トークンや個人情報の収集は行いません。

## 対応 URL と注意点

- 対象: `https://discogs.com/release/{id}` / `https://discogs.com/master/{id}`（サブドメインや `/ja/` 等のロケール付も可）
- ページ URL にスラッグが付いていても ID 部分を抽出して処理します（例: `/release/12345-some-title` → `12345`）
- 非対応 URL（アーティストページ等）はスキップされます

## 制限・トラブルシューティング

- API のレート制限により稀に待ち時間が発生します（429/5xx は自動リトライ）
- CSV に行が出力されない場合は、対象フォルダ内の URL が Discogs の release/master であることを確認してください
- ネットワークエラー時は再実行してください

## 開発メモ

- Manifest: `manifest.json`（V3）
- UI: `popup.html`
- ロジック: `popup.js`
- 依存ビルドなし（そのまま読み込み可能）

## ライセンス

このリポジトリのライセンスが明記されていない場合は、作者に確認してください。

