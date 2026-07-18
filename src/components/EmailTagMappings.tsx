import { useState, useEffect } from 'react';
import { EmailTagMapping } from '../types';
import {
  fetchEmailTagMappings,
  upsertEmailTagMapping,
  deleteEmailTagMapping,
  slugifyTag,
} from '../mappings';
import { format } from 'date-fns';

interface EmailTagMappingsProps {
  feedEndpoint: string;
  apiKey: string;
  allSenderEmails: string[];
  isOnline: boolean;
}

function EmailTagMappings({ feedEndpoint, apiKey, allSenderEmails, isOnline }: EmailTagMappingsProps) {
  const [mappings, setMappings] = useState<EmailTagMapping[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [emailInput, setEmailInput] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const result = await fetchEmailTagMappings(feedEndpoint, apiKey);
      setMappings(result);
    } catch {
      setLoadError('Failed to load mappings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOnline) load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const resetForm = () => {
    setEmailInput('');
    setTagInput('');
    setEditingEmail(null);
    setFormError('');
  };

  const startEdit = (mapping: EmailTagMapping) => {
    setEmailInput(mapping.email);
    setTagInput(mapping.tag);
    setEditingEmail(mapping.email);
    setFormError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = emailInput.trim().toLowerCase();
    const tag = slugifyTag(tagInput);

    if (!email || !email.includes('@')) {
      setFormError('Enter a valid email address.');
      return;
    }
    if (!tag) {
      setFormError('Tag is required.');
      return;
    }

    setFormError('');
    setSubmitting(true);
    try {
      const saved = await upsertEmailTagMapping({ email, tag }, feedEndpoint, apiKey);
      setMappings((prev) => {
        const withoutExisting = prev.filter((m) => m.email !== saved.email);
        return [saved, ...withoutExisting];
      });
      resetForm();
    } catch {
      setFormError('Failed to save mapping. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await deleteEmailTagMapping(id, feedEndpoint, apiKey);
      setMappings((prev) => prev.filter((m) => m.id !== id));
    } catch {
      setLoadError('Failed to delete mapping. Please try again.');
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  return (
    <div className="mapping-container">
      {loading && <p className="hint">Loading mappings…</p>}

      {!loading && loadError && (
        <p className="warning">
          {loadError}{' '}
          <button type="button" className="save-btn" onClick={load}>
            Retry
          </button>
        </p>
      )}

      {!loading && !loadError && mappings.length === 0 && (
        <p className="hint">
          No mappings configured. Add one below to automatically tag articles by sender.
        </p>
      )}

      {!loading && mappings.length > 0 && (
        <table className="mapping-table">
          <thead>
            <tr>
              <th>Sender Email</th>
              <th>Auto-Tag</th>
              <th>Added</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {mappings.map((m) => (
              <tr key={m.id} className="mapping-row">
                <td>{m.email}</td>
                <td>
                  <span className="article-tag-chip">{m.tag}</span>
                </td>
                <td>{format(new Date(m.createdAt), 'd MMM yyyy')}</td>
                <td>
                  {confirmDeleteId === m.id ? (
                    <span className="mapping-confirm-delete">
                      Are you sure?{' '}
                      <button
                        type="button"
                        className="mapping-btn mapping-btn-danger"
                        disabled={deletingId === m.id}
                        onClick={() => handleDelete(m.id)}
                      >
                        {deletingId === m.id ? 'Deleting…' : 'Confirm'}
                      </button>{' '}
                      <button
                        type="button"
                        className="mapping-btn"
                        disabled={deletingId === m.id}
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <span className="mapping-actions">
                      <button type="button" className="mapping-btn" onClick={() => startEdit(m)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="mapping-btn mapping-btn-danger"
                        onClick={() => setConfirmDeleteId(m.id)}
                      >
                        Delete
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form className="mapping-form" onSubmit={handleSubmit}>
        <input
          type="email"
          className="rss-url-input"
          placeholder="governors@newsletter.com"
          value={emailInput}
          onChange={(e) => setEmailInput(e.target.value)}
          disabled={editingEmail !== null || submitting}
          list="sender-email-history"
        />
        <datalist id="sender-email-history">
          {allSenderEmails.map((email) => (
            <option key={email} value={email} />
          ))}
        </datalist>
        <input
          type="text"
          className="rss-url-input"
          placeholder="governors"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onBlur={() => setTagInput((t) => slugifyTag(t))}
          disabled={submitting}
        />
        <div className="button-row">
          <button type="submit" className="save-btn" disabled={submitting}>
            {editingEmail ? 'Update mapping' : 'Add mapping'}
          </button>
          {editingEmail && (
            <button type="button" className="mapping-btn" onClick={resetForm} disabled={submitting}>
              Cancel
            </button>
          )}
        </div>
      </form>
      {formError && <p className="warning">{formError}</p>}
    </div>
  );
}

export default EmailTagMappings;
