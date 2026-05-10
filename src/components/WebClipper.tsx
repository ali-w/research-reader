import { useState, useRef } from 'react';

type ClipperPhase = 'form' | 'saving' | 'describing' | 'done' | 'error';

interface WebClipperProps {
  onClose: () => void;
  onClip: (data: {
    url: string;
    title: string;
    summary?: string;
    tags: string[];
    contentType: 'webpage';
    useAI: boolean;
    onPhaseChange: (phase: 'describing') => void;
  }) => Promise<void>;
  allTags: string[];
  isOnline: boolean;
}

function WebClipper({ onClose, onClip, allTags, isOnline }: WebClipperProps) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const [phase, setPhase] = useState<ClipperPhase>('form');
  const [errorMsg, setErrorMsg] = useState('');
  const tagInputRef = useRef<HTMLInputElement>(null);

  const canSubmit = url.trim() !== '' && title.trim() !== '';

  const tagSuggestions = tagInput.trim()
    ? allTags.filter(
        (t) => t.toLowerCase().includes(tagInput.toLowerCase()) && !tags.includes(t)
      )
    : allTags.filter((t) => !tags.includes(t));

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    setTags([...tags, trimmed]);
    setTagInput('');
    setShowTagSuggestions(false);
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(tagInput);
    } else if (e.key === 'Escape') {
      setShowTagSuggestions(false);
    }
  };

  const handleClip = async (useAI: boolean) => {
    if (!canSubmit) return;
    setPhase('saving');
    try {
      await onClip({
        url: url.trim(),
        title: title.trim(),
        summary: summary.trim() || undefined,
        tags,
        contentType: 'webpage',
        useAI,
        onPhaseChange: (p) => setPhase(p),
      });
      setPhase('done');
      setTimeout(() => onClose(), 1000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
      setPhase('error');
    }
  };

  const statusMessage =
    phase === 'saving' ? 'Saving…' :
    phase === 'describing' ? 'Generating description…' :
    phase === 'done' ? 'Clipped!' : '';

  const isBusy = phase === 'saving' || phase === 'describing' || phase === 'done';

  return (
    <div
      className="settings-overlay"
      onClick={(e) => { if (e.target === e.currentTarget && !isBusy) onClose(); }}
    >
      <div className="settings-panel">
        <div className="settings-header">
          <h2>Web Clipper</h2>
          <button className="close-btn" onClick={onClose} disabled={isBusy} aria-label="Close">✕</button>
        </div>
        <div className="settings-content">
          <div className="clipper-type-tabs">
            <button className="clipper-tab active">Web Page</button>
            <button className="clipper-tab" disabled title="Coming soon">PDF 🔒</button>
          </div>

          {isBusy ? (
            <div className="clipper-status">{statusMessage}</div>
          ) : phase === 'error' ? (
            <div className="clipper-status clipper-error">
              <p>{errorMsg}</p>
              <button className="save-btn" onClick={() => setPhase('form')}>Try again</button>
            </div>
          ) : (
            <>
              <div className="settings-section">
                <h3>URL *</h3>
                <input
                  type="url"
                  className="rss-url-input"
                  placeholder="https://..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>

              <div className="settings-section">
                <h3>Title *</h3>
                <input
                  type="text"
                  className="rss-url-input"
                  placeholder="Article title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="settings-section">
                <h3>Tags</h3>
                <div className="tag-chips">
                  {tags.map((tag) => (
                    <span key={tag} className="tag-chip">
                      {tag}
                      <button
                        className="tag-remove"
                        onClick={() => removeTag(tag)}
                        aria-label={`Remove tag ${tag}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="tag-input-wrapper">
                  <input
                    ref={tagInputRef}
                    type="text"
                    className="tag-input"
                    placeholder="Add a tag..."
                    value={tagInput}
                    onChange={(e) => {
                      setTagInput(e.target.value);
                      setShowTagSuggestions(true);
                    }}
                    onFocus={() => setShowTagSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowTagSuggestions(false), 150)}
                    onKeyDown={handleTagKeyDown}
                  />
                  {showTagSuggestions && tagSuggestions.length > 0 && (
                    <ul className="tag-suggestions">
                      {tagSuggestions.map((tag) => (
                        <li key={tag} onMouseDown={() => addTag(tag)}>
                          {tag}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="settings-section">
                <h3>
                  Summary <span className="hint-inline">(optional)</span>
                </h3>
                <textarea
                  className="clipper-summary-input"
                  placeholder="Optional description or notes…"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={4}
                />
              </div>

              <div className="button-row">
                <button
                  className="save-btn"
                  disabled={!canSubmit}
                  onClick={() => handleClip(false)}
                >
                  Clip
                </button>
                <button
                  className={`fetch-btn${!canSubmit || !isOnline ? ' disabled' : ''}`}
                  disabled={!canSubmit || !isOnline}
                  title={!isOnline ? 'Requires internet connection' : undefined}
                  onClick={() => handleClip(true)}
                >
                  Clip &amp; Describe with AI
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default WebClipper;
