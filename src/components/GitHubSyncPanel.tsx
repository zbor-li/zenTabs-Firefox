import { useEffect, useState } from 'react';
import { connectGitHub, downloadBackup, uploadBackup } from '../githubSync';
import { getStoredValue, STORAGE_KEYS } from '../storage';
import type { Language } from '../i18n';
import { t } from '../i18n';

interface GitHubSyncPanelProps {
  language: Language;
}

export function GitHubSyncPanel({ language }: GitHubSyncPanelProps) {
  const [token, setToken] = useState('');
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getStoredValue<string>(STORAGE_KEYS.githubToken).then(saved => {
      if (saved) {
        setToken(saved);
        setConnected(true);
      }
    }).catch(() => undefined);
  }, []);

  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    setStatus('');
    try {
      setStatus(await action());
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t(language, 'githubActionFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handleConnect = () => run(async () => {
    const result = await connectGitHub(token, language);
    setConnected(true);
    return result.gistId
      ? t(language, 'githubConnectedBackup', { login: result.login })
      : t(language, 'githubConnected', { login: result.login });
  });

  const handleUpload = () => run(async () => {
    const result = await uploadBackup(language);
    return t(language, 'githubUploaded', {
      time: new Date(result.exportedAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US'),
    });
  });

  const handleDownload = () => run(async () => {
    await downloadBackup(language, setStatus);
    setTimeout(() => window.location.reload(), 700);
    return t(language, 'githubRestoring');
  });

  return (
    <section className="settings-section github-sync-panel">
      <div className="settings-section-title">
        <span>{t(language, 'githubSync')}</span>
        <span className={`sync-dot ${connected ? 'connected' : ''}`} />
      </div>
      <p className="settings-help">{t(language, 'githubHelp')}</p>
      <div className="settings-input-row">
        <input
          type="password"
          value={token}
          onChange={event => {
            setToken(event.target.value);
            setConnected(false);
            setStatus('');
          }}
          placeholder="github_pat_…"
          autoComplete="off"
        />
        <button type="button" onClick={handleConnect} disabled={busy}>{t(language, 'githubConnect')}</button>
      </div>
      <div className="settings-button-row">
        <button type="button" onClick={handleUpload} disabled={busy || !connected}>{t(language, 'githubUpload')}</button>
        <button type="button" onClick={handleDownload} disabled={busy || !connected}>{t(language, 'githubRestore')}</button>
      </div>
      <a
        className="settings-link"
        href="https://github.com/settings/personal-access-tokens/new"
        target="_blank"
        rel="noreferrer"
      >{t(language, 'githubCreateToken')}</a>
      {status && <p className="settings-status">{status}</p>}
    </section>
  );
}
