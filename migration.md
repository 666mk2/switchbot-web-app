# SwitchBot Webアプリ 移行ガイド

このアプリケーションを常時稼働PCへ移行するための手順です。

## 1. 移行先PCでの準備
移行先のPCに以下がインストールされていることを確認してください:
- **Node.js (v18.x 以降)**
- **Git** (任意ですが、リポジトリを使用する場合は推奨)

## 2. ファイルの転送

現在の作業用PCのターミナル（PowerShell等）で、プロジェクトの親ディレクトリに移動してから、以下の `scp` コマンドを実行してラズパイにファイルを送ります。

> [!NOTE]
> `<IP_ADDRESS>` はラズパイのIPアドレスに、`<USER>` はユーザー名（通常は `pi`）に置き換えてください。

```bash
# プロジェクトフォルダを丸ごと転送 (node_modules, .next 以外)
# Windows側のプロジェクトフォルダ内で実行してください
scp -r ./src ./data package.json package-lock.json tsconfig.json next.config.mjs .env.local <USER>@<IP_ADDRESS>:~/switchbot-web-app/
```

## 3. Raspberry Pi でのセットアップ

ラズパイに SSH で接続し、以下の手順でビルドを行います。

```bash
# フォルダに移動
cd ~/switchbot-web-app

# 依存関係のインストール
npm install

# 本番用アプリケーションのビルド
# ※ ラズパイ4の場合、数分かかることがあります
npm run build

# 動作確認（テスト起動）
npm start
```

## 4. PM2での実行 (常時稼働用)
PM2を使用すると、アプリがクラッシュしたりPCが再起動したりしても自動的に復旧します。

```bash
# PM2をグローバルにインストール
sudo npm install -g pm2

# アプリケーションを起動
pm2 start npm --name "switchbot-app" -- start

# 設定を保存して再起動時にも自動起動するようにする
pm2 save
```

## 5. アプリへのアクセス
ブラウザで `http://<ラズパイのIPアドレス>:3000` にアクセスしてください。

---

## トラブルシューティング

#### Q. 変更（修正）したコードがラズパイ上で反映されない
ラズパイで本番モード（PM2等）で動かしている場合、ソースコードを書き換えただけでは反映されません。
**解決策:** 以下の手順で「ビルド」をやり直す必要があります。
```bash
cd ~/switchbot-web-app
pm2 stop switchbot-app
npm run build      # ソースを機械用に変換する作業
pm2 restart switchbot-app
```

#### Q. ブラウザで「Failed to fetch」や CORS エラーが出る
ブラウザの高度なセキュリティ機能が通信をブロックしている可能性があります。
**解決策:** 
1. `http://pi4-sb1.local:3000` ではなく、**IPアドレス**（例: `http://192.168.x.x:3000`）でアクセスしてみてください。
2. それでもダメな場合は、Chromeの設定で `chrome://flags/#block-insecure-private-network-requests` を **Disabled** に設定して再起動してください。

#### Q. 履歴（history.json）が記録されない / 権限エラーが出る
同期（scp）を行うと、ファイルの所有権が変わってしまい、プログラムが書き込めなくなることがあります。
**解決策:** 以下のコマンドでフォルダ全体の所有権を現在のユーザーに戻してください。
```bash
sudo chown -R $USER:$USER ~/switchbot-web-app
sudo chmod -R 777 ~/switchbot-web-app/data
```

#### Q. PM2のインストール時 (npm install -g pm2) に "EACCES: permission denied" エラーが出る
**解決策:** コマンドの先頭に `sudo` を付けて実行してください。
```bash
sudo npm install -g pm2
```

---

## 6. Raspberry Piでの開発 (Antigravity連携)

作成した **`open-switchbot-remote.bat`** を実行すると、VS Code がラズパイに接続された状態で立ち上がります。
この窓で私（Antigravity）に指示を出せば、ラズパイ上のファイルを直接編集し、そのままアプリに反映させることができます。
*(※ 編集後は上記の「ビルド」手順を忘れないようにしてください)*
