import { useState } from 'react';

interface SettingsPanelProps {
  readerRoot: string;
  summarizeRoot: string;
  apiKey: string;
  meditationMinutes: number;
  onSaveEndpoint: (url: string) => void;
  onSaveSummarizeEndpoint: (url: string) => void;
  onSaveApiKey: (key: string) => void;
  onSaveMeditationMinutes: (minutes: number) => void;
  onFetchArticles: (url: string) => void;
  onClearAndRefresh: (url: string) => void;
  onClose: () => void;
  isOnline: boolean;
}

function SettingsPanel({
  readerRoot,
  summarizeRoot,
  apiKey,
  meditationMinutes,
  onSaveEndpoint,
  onSaveSummarizeEndpoint,
  onSaveApiKey,
  onSaveMeditationMinutes,
  onFetchArticles,
  onClearAndRefresh,
  onClose,
  isOnline,
}: SettingsPanelProps) {
  const [endpointInput, setEndpointInput] = useState(readerRoot);
  const [summarizeInput, setSummarizeInput] = useState(summarizeRoot);
  const [apiKeyInput, setApiKeyInput] = useState(apiKey);
  const [meditationInput, setMeditationInput] = useState(meditationMinutes);

  const handleSaveEndpoint = () => {
    onSaveEndpoint(endpointInput);
    alert('Feed endpoint saved!');
  };

  const handleSaveSummarize = () => {
    onSaveSummarizeEndpoint(summarizeInput);
    alert('Summarize endpoint saved!');
  };

  const handleSaveApiKey = () => {
    onSaveApiKey(apiKeyInput);
    alert('API key saved!');
  };

  const handleFetch = () => {
    if (!endpointInput.trim()) {
      alert('Please enter an endpoint URL');
      return;
    }
    onSaveEndpoint(endpointInput);
    onFetchArticles(endpointInput);
  };

  return (
    <div className="settings-overlay">
      <div className="settings-panel">
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="settings-content">
          <section className="settings-section">
            <h3>Reader API Root</h3>
            <p className="hint">
              Root URL of the reader API (e.g. https://reader-api-ufwk6luuiq-ew.a.run.app).
            </p>
            <input
              type="url"
              value={endpointInput}
              onChange={(e) => setEndpointInput(e.target.value)}
              className="rss-url-input"
              disabled={!isOnline}
            />
            <div className="button-row">
              <button className="save-btn" onClick={handleSaveEndpoint}>
                Save URL
              </button>
              <button
                className={`fetch-btn ${!isOnline ? 'disabled' : ''}`}
                onClick={handleFetch}
                disabled={!isOnline}
              >
                Fetch Articles
              </button>
            </div>
            {!isOnline && (
              <p className="warning">You must be online to fetch new articles</p>
            )}
          </section>

          <section className="settings-section">
            <h3>Summarize API Root</h3>
            <p className="hint">
              Root URL of the summarize API (e.g. https://summarize-ufwk6luuiq-ew.a.run.app).
            </p>
            <input
              type="url"
              value={summarizeInput}
              onChange={(e) => setSummarizeInput(e.target.value)}
              className="rss-url-input"
            />
            <button className="save-btn" onClick={handleSaveSummarize}>
              Save URL
            </button>
          </section>

          <section className="settings-section">
            <h3>API Key</h3>
            <p className="hint">
              Sent as <code>X-Api-Key</code> header on all requests.
            </p>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              className="rss-url-input"
              placeholder="Enter API key"
            />
            <button className="save-btn" onClick={handleSaveApiKey}>
              Save Key
            </button>
          </section>

          <section className="settings-section">
            <h3>Meditation Duration</h3>
            <p className="hint">Length of each meditation session in minutes.</p>
            <input
              type="number"
              min={1}
              max={120}
              value={meditationInput}
              onChange={(e) => setMeditationInput(Math.max(1, parseInt(e.target.value) || 1))}
              className="rss-url-input"
              style={{ width: '80px' }}
            />
            <button className="save-btn" onClick={() => onSaveMeditationMinutes(meditationInput)}>
              Save
            </button>
          </section>

          <section className="settings-section">
            <h3>Danger Zone</h3>
            <p className="hint">
              Deletes all stored articles and reloads everything from the feed endpoint.
              Your notes, ratings, and read status will be lost.
            </p>
            <button
              className={`clear-refresh-btn ${!isOnline ? 'disabled' : ''}`}
              onClick={() => onClearAndRefresh(endpointInput)}
              disabled={!isOnline}
            >
              Clear All &amp; Refresh from Feed
            </button>
          </section>

          <section className="settings-section">
            <h3>About</h3>
            <p>
              Research Reader v1.0.0
              <br />
              A personal research and note-taking app with offline support.
            </p>
            <p className="hint">All data is stored locally on your device.</p>
          </section>
        </div>
      </div>
    </div>
  );
}

export default SettingsPanel;
