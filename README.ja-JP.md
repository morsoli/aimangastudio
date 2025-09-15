# AIMangaStudio

[![中文](https://img.shields.io/badge/-中文-0078D7?style=flat-square)](./README.md) [![English](https://img.shields.io/badge/-English-4CAF50?style=flat-square)](./README.en-US.md) [![日本語](https://img.shields.io/badge/-日本語-F44336?style=flat-square)](./README.ja-JP.md)

AIを活用してマンガを制作するためのツールで、脚本生成、絵コンテレイアウト、キャラクタースタイル管理をサポートします。

## プロジェクト概要
AIMangaStudio は、創作者やスタジオ向けに、ストーリー生成、コマ割り、キャラクターデザイン、ページ連続性の解析を統合したエンドツーエンドの制作パイプラインを提供し、脚本から完成ページまでのワークフローを簡素化します。

## 主な機能
- 自然言語によるマンガ脚本生成（ストーリー、セリフ、ナレーション）
- AIによる絵コンテ自動配置（吹き出し、カメラワーク）
- キャラクターとスタイル設定（複数の描画スタイルに対応）
- 複数ページのエクスポート（PNG、PDF）
- 制作履歴とバージョン管理

## クイックスタート
### 要件
- Node.js（推奨 18+）
- npm または yarn

### インストール
```bash
npm install
# または
# yarn
```

### 開発
```bash
npm run dev
```

### ビルドとプレビュー
```bash
npm run build
npm run preview
```

## 技術スタック
- フロントエンド: React + Vite + TypeScript
- AI: Google GenAI（`@google/genai` を使用）
- デプロイ: Vercel / Netlify / Docker（対応）

## 対象ユーザー
- 個人クリエイター
- マンガ愛好家
- コンテンツ制作スタジオ
- ソーシャルメディアクリエイター

## コントリビュート
Issue や PR を歓迎します。コードスタイルと貢献ガイドに従ってください。

## ライセンス
MIT
