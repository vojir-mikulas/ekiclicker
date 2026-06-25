import { useState } from 'react';

/* Zobrazí kód pro obnovu (= token) s tlačítkem Kopírovat. */
export default function RecoveryCode({ code }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard nedostupný — uživatel zkopíruje ručně */
    }
  };
  return (
    <div className="recovery">
      <code className="recovery-code" onClick={copy} title="Klikni pro kopírování">{code}</code>
      <button className="ghost-btn" onClick={copy}>{copied ? '✓ Zkopírováno' : '📋 Kopírovat'}</button>
    </div>
  );
}
