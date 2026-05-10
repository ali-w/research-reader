# Research Reader

An offline-first Progressive Web App (PWA) for reading, annotating, and managing articles delivered by the [Newsletter Processor](https://github.com/ali-w/Newsletter-Processor) backend. Optimised for e-ink devices (Boox tablets) and works on any modern mobile or desktop browser.

## Features

**Article management**
- Filter by All / Unread / Read / Skipped / Saved
- Full-text search across title, content, notes, and AI summary
- Tag filtering — add and browse tags on any article
- 5-star rating system
- Personal notes per article
- Shuffle order for discovery

**Reading**
- Inline article content (newsletter summary)
- Link to original page
- View server-cached HTML copy when available (💾 badge)

**Web Clipper**
- Manually add any web page by URL and title
- Optional AI-generated description on clip
- Clipped articles go straight into the Saved list

**AI summaries**
- Generate per-article summaries via the Summarize API
- Regenerate at any time
- Share via clipboard or native share sheet

**Offline-first sync**
- All data stored locally in IndexedDB
- Changes made offline are queued and flushed on reconnect
- Delta sync on startup: pulls only articles changed since last sync, then pushes pending local changes
- Server wins on conflict (stale local patches are discarded for server-updated articles)

**PWA**
- Installable on Android, iOS, and desktop
- Works fully offline after first load

---

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- A running instance of the Reader API and Summarize API

### Installation

```bash
npm install
npm run dev        # development server at http://localhost:5173
npm run build      # production build → dist/
npm run preview    # preview the production build locally
```

---

## Configuration

Open the ⚙ settings panel in the app header. Three values are stored in `localStorage`:

| Setting | `localStorage` key | Description |
|---|---|---|
| Reader API Root | `reader_api_root` | Root URL of the Reader API, e.g. `https://reader-api-example.run.app` |
| Summarize API Root | `summarize_api_root` | Root URL of the Summarize API, e.g. `https://summarize-example.run.app` |
| API Key | `api_key` | Shared key sent as `X-Api-Key` on all API requests, and as `?secret=` for cached-content |

The app also stores `last_sync_at` (ISO timestamp) in `localStorage` to track the last successful delta sync.

---

## API Contract

The app expects two backend services. All endpoints that require authentication use the `X-Api-Key: <key>` request header.

### Reader API

**Base URL:** configured as `reader_api_root`

#### `GET /articles`

Fetch articles for the current user.

| Parameter | Type | Description |
|---|---|---|
| `limit` | query | Maximum results to return (app sends `200`) |
| `updated_since` | query (optional) | ISO 8601 timestamp — return only articles updated after this time |

**Response:** JSON array of article objects.

```jsonc
[
  {
    "id": 42,
    "title": "Article title",
    "url": "https://example.com/article",
    "summary": "Newsletter summary text",
    "newsletter_name": "My Newsletter",
    "received_at": "2025-01-15T10:00:00Z",
    "status": "unread",           // "unread" | "read" | "skipped"
    "saved": false,
    "rating": null,               // 1–5 or null
    "notes": "",
    "tags": [],
    "content_type": "newsletter", // see content types below
    "cached_content_url": null,   // gs:// URI or null
    "cached_at": null,            // ISO timestamp or null
    "updated_at": "2025-01-15T10:00:00Z",
    "note_updated_at": null
  }
]
```

**Content type values:** `newsletter`, `article`, `video`, `podcast`, `webpage`, `notebook`, `pdf`, `other`

---

#### `PATCH /articles/:id`

Update a single article's user-editable fields. Body is a partial object — only include fields that changed.

```jsonc
{
  "status": "read",       // optional: "unread" | "read" | "skipped"
  "saved": true,          // optional: boolean
  "rating": 4,            // optional: 1–5 or null
  "notes": "My thoughts", // optional: string
  "tags": ["ai", "research"] // optional: replaces tag set entirely
}
```

**Response:** 200 OK (body ignored by the frontend).

---

#### `POST /articles`

Create a new article (used by the Web Clipper).

```jsonc
{
  "title": "Article title",          // required
  "url": "https://example.com",      // required
  "summary": "Optional description", // optional
  "tags": ["tag1"],                  // optional
  "content_type": "webpage",         // optional, defaults to "newsletter"
  "saved": true                      // optional
}
```

**Response:** JSON object containing at minimum `{ "id": <number> }`. The full article object is also accepted.

---

#### `POST /articles/updates`

Batch update multiple articles in a single request (used when flushing the offline sync queue).

**Request body:** array of patch objects, each including the article `id`:

```jsonc
[
  { "id": 42, "status": "read" },
  { "id": 43, "rating": 3, "tags": ["ml"] }
]
```

**Response:** array of successfully updated articles:

```jsonc
[
  { "id": 42, "updated_at": "2025-01-16T09:00:00Z" },
  { "id": 43, "updated_at": "2025-01-16T09:00:01Z" }
]
```

Articles not present in the response are treated as failed and retained in the sync queue.

---

### Summarize API

**Base URL:** configured as `summarize_api_root`

#### `GET /articles/:id/summary`

Generate an AI summary for the article. The backend reads the article from the Reader API and produces a personalised summary.

**Response:** plain text summary string (not JSON).

---

#### `GET /articles/:id/describe`

Generate an AI description and suggest a tag. Called after a Web Clipper save when "Clip & Describe with AI" is chosen.

**Response:**

```jsonc
{
  "summary": "Generated description of the article",
  "suggestedTag": "ai"
}
```

---

#### `GET /articles/:id/cached-content?secret=<key>`

Serve a server-cached HTML copy of the article page. The frontend opens this URL directly in a new browser tab — it is not fetched via JavaScript. Authentication is via the `secret` query parameter (same value as the API key).

The Reader API populates `cached_content_url` and `cached_at` on an article asynchronously after it is marked `saved: true` (typically within 5–20 seconds). The frontend polls once ~20 s after a save to pick up the cached content indicator.

---

## Sync Behaviour

The app uses a pull-before-push delta sync strategy designed to handle multiple devices:

1. **On startup / reconnect:** call `GET /articles?updated_since=<last_sync_at>` to fetch server changes.
2. For each returned article: save locally and remove any pending local sync entry for that article (server state takes precedence).
3. After pulling, flush remaining pending sync entries via `POST /articles/updates` (articles the server did not touch retain their local queued changes).
4. Store the current timestamp as `last_sync_at`.

This means a device that was offline for days will not overwrite server state — it will only push changes for articles that were not touched by the server while it was offline.

---

## Architecture

### Tech Stack

| Layer | Technology |
|---|---|
| UI framework | React 18 + TypeScript |
| Build tool | Vite + `vite-plugin-pwa` |
| Local storage | IndexedDB via `idb` |
| Offline support | Service Worker (Workbox, auto-update) |
| Date formatting | `date-fns` |

### Local Database

IndexedDB database name: `research-reader-db` (schema version 2)

| Store | Key | Indexes |
|---|---|---|
| `articles` | `id` (string) | `by-status`, `by-date`, `by-source`, `by-tag` (multiEntry) |
| `feeds` | `url` | — |
| `pendingSync` | `id` (article id) | — |

Pending sync entries for the same article are coalesced — multiple offline changes to one article produce a single queued patch.

### Key Files

```
src/
├── types.ts                      # TypeScript interfaces (Article, SyncStatus)
├── db.ts                         # IndexedDB CRUD and pending sync operations
├── rss.ts                        # Reader API fetch + article mapping
├── sync.ts                       # PATCH / POST sync operations
├── llm.ts                        # Summarize API calls
├── App.tsx                       # Main application, state, handlers
├── components/
│   ├── ArticleList.tsx           # Left-panel article list
│   ├── ArticleReader.tsx         # Right-panel reader and annotation UI
│   ├── SettingsPanel.tsx         # Settings overlay
│   └── WebClipper.tsx            # Web clipper overlay
└── App.css                       # E-ink optimised styles
```

---

## Installing as an App

**Android (Chrome):** Menu → Install app / Add to Home screen

**iOS (Safari):** Share → Add to Home Screen

**Desktop (Chrome / Edge):** Install icon in the address bar, or browser menu → Install Research Reader

---

## Browser Compatibility

| Browser | Support |
|---|---|
| Chrome / Edge 90+ | Full |
| Firefox 88+ | Full |
| Safari 14+ | Full (PWA install via Safari on iOS) |
| Mobile browsers | Full |

---

## Deployment

Build produces a static `dist/` folder. Deploy to any static host:

- **Netlify / Vercel / Cloudflare Pages** — connect your repository or drag-and-drop `dist/`
- **GitHub Pages** — copy `dist/` to the `gh-pages` branch
- **Self-hosted:**

```bash
npm run build
cd dist
python -m http.server 8000
```

The app must be served over HTTPS for the PWA install prompt and Service Worker to work.

---

## Troubleshooting

**Articles not loading after changing the Reader API root**
The Service Worker aggressively caches assets. After a config change, reload with the cache bypassed: DevTools → Application → Service Workers → "Update on reload", or use an incognito window.

**Sync shows pending changes that never clear**
Open DevTools → Console and look for `POST /articles/updates` errors. The most common cause is an incorrect API key or the Reader API being unreachable.

**Cached content badge (💾) not appearing after saving**
The server caches asynchronously. The frontend polls once ~20 s after saving. If it still doesn't appear, use the ↻ Refresh button on the article reader to pull the latest server state.

**Data disappeared**
IndexedDB data is scoped to the origin. Clearing browser site data removes all articles. Use the ↻ Refresh button (or Settings → Fetch Articles) to repopulate from the server.

---

## License

MIT — feel free to use and modify.
