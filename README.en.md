# Roleplay Hub

[简体中文](./README.md) | **English**

[![License: CC BY-NC 4.0](https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc/4.0/)
[![Vue](https://img.shields.io/badge/Vue-3-4FC08D.svg?logo=vue.js)](https://vuejs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![DaisyUI](https://img.shields.io/badge/DaisyUI-5A0EF8?logo=daisyui&logoColor=white)](https://daisyui.com/)

> **A roleplay chat and character card creation tool that primarily stores data locally in your browser.**

**Disclaimer and Licensing Notice**

This project is open source under **[CC BY-NC 4.0 (Creative Commons Attribution-NonCommercial 4.0 International)](./LICENSE)**. **Commercial use is strictly prohibited, including selling the project as a service, bundling it into paid products, or monetizing it through advertising.** Users must comply with the license and respect the original author's right to attribution. The author reserves the right to pursue legal remedies for unauthorized commercial use.

---

## Quick Start

### 1. Download and Run

Download and extract the project, then double-click `index.html` to open it.

### 2. Initial Setup

1. Open **Settings** from the navigation menu. Choose a provider or use the single **Custom** connection.
2. Enter your API URL and key, then select a chat model. The API must be compatible with Chat Completions. Use the service's base URL or a URL ending in `/v1`; do not include `/chat/completions`.
3. Open **Character Card Management** to import a JSON / PNG card or create a new one. The Character Card Workshop can also generate, edit, and export cards, with one-click import and play.
4. Configure a summary model, embedding model, image generation key, and Tavily key as needed. Features you do not use require no setup.

The API must allow requests from your browser page through CORS. A working webpage and a valid key do not necessarily mean the API permits direct browser access.

## Memory, Tools, and Compatibility Mode

### Memory System

- **Basic Mode**: A summary model creates a memory for each conversation turn. Beyond the “Keep Recent Messages” limit, older AI response bodies are replaced with their corresponding summaries in the outgoing context. The original chat is not deleted.
- **Enhanced Mode**: Reuses the same summaries and generates embeddings from each original user input and its corresponding summary. Based on the latest input, it retrieves up to **10 memories** with a similarity of at least **48%**, appending them to the latest user message in their original chronological order for the current request only.
- **Secondary Compression**: Individual summaries are kept for the most recent **25 turns**. Earlier history is compressed in groups of **5 turn positions**. Confirmed empty turns without response text can be skipped; turns with response text but failed summaries must be filled in. Original per-turn summaries remain stored after compression. Enhanced retrieval uses those per-turn summaries, not the compressed groups.
- **Backfill**: A dialog shows progress and estimated completion times for per-turn summaries, embeddings, and secondary compression as needed. Enhanced Mode requires an embedding model for backfill. After changing embedding models, regenerate the embeddings. Background backfill waits for the current response to finish before continuing.

A message and a turn are different units: one user input followed by one AI response normally counts as two messages and one turn. Legacy Vector Mode settings migrate to Enhanced Mode, but old response chunks do not automatically become the new vector memories. Storage Management counts them as unused leftovers that can be removed after user confirmation.

### Tools

- **Keyword Search**: Finds original text snippets in the current conversation history. It does not search the web.
- **Web Search**: Uses Tavily to search the web or read webpages. Requires a separately configured Tavily API key.
- **Random Generation**: The model supplies a lower and upper bound, and the program generates a random integer including both endpoints. Alternatively, it can supply candidate names, such as items or locations, and the program selects one with equal probability. User-specified ranges or choices are preserved; duplicate names count only once.

Tool usage can be set to **Adaptive** or **Forced**. Both the model and API must support `tools` / `tool_choice`. The search result count setting does not change Enhanced Memory's fixed maximum of 10 retrieved memories.

### Gemini Anti-Truncation

Gemini Anti-Truncation in the main chat submits response text through the `output_reply` tool. It does not provide unlimited continuation or increase the model's output limit. If no tool response text is returned but regular response text is available, the regular text is displayed. Automatic retries occur only when the response contains no text, reasoning, or tool calls, with a maximum of **3 requests in total**. APIs without tool support may still fail.

The Character Card Workshop's **Compatibility Mode Retry** also submits content through a tool instead of switching to a non-streaming request.

---

## Directory Structure

```text
RP-Hub/
├── index.html                     # Main interface and script entry point
├── character/                     # Character card generation tool
│   └── index.html
├── novel/                         # Novel generation and editing
│   └── index.html
├── assets/
│   ├── css/
│   │   ├── styles.css             # Main page styles
│   │   └── theme.css              # Shared design tokens (palette, shadows, motion, dark mode)
│   └── js/
│       ├── built-in-content.js    # Default presets, mode prompts, artist tags, and announcements
│       ├── core-utils.js          # Shared utilities, character card handling, and configuration
│       ├── api-utils.js           # HTTP, streaming, tool calls, and empty-response retries
│       ├── data-services.js       # Storage, memory, context, branches, and UI state
│       ├── runtime-services.js    # Message rendering, usage tracking, and storage management
│       ├── tailwind-theme.js      # Shared Tailwind config; colors read theme.css tokens
│       ├── theme.js               # Theme persistence and embedded page synchronization
│       ├── update-check.js        # Optional remote version checks
│       ├── ui-components.js       # Navigation, selectors, dialogs, and page components
│       └── app.js                 # Main application logic and page state
├── presence-server/               # Optional update-check service, not a chat backend
│   └── README.md                  # Deployment, environment variables, and endpoints
├── LICENSE
├── README.en.md                   # English documentation
└── README.md                      # Chinese documentation (default)
```

### Optional Update-Check Service

Set the service URL in `rphub-update-api` in `index.html`; leave it empty to disable remote version checks. The main page checks approximately every 20 seconds while visible. Failures do not affect chat. The service does not store chats, character cards, or API keys, and no longer tracks online user counts.

Deploying the service requires Node.js 20 or later. See [`presence-server/README.md`](./presence-server/README.md) for details. You do not need to deploy it to use the main webpage. If you maintain your own fork, also change the version file URL read by the service to avoid receiving update notifications for the upstream project.

---

## License

This project follows:

**[Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)](https://creativecommons.org/licenses/by-nc/4.0/)**

- **You may**: Share the work in any medium or format, and adapt, transform, or build upon it.
- **You must comply with**:
  - **Attribution**: Give appropriate credit, link to the license, and indicate whether changes were made.
  - **NonCommercial**: **You may not use the work or adaptations for commercial purposes.** Selling it, integrating it into paid subscriptions, or monetizing it through advertising is prohibited.
- For commercial licensing, contact the original author directly.

See the [`LICENSE`](./LICENSE) file in the project root for the full terms.
