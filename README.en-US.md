# AIMangaStudio

[![中文](https://img.shields.io/badge/-中文-0078D7?style=flat-square)](./README.md) [![English](https://img.shields.io/badge/-English-4CAF50?style=flat-square)](./README.en-US.md) [![日本語](https://img.shields.io/badge/-日本語-F44336?style=flat-square)](./README.ja-JP.md)


A tool that uses AI to create manga, supporting script generation, storyboard layout, and character style control.

## Project Overview
AIMangaStudio provides an end-to-end pipeline for manga creators and studios, integrating story generation, panel layout, character design, and page continuity analysis to streamline the process from script to finished pages.

## Key Features
- Natural language manga script generation (story, dialogue, narration)
- AI-driven storyboard layout (speech bubbles, camera cuts)
- Character and style configuration (multiple art styles supported)
- Multi-page export (PNG, PDF)
- Creation history and versioning

## Quick Start
### Requirements
- Node.js (recommended 18+)
- npm or yarn

### Install
```bash
npm install
# or
# yarn
```

### Development
```bash
npm run dev
```

### Build & Preview
```bash
npm run build
npm run preview
```

## Tech Stack
- Frontend: React + Vite + TypeScript
- AI: Google GenAI (via `@google/genai`)
- Deployment: Vercel / Netlify / Docker (supported)

## Target Users
- Independent creators
- Manga enthusiasts
- Content studios
- Social media creators

## Contributing
Contributions welcome — please open issues or PRs and follow code style and contribution guidelines.


## License
MIT
