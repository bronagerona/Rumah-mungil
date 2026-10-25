# PROJECT WINGMATE — prototype

## Initial spec
- Autonomous companion AI
- Portrait vertical scrolling shooter inspired by classic 1945 arcade games
- Classic arcade visual direction
- Mobile touch controls; keyboard fallback for desktop
- Auto-fire, multiple enemy types, waves, boss every fifth wave, XP/levels, credits, upgrades, pickups, repair, burst dodge, Wing Strike, local save

## Run
Open `index.html` in a modern browser. This prototype is standalone and uses Canvas 2D. No build step is required.

## SmolLM integration status
`smollm-adapter.js` probes for an explicitly supplied local bridge exposing `generate(prompt, options)` on `window.SmolLMBridge`, `window.smollmBridge`, `window.LocalLLM`, or `window.localLLM`. If none exists, gameplay uses a deterministic fallback companion. The adapter does **not** bundle a model or claim that SmolLM is running. A concrete Android runtime/bridge must be selected and tested before marking local model integration complete.

Expected bridge contract:
```js
window.SmolLMBridge = {
  async generate(prompt, options) {
    // Forward to the installed local SmolLM runtime and return text.
    return { text: "patrol" };
  }
};
```

## Loader / Build 24
The Build 24 loader source has not yet been located in the repository paths inspected so far. This prototype is kept in `wingmate/` so the existing `index.html` life-simulation game is not overwritten. Loader integration remains pending until the exact Build 24 loader file/source is identified and verified. Build 21 is explicitly not used.
