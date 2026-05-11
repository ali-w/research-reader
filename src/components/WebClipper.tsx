import { useState, useRef } from 'react';
import { Article } from '../types';
import { initiatePdfUpload, confirmPdfUpload } from '../sync';

type ClipperPhase = 'form' | 'saving' | 'describing' | 'uploading' | 'confirming' | 'done' | 'error';
type ClipperMode = 'webpage' | 'pdf';

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
  onPdfUploaded: (article: Article) => void;
  allTags: string[];
  isOnline: boolean;
  feedEndpoint: string;
  apiKey: string;
}

function WebClipper({ onClose, onClip, onPdfUploaded, allTags, isOnline, feedEndpoint, apiKey }: WebClipperProps) {
  const [mode, setMode] = useState<ClipperMode>('webpage');

  // Webpage state
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);

  // PDF state
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfTitle, setPdfTitle] = useState('');
  const [pdfType, setPdfType] = useState<'typed' | 'handwritten'>('typed');
  const [extractOcr, setExtractOcr] = useState(true);
  const [pdfTags, setPdfTags] = useState<string[]>([]);
  const [pdfTagInput, setPdfTagInput] = useState('');
  const [showPdfTagSuggestions, setShowPdfTagSuggestions] = useState(false);
  const [pdfSummary, setPdfSummary] = useState('');

  const [phase, setPhase] = useState<ClipperPhase>('form');
  const [errorMsg, setErrorMsg] = useState('');

  const tagInputRef = useRef<HTMLInputElement>(null);
  const pdfTagInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSubmitWeb = url.trim() !== '' && title.trim() !== '';
  const canSubmitPdf = pdfFile !== null && pdfTitle.trim() !== '';

  // Webpage tag helpers
  const webTagSuggestions = tagInput.trim()
    ? allTags.filter((t) => t.toLowerCase().includes(tagInput.toLowerCase()) && !tags.includes(t))
    : allTags.filter((t) => !tags.includes(t));

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    setTags([...tags, trimmed]);
    setTagInput('');
    setShowTagSuggestions(false);
  };

  const removeTag = (tag: string) => setTags(tags.filter((t) => t !== tag));

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput); }
    else if (e.key === 'Escape') setShowTagSuggestions(false);
  };

  // PDF tag helpers
  const pdfTagSuggestions = pdfTagInput.trim()
    ? allTags.filter((t) => t.toLowerCase().includes(pdfTagInput.toLowerCase()) && !pdfTags.includes(t))
    : allTags.filter((t) => !pdfTags.includes(t));

  const addPdfTag = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed || pdfTags.includes(trimmed)) return;
    setPdfTags([...pdfTags, trimmed]);
    setPdfTagInput('');
    setShowPdfTagSuggestions(false);
  };

  const removePdfTag = (tag: string) => setPdfTags(pdfTags.filter((t) => t !== tag));

  const handlePdfTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addPdfTag(pdfTagInput); }
    else if (e.key === 'Escape') setShowPdfTagSuggestions(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      setErrorMsg('File is too large. Maximum size is 50 MB.');
      setPhase('error');
      return;
    }
    setPdfFile(file);
    if (!pdfTitle) {
      setPdfTitle(file.name.replace(/\.pdf$/i, '').replace(/[-_]/g, ' '));
    }
  };

  const handleClip = async (useAI: boolean) => {
    if (!canSubmitWeb) return;
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

  const handleUploadPdf = async () => {
    if (!canSubmitPdf || !pdfFile) return;
    setPhase('uploading');
    try {
      const { id, upload_url, gcs_uri } = await initiatePdfUpload(
        {
          title: pdfTitle.trim(),
          pdfType,
          extractOcr,
          tags: pdfTags,
          summary: pdfSummary.trim() || undefined,
        },
        feedEndpoint,
        apiKey
      );

      // PUT the file directly to GCS via the signed URL.
      // Use arrayBuffer() so the browser doesn't override Content-Type from the File object.
      const putRes = await fetch(upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/pdf' },
        body: await pdfFile.arrayBuffer(),
      });
      if (!putRes.ok) throw new Error(`GCS upload failed: ${putRes.status}`);

      setPhase('confirming');
      await confirmPdfUpload(id, gcs_uri, feedEndpoint, apiKey);

      const noAiWork = !extractOcr && pdfSummary.trim() !== '';
      const now = new Date();
      const article: Article = {
        id: String(id),
        title: pdfTitle.trim(),
        link: gcs_uri,
        content: pdfSummary.trim(),
        pubDate: now,
        source: 'PDF Upload',
        status: 'unread',
        saved: true,
        tags: pdfTags,
        contentType: 'pdf',
        pdfType,
        processingStatus: noAiWork ? 'done' : 'pending',
        cachedContentUrl: gcs_uri,
        notes: '',
        createdAt: now,
        updatedAt: now,
      };

      onPdfUploaded(article);
      setPhase('done');
      setTimeout(() => onClose(), 1500);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed');
      setPhase('error');
    }
  };

  const isBusy = phase === 'saving' || phase === 'describing' || phase === 'uploading' || phase === 'confirming' || phase === 'done';

  const statusMessage =
    phase === 'saving' ? 'Saving…' :
    phase === 'describing' ? 'Generating description…' :
    phase === 'uploading' ? 'Uploading PDF…' :
    phase === 'confirming' ? 'Processing…' :
    phase === 'done' ? (mode === 'pdf' ? 'Uploaded!' : 'Clipped!') : '';

  const handleModeChange = (newMode: ClipperMode) => {
    if (isBusy) return;
    setMode(newMode);
    setPhase('form');
    setErrorMsg('');
  };

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
            <button
              className={`clipper-tab${mode === 'webpage' ? ' active' : ''}`}
              onClick={() => handleModeChange('webpage')}
              disabled={isBusy}
            >
              Web Page
            </button>
            <button
              className={`clipper-tab${mode === 'pdf' ? ' active' : ''}`}
              onClick={() => handleModeChange('pdf')}
              disabled={isBusy}
            >
              PDF
            </button>
          </div>

          {isBusy ? (
            <div className="clipper-status">{statusMessage}</div>
          ) : phase === 'error' ? (
            <div className="clipper-status clipper-error">
              <p>{errorMsg}</p>
              <button className="save-btn" onClick={() => setPhase('form')}>Try again</button>
            </div>
          ) : mode === 'webpage' ? (
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
                      <button className="tag-remove" onClick={() => removeTag(tag)} aria-label={`Remove tag ${tag}`}>×</button>
                    </span>
                  ))}
                </div>
                <div className="tag-input-row">
                  <div className="tag-input-wrapper">
                    <input
                      ref={tagInputRef}
                      type="text"
                      className="tag-input"
                      placeholder="Add a tag..."
                      value={tagInput}
                      onChange={(e) => { setTagInput(e.target.value); setShowTagSuggestions(true); }}
                      onFocus={() => setShowTagSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowTagSuggestions(false), 150)}
                      onKeyDown={handleTagKeyDown}
                    />
                    {showTagSuggestions && webTagSuggestions.length > 0 && (
                      <ul className="tag-suggestions">
                        {webTagSuggestions.map((tag) => (
                          <li key={tag} onMouseDown={() => addTag(tag)}>{tag}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <button
                    className="tag-add-btn"
                    onClick={() => addTag(tagInput)}
                    disabled={!tagInput.trim()}
                    aria-label="Add tag"
                  >
                    Add
                  </button>
                </div>
              </div>

              <div className="settings-section">
                <h3>Summary <span className="hint-inline">(optional)</span></h3>
                <textarea
                  className="clipper-summary-input"
                  placeholder="Optional description or notes…"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={4}
                />
              </div>

              <div className="button-row">
                <button className="save-btn" disabled={!canSubmitWeb} onClick={() => handleClip(false)}>
                  Clip
                </button>
                <button
                  className={`fetch-btn${!canSubmitWeb || !isOnline ? ' disabled' : ''}`}
                  disabled={!canSubmitWeb || !isOnline}
                  title={!isOnline ? 'Requires internet connection' : undefined}
                  onClick={() => handleClip(true)}
                >
                  Clip &amp; Describe with AI
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="settings-section">
                <h3>PDF File *</h3>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  className="rss-url-input"
                  onChange={handleFileChange}
                />
                {pdfFile && (
                  <p className="hint-inline" style={{ marginTop: '4px' }}>
                    {pdfFile.name} ({(pdfFile.size / 1024 / 1024).toFixed(1)} MB)
                  </p>
                )}
              </div>

              <div className="settings-section">
                <h3>Document Type *</h3>
                <div className="button-row" style={{ gap: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="pdfType"
                      value="typed"
                      checked={pdfType === 'typed'}
                      onChange={() => setPdfType('typed')}
                    />
                    Typed document
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="pdfType"
                      value="handwritten"
                      checked={pdfType === 'handwritten'}
                      onChange={() => setPdfType('handwritten')}
                    />
                    Handwritten notes
                  </label>
                </div>
              </div>

              <div className="settings-section">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={extractOcr}
                    onChange={(e) => setExtractOcr(e.target.checked)}
                  />
                  <span>Extract text for PDF search</span>
                </label>
              </div>

              <div className="settings-section">
                <h3>Title *</h3>
                <input
                  type="text"
                  className="rss-url-input"
                  placeholder="Document title"
                  value={pdfTitle}
                  onChange={(e) => setPdfTitle(e.target.value)}
                />
              </div>

              <div className="settings-section">
                <h3>Tags</h3>
                <div className="tag-chips">
                  {pdfTags.map((tag) => (
                    <span key={tag} className="tag-chip">
                      {tag}
                      <button className="tag-remove" onClick={() => removePdfTag(tag)} aria-label={`Remove tag ${tag}`}>×</button>
                    </span>
                  ))}
                </div>
                <div className="tag-input-row">
                  <div className="tag-input-wrapper">
                    <input
                      ref={pdfTagInputRef}
                      type="text"
                      className="tag-input"
                      placeholder="Add a tag..."
                      value={pdfTagInput}
                      onChange={(e) => { setPdfTagInput(e.target.value); setShowPdfTagSuggestions(true); }}
                      onFocus={() => setShowPdfTagSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowPdfTagSuggestions(false), 150)}
                      onKeyDown={handlePdfTagKeyDown}
                    />
                    {showPdfTagSuggestions && pdfTagSuggestions.length > 0 && (
                      <ul className="tag-suggestions">
                        {pdfTagSuggestions.map((tag) => (
                          <li key={tag} onMouseDown={() => addPdfTag(tag)}>{tag}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <button
                    className="tag-add-btn"
                    onClick={() => addPdfTag(pdfTagInput)}
                    disabled={!pdfTagInput.trim()}
                    aria-label="Add tag"
                  >
                    Add
                  </button>
                </div>
              </div>

              <div className="settings-section">
                <h3>Summary <span className="hint-inline">(optional — AI will generate if blank)</span></h3>
                <textarea
                  className="clipper-summary-input"
                  placeholder="Optional summary or description…"
                  value={pdfSummary}
                  onChange={(e) => setPdfSummary(e.target.value)}
                  rows={4}
                />
              </div>

              <div className="button-row">
                <button
                  className="save-btn"
                  disabled={!canSubmitPdf || !isOnline}
                  title={!isOnline ? 'Requires internet connection' : undefined}
                  onClick={handleUploadPdf}
                >
                  Upload PDF
                </button>
              </div>
              {!isOnline && (
                <p className="hint-inline" style={{ marginTop: '8px' }}>
                  PDF upload requires an internet connection.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default WebClipper;
