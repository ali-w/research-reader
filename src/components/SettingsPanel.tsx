import { useState } from 'react';

interface SettingsPanelProps {
  apiKey: string;
  endpointUrl: string;
  onSaveApiKey: (key: string) => void;
  onSaveEndpoint: (url: string) => void;
  onFetchArticles: (url: string) => void;
  onClose: () => void;
  isOnline: boolean;
}

function SettingsPanel({
  apiKey,
  endpointUrl,
  onSaveApiKey,
  onSaveEndpoint,
  onFetchArticles,
  onClose,
  isOnline,
}: SettingsPanelProps) {
  const [apiKeyInput, setApiKeyInput] = useState(apiKey);
  const [endpointInput, setEndpointInput] = useState(endpointUrl);

  const handleSaveKey = () => {
    onSaveApiKey(apiKeyInput);
    alert('API key saved successfully!');
  };

  const handleSaveEndpoint = () => {
    onSaveEndpoint(endpointInput);
    alert('Endpoint URL saved!');
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
            <h3>Anthropic API Key</h3>
            <p className="hint">
              Required for AI-powered summary generation. Get your key from{' '}
              <a
                href="https://console.anthropic.com/"
                target="_blank"
                rel="noopener noreferrer"
              >
                console.anthropic.com
              </a>
            </p>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="sk-ant-..."
              className="api-key-input"
            />
            <button className="save-btn" onClick={handleSaveKey}>
              Save API Key
            </button>
          </section>

          <section className="settings-section">
            <h3>Article Feed Endpoint</h3>
            <p className="hint">
              URL of the JSON endpoint that provides newsletter articles.
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
            <h3>About</h3>
            <p>
              Research Reader v1.0.0
              <br />
              A personal research and note-taking app with offline support.
            </p>
            <p className="hint">
              All data is stored locally on your device. Your API key never leaves your browser.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

export default SettingsPanel;
