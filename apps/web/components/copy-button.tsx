'use client';

import { useState } from 'react';

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
    setTimeout(() => setState('idle'), 2500);
  }

  return (
    <button type="button" className="button secondary" onClick={copy}>
      {state === 'copied' ? 'Copiado' : state === 'failed' ? 'Não foi possível copiar' : label}
    </button>
  );
}
