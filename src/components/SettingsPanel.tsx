import { useState, useEffect } from 'react';
import EmailTagMappings from './EmailTagMappings';
import {
  isPushSupported,
  getNotificationPermission,
  getExistingPushSubscription,
  subscribeToPush,
  unsubscribeFromPush,
  triggerLocalTestNotification,
  loadTopicPreferences,
  saveTopicPreferences,
} from '../notifications';

interface SettingsPanelProps {
  readerRoot: string;
  summarizeRoot: string;
  apiKey: string;
  meditationMinutes: number;
  allSenderEmails: string[];
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
  allSenderEmails,
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

  // Push Notifications & Curation State
  const [pushSupported] = useState(() => isPushSupported());
  const [permission, setPermission] = useState<NotificationPermission>(() => getNotificationPermission());
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [vapidKeyInput, setVapidKeyInput] = useState(() => localStorage.getItem('push_vapid_public_key') || '');
  const [pushServiceInput, setPushServiceInput] = useState(() => localStorage.getItem('push_service_root') || '');
  const [interestedInput, setInterestedInput] = useState('');
  const [excludedInput, setExcludedInput] = useState('');
  const [savingPrefs, setSavingPrefs] = useState(false);

  useEffect(() => {
    if (pushSupported) {
      getExistingPushSubscription()
        .then((sub) => setIsSubscribed(!!sub))
        .catch(() => {});
      setPermission(getNotificationPermission());
    }

    loadTopicPreferences(readerRoot, apiKey)
      .then((prefs) => {
        setInterestedInput(prefs.interested.join(', '));
        setExcludedInput(prefs.excluded.join(', '));
      })
      .catch(() => {});
  }, [pushSupported, readerRoot, apiKey]);

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

  const handleTogglePush = async () => {
    if (!pushSupported) {
      alert('Push notifications are not supported in this browser.');
      return;
    }
    setPushLoading(true);
    try {
      if (isSubscribed) {
        const ok = await unsubscribeFromPush(readerRoot, apiKey);
        if (ok) {
          setIsSubscribed(false);
          alert('Push notifications disabled.');
        } else {
          alert('Failed to unsubscribe from push notifications.');
        }
      } else {
        if (!vapidKeyInput.trim()) {
          alert('Please enter your VAPID Public Key first.');
          return;
        }
        await subscribeToPush(vapidKeyInput.trim(), readerRoot, apiKey);
        setIsSubscribed(true);
        setPermission(getNotificationPermission());
        alert('Push notifications enabled for this Android device!');
      }
    } catch (err: unknown) {
      alert(`Notification setup error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPushLoading(false);
    }
  };

  const handleTestNotification = async () => {
    try {
      await triggerLocalTestNotification();
    } catch (err: unknown) {
      alert(`Test notification error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleSaveTopics = async () => {
    setSavingPrefs(true);
    try {
      const interested = interestedInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const excluded = excludedInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      await saveTopicPreferences({ interested, excluded }, readerRoot, apiKey);
      alert('Curation topic preferences saved!');
    } catch (err: unknown) {
      alert(`Error saving topics: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSavingPrefs(false);
    }
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
            <h3>Email Tag Mappings</h3>
            <p className="hint">
              Newsletters from a mapped sender are automatically tagged when received.
            </p>
            <EmailTagMappings
              feedEndpoint={readerRoot}
              apiKey={apiKey}
              allSenderEmails={allSenderEmails}
              isOnline={isOnline}
            />
          </section>

          <section className="settings-section">
            <h3>Android Push Notifications</h3>
            <p className="hint">
              Enables push notifications for curated articles on weekdays at 8:00 AM and 6:00 PM.
              Includes an interactive <strong>Tag for Later</strong> button on your lock screen/tray.
            </p>
            <div style={{ marginBottom: '12px', fontSize: '14px', lineHeight: '1.6' }}>
              <div>
                <strong>Device Support:</strong> {pushSupported ? '✅ Supported' : '❌ Not supported'}
              </div>
              <div>
                <strong>Android Permission:</strong>{' '}
                <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{permission}</span>
              </div>
              <div>
                <strong>Push Status:</strong>{' '}
                <span style={{ fontWeight: 600, color: isSubscribed ? 'var(--color-success, #2e7d32)' : 'inherit' }}>
                  {isSubscribed ? '🔔 Subscribed' : '🔕 Inactive'}
                </span>
              </div>
            </div>

            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
              Curator Service URL (Cloud Run)
            </label>
            <input
              type="url"
              value={pushServiceInput}
              onChange={(e) => {
                setPushServiceInput(e.target.value);
                localStorage.setItem('push_service_root', e.target.value);
              }}
              className="rss-url-input"
              placeholder="e.g. https://research-reader-curator-xxx.run.app"
            />

            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
              VAPID Public Key
            </label>
            <input
              type="text"
              value={vapidKeyInput}
              onChange={(e) => {
                setVapidKeyInput(e.target.value);
                localStorage.setItem('push_vapid_public_key', e.target.value);
              }}
              className="rss-url-input"
              placeholder="Paste backend VAPID public key (base64)"
            />

            <div className="button-row" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                className="save-btn"
                onClick={handleTogglePush}
                disabled={pushLoading || !pushSupported}
              >
                {pushLoading
                  ? 'Updating…'
                  : isSubscribed
                  ? 'Disable Notifications'
                  : 'Enable Android Notifications'}
              </button>
              <button
                className="fetch-btn"
                onClick={handleTestNotification}
                disabled={!pushSupported}
                title="Trigger local test notification on device"
              >
                Send Test Notification
              </button>
            </div>
          </section>

          <section className="settings-section">
            <h3>Curated Article Preferences</h3>
            <p className="hint">
              Controls Gemini's weekday curation scan across unread articles from the past 14 days and all articles flagged for Later.
            </p>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
              Topics of Interest (comma-separated)
            </label>
            <input
              type="text"
              value={interestedInput}
              onChange={(e) => setInterestedInput(e.target.value)}
              className="rss-url-input"
              placeholder="e.g. AI, Agentic Workflows, Distributed Systems"
            />

            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
              Topics to Exclude (comma-separated)
            </label>
            <input
              type="text"
              value={excludedInput}
              onChange={(e) => setExcludedInput(e.target.value)}
              className="rss-url-input"
              placeholder="e.g. Crypto, Politics, Celebrity News"
            />

            <button
              className="save-btn"
              onClick={handleSaveTopics}
              disabled={savingPrefs}
            >
              {savingPrefs ? 'Saving…' : 'Save Curation Topics'}
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
