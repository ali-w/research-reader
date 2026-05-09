# Research Reader

A Progressive Web App (PWA) for personal research and note-taking, designed to work seamlessly with the [Newsletter Processor](https://github.com/ali-w/Newsletter-Processor) and optimized for e-ink devices like the Boox tablet.

## Features

✅ **Offline-First Architecture**
- Read articles without internet connection
- Local IndexedDB storage for all data
- Visual indicators for online/offline status
- Sync queue for changes made offline

✅ **Article Management**
- Fetch articles from RSS/Atom feeds
- Mark as read, skipped, or unread
- 5-star rating system
- Personal notes on every article

✅ **AI-Powered Summaries**
- Generate personalized summaries using Claude AI
- Combines article content with your notes
- Written from your perspective
- Easy sharing via clipboard or native share

✅ **E-Ink Optimized**
- High contrast, minimal design
- No gradients or complex animations
- Clear typography and spacing
- Works great on Boox tablets and other e-ink devices

✅ **Cross-Platform**
- Runs on any device with a modern browser
- Installable as a native app on Android/iOS
- Desktop and mobile responsive

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- An Anthropic API key (for AI summaries) - get one at [console.anthropic.com](https://console.anthropic.com/)

### Installation

1. **Clone or download this project**

```bash
cd research-reader
```

2. **Install dependencies**

```bash
npm install
```

3. **Start the development server**

```bash
npm run dev
```

4. **Open in your browser**

Navigate to `http://localhost:5173`

### Building for Production

```bash
npm run build
```

The built files will be in the `dist/` directory. You can serve them with any static file server:

```bash
npm run preview
```

## Usage Guide

### First Time Setup

1. **Add Your API Key**
   - Click the ⚙ settings button in the header
   - Enter your Anthropic API key
   - Click "Save API Key"

2. **Add RSS Feeds**
   - In Settings, enter your RSS feed URL
   - This can be from Newsletter Processor or any standard RSS/Atom feed
   - Click "Fetch Articles" to import

### Reading Workflow

1. **Browse Articles**
   - Use the filter bar to view All, Unread, Read, or Skipped articles
   - Click an article to open it in the reader

2. **Annotate & Rate**
   - Mark status (Read/Skipped)
   - Rate with 1-5 stars
   - Add personal notes
   - Click "Save Notes" to persist changes

3. **Generate Summaries**
   - Click "Generate Summary" to create an AI summary
   - The summary combines the article with your notes
   - Click "Show" to view, "Share Summary" to export

### Offline Mode

- The app works offline after initial load
- Offline status is shown in the header
- Summary generation requires internet (greyed out when offline)
- RSS fetching requires internet
- All reading and note-taking works offline

### Installing as an App

**On Android:**
1. Open the app in Chrome
2. Tap the menu (⋮) → "Install app" or "Add to Home screen"
3. Launch from your home screen like any app

**On iOS:**
1. Open in Safari
2. Tap Share → "Add to Home Screen"
3. Launch from your home screen

**On Desktop:**
1. Open in Chrome/Edge
2. Click the install icon in the address bar
3. Or use the browser menu → "Install Research Reader"

## Architecture

### Tech Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **IndexedDB** (via `idb`) - Local data storage
- **Service Workers** (via `vite-plugin-pwa`) - Offline support
- **Anthropic API** - AI summary generation

### Data Storage

All data is stored locally in your browser using IndexedDB:

- **Articles** - Full article content, metadata, ratings, notes, summaries
- **RSS Feeds** - Feed URLs and last fetch timestamps
- **Pending Sync** - Queue of operations performed while offline

### Key Files

```
src/
├── types.ts           # TypeScript interfaces
├── db.ts              # IndexedDB operations
├── rss.ts             # RSS feed parsing
├── llm.ts             # Claude API integration
├── App.tsx            # Main application
├── components/
│   ├── ArticleList.tsx       # Article list sidebar
│   ├── ArticleReader.tsx     # Article reading interface
│   └── SettingsPanel.tsx     # Settings overlay
└── App.css            # E-ink optimized styles
```

## Integration with Newsletter Processor

This app is designed to work with the [Newsletter Processor](https://github.com/ali-w/Newsletter-Processor):

1. Set up Newsletter Processor to generate an RSS feed
2. Add that RSS feed URL in Settings
3. Fetch articles to import them into Research Reader
4. Articles are stored locally for offline reading

You can also use any standard RSS/Atom feed from other sources.

## API Key Security

- Your API key is stored only in browser localStorage
- It never leaves your device except when making API calls to Anthropic
- No server stores or logs your key
- Clear your browser data to remove the key

## Browser Compatibility

- **Chrome/Edge 90+** ✅
- **Firefox 88+** ✅
- **Safari 14+** ✅
- **Mobile browsers** ✅

## Deployment Options

### Static Hosting

Deploy the `dist/` folder to:
- **Netlify** - Drag and drop the dist folder
- **Vercel** - Import from Git
- **GitHub Pages** - Use the gh-pages branch
- **Cloudflare Pages** - Connect your repository
- **Any static host** - Just upload the files

### Self-Hosting

```bash
npm run build
cd dist
python -m http.server 8000
# Or use nginx, Apache, etc.
```

## Customization

### Changing the Theme

Edit `src/App.css` CSS variables:

```css
:root {
  --bg-primary: #ffffff;
  --text-primary: #000000;
  --accent-color: #000000;
  /* ... etc */
}
```

### Adding Features

The codebase is straightforward TypeScript/React:
- Add new article fields in `types.ts`
- Extend database schema in `db.ts`
- Create new components in `components/`

## Troubleshooting

**Articles not loading?**
- Check you're online when fetching RSS
- Verify the RSS feed URL is correct
- Check browser console for errors

**Summaries failing?**
- Verify your API key is correct
- Check you're online (required for API calls)
- Ensure you have API credits in your Anthropic account

**App not installing?**
- Try Chrome or Edge for best PWA support
- Check the site is served over HTTPS (required for PWA)

**Data disappeared?**
- IndexedDB data is tied to the domain
- Clearing browser data removes all articles
- Export important summaries before clearing data

## Future Enhancements

Potential additions:
- [ ] Export data to JSON/CSV
- [ ] Import from OPML
- [ ] Full-text search
- [ ] Tags and categories
- [ ] Dark mode toggle
- [ ] Cloud sync (optional)
- [ ] Multiple feed management UI
- [ ] Reading statistics

## License

MIT License - feel free to use and modify as needed.

## Support

For issues related to:
- **Newsletter Processor** - See the [Newsletter Processor repo](https://github.com/ali-w/Newsletter-Processor)
- **This app** - Open an issue or submit a PR

## Credits

Built with ❤️ for researchers who want a distraction-free reading experience.
