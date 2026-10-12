/**
 * Módulo Central de Gerenciamento de Chaves da Gemini (showreellyon)
 *
 * As chaves são informadas pelo usuário na engrenagem e armazenadas EXCLUSIVAMENTE
 * no localStorage do navegador. Nenhuma chave é lida de variáveis de ambiente
 * (process.env ou import.meta.env), garantindo total segurança e conformidade
 * com deploys no Render, Vercel ou qualquer outro host sem exigir Secrets.
 */

export interface KeyPool {
  keys: string[];
  count: number;
  hasKeys: boolean;
  getKey: (sceneIdx?: number) => string;
}

export function cleanKey(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return '';
  const cleaned = raw
    .trim()
    .replace(/^(?:export\s+)?(?:VITE_)?(?:GEMINI|GOOGLE)_?API_?KEY(?:_[12])?\s*=\s*/i, '')
    .replace(/^['"`]+|['"`]+$/g, '')
    .replace(/\s+/g, '')
    .trim();

  if (
    !cleaned ||
    cleaned === 'MY_GEMINI_API_KEY' ||
    cleaned === 'YOUR_API_KEY' ||
    cleaned === 'undefined' ||
    cleaned === 'null' ||
    cleaned.length < 8
  ) {
    return '';
  }
  return cleaned;
}

/**
 * getKeys(): lê "gemini_key_1" e "gemini_key_2" do localStorage e retorna só as que não estão vazias.
 * Também faz fallback para chaves legadas já salvas no navegador para conveniência do usuário.
 */
export function getKeys(): string[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const k1 = cleanKey(
      localStorage.getItem('gemini_key_1') ||
      localStorage.getItem('GEMINI_API_KEY_1') ||
      localStorage.getItem('GEMINI_API_KEY')
    );
    const k2 = cleanKey(
      localStorage.getItem('gemini_key_2') ||
      localStorage.getItem('GEMINI_API_KEY_2')
    );

    const keys: string[] = [];
    if (k1) keys.push(k1);
    if (k2 && !keys.includes(k2)) keys.push(k2);
    return keys;
  } catch {
    return [];
  }
}

/**
 * Retorna as duas chaves individualmente para preenchimento dos campos da engrenagem.
 */
export function getIndividualKeys(): { key1: string; key2: string } {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { key1: '', key2: '' };
  }
  try {
    const k1 = cleanKey(
      localStorage.getItem('gemini_key_1') ||
      localStorage.getItem('GEMINI_API_KEY_1') ||
      localStorage.getItem('GEMINI_API_KEY')
    );
    const k2 = cleanKey(
      localStorage.getItem('gemini_key_2') ||
      localStorage.getItem('GEMINI_API_KEY_2')
    );
    return { key1: k1, key2: k2 };
  } catch {
    return { key1: '', key2: '' };
  }
}

/**
 * saveKeys(k1, k2): salva no localStorage (faz trim, e aceita uma chave só ou as duas).
 */
export function saveKeys(
  k1?: string | null,
  k2?: string | null
): { key1: string; key2: string; keys: string[] } {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { key1: '', key2: '', keys: [] };
  }
  const clean1 = cleanKey(k1);
  const clean2 = cleanKey(k2);

  try {
    if (clean1) {
      localStorage.setItem('gemini_key_1', clean1);
      // sincroniza chave legada caso outro componente leia
      localStorage.setItem('GEMINI_API_KEY_1', clean1);
      localStorage.setItem('GEMINI_API_KEY', clean1);
    } else {
      localStorage.removeItem('gemini_key_1');
      localStorage.removeItem('GEMINI_API_KEY_1');
      localStorage.removeItem('GEMINI_API_KEY');
    }

    if (clean2) {
      localStorage.setItem('gemini_key_2', clean2);
      localStorage.setItem('GEMINI_API_KEY_2', clean2);
    } else {
      localStorage.removeItem('gemini_key_2');
      localStorage.removeItem('GEMINI_API_KEY_2');
    }
  } catch {
    // ignora restrição de quota do localStorage
  }

  const valid = getKeys();
  return { key1: clean1, key2: clean2, keys: valid };
}

/**
 * hasKeys(): true se existir pelo menos uma chave configurada.
 */
export function hasKeys(): boolean {
  return getKeys().length > 0;
}

/**
 * Limpa todas as chaves salvas no localStorage.
 */
export function clearKeys(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.removeItem('gemini_key_1');
    localStorage.removeItem('gemini_key_2');
    localStorage.removeItem('GEMINI_API_KEY_1');
    localStorage.removeItem('GEMINI_API_KEY_2');
    localStorage.removeItem('GEMINI_API_KEY');
  } catch {
    // ignora
  }
}

/**
 * createKeyPool(getKeys()): gerencia o pool de chaves e a alternância entre cenas.
 * Cena 1 (idx 0) -> chave 1
 * Cena 2 (idx 1) -> chave 2
 * Cena 3 (idx 2) -> chave 1
 * Se só existir uma chave, usa ela em todas as cenas.
 */
export function createKeyPool(keys?: string[]): KeyPool {
  const source = Array.isArray(keys) ? keys : getKeys();
  const valid = source.map(cleanKey).filter((k) => k.length >= 8);

  return {
    keys: valid,
    count: valid.length,
    hasKeys: valid.length > 0,
    getKey: (sceneIdx = 0) => {
      if (valid.length === 0) return '';
      return valid[Math.max(0, sceneIdx) % valid.length];
    },
  };
}

/**
 * Testa uma chave fazendo uma chamada mínima à API REST do Gemini.
 * Retorna true se a chave for válida e autorizada.
 */
export async function testGeminiKey(
  rawKey: string
): Promise<{ valid: boolean; statusText: string; errorDetail?: string }> {
  const key = cleanKey(rawKey);
  if (!key) {
    return { valid: false, statusText: 'Chave vazia ou inválida' };
  }

  const url = 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1';
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'x-goog-api-key': key,
      },
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    if (resp.ok) {
      return { valid: true, statusText: 'Válida e Conectada ✓' };
    }

    const bodyText = await resp.text();
    let detail = `HTTP ${resp.status}`;
    try {
      const parsed = JSON.parse(bodyText);
      if (parsed?.error?.message) {
        detail = `${parsed.error.message.slice(0, 90)}`;
      }
    } catch {
      // ignora
    }

    return {
      valid: false,
      statusText: `Inválida (${detail})`,
      errorDetail: detail,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Falha na conexão';
    return {
      valid: false,
      statusText: `Erro de conexão (${msg.slice(0, 50)})`,
      errorDetail: msg,
    };
  }
}
