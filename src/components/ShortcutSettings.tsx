import { useEffect, useState } from 'react';
import { extensionApi, sendExtensionMessage } from '../extensionApi';
import type { Language } from '../i18n';
import { t } from '../i18n';

const COMMAND_NAME = 'add-current-page';

interface ShortcutSettingsProps {
  language: Language;
}

export function ShortcutSettings({ language }: ShortcutSettingsProps) {
  const [shortcut, setShortcut] = useState('Alt+Shift+F');
  const [canEditInline, setCanEditInline] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    extensionApi?.commands?.getAll().then(commands => {
      const command = commands.find(item => item.name === COMMAND_NAME);
      if (command?.shortcut) setShortcut(command.shortcut);
      setCanEditInline(Boolean(extensionApi?.commands?.update));
    }).catch(() => undefined);
  }, []);

  const handleSave = async () => {
    if (!extensionApi?.commands?.update) return;
    try {
      await extensionApi.commands.update({ name: COMMAND_NAME, shortcut });
      setStatus(t(language, 'shortcutSaved'));
    } catch {
      setStatus(t(language, 'shortcutInvalid'));
    }
  };

  const openBrowserSettings = async () => {
    if (extensionApi?.commands?.openShortcutSettings) {
      await extensionApi.commands.openShortcutSettings();
      return;
    }
    await sendExtensionMessage({ type: 'open-shortcut-settings' });
  };

  return (
    <section className="settings-section">
      <div className="settings-section-title">{t(language, 'shortcutTitle')}</div>
      <p className="settings-help">{t(language, 'shortcutHelp')}</p>
      {canEditInline ? (
        <div className="settings-input-row">
          <input value={shortcut} onChange={event => setShortcut(event.target.value)} placeholder="Alt+Shift+F" />
          <button type="button" onClick={handleSave}>{t(language, 'shortcutSave')}</button>
        </div>
      ) : (
        <button type="button" className="wide-settings-button" onClick={openBrowserSettings}>
          {t(language, 'shortcutOpenSettings')}（{t(language, 'shortcutCurrent')}：{shortcut || t(language, 'shortcutUnset')}）
        </button>
      )}
      {status && <p className="settings-status">{status}</p>}
    </section>
  );
}
