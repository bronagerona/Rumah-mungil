# Rumah Mungil Android — Groq Cloud

This branch is the cloud-only Sari AI build. It removes the local GGUF picker and `llama.rn` native dependency to reduce Android build time.

## How to use

1. Create a Groq API key at https://console.groq.com/keys.
2. Install the debug APK from the `Build Groq Cloud APK` workflow artifact.
3. Open the app, paste your own API key, and start the game.
4. Keep an internet connection active while playing.

The API key is kept in app memory for the current session and is not bundled into the APK or saved permanently. This prototype calls Groq directly from the app; for a publicly distributed app, a backend proxy is safer because client-side API keys can potentially be extracted.

Groq endpoint: `https://api.groq.com/openai/v1/chat/completions`
Model: `openai/gpt-oss-20b`

The game still validates the action returned by the AI. Money, needs, time, relationships, and game mechanics remain local game logic.

The original local-model workflow and Build #32 baseline are not modified by this cloud-only branch.
