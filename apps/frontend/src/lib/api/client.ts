interface TauriInternals {
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
}

const DEFAULT_API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:49152/api';
let resolvedApiUrl: string = DEFAULT_API_URL;
let resolvePromise: Promise<string> | null = null;

export async function resolveApiUrl(): Promise<string> {
  if (resolvePromise) {
    return resolvePromise;
  }

  resolvePromise = (async () => {
    try {
      const internals = (window as unknown as { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__;
      if (internals?.invoke) {
        const url = (await internals.invoke('get_backend_url')) as string | null | undefined;
        if (url && typeof url === 'string' && url.startsWith('http')) {
          resolvedApiUrl = url;
          return resolvedApiUrl;
        }
      }
    } catch {
      // Entorno navegador web o sin Tauri internals
    }

    resolvedApiUrl = DEFAULT_API_URL;
    return resolvedApiUrl;
  })();

  return resolvePromise;
}

export function getApiUrlSync(): string {
  return resolvedApiUrl;
}

export function setApiUrl(url: string) {
  resolvedApiUrl = url;
}

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError;
}

async function fetchWithRetry(url: string, options?: RequestInit): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, options);

      if (response.status >= 500 && attempt < MAX_ATTEMPTS) {
        lastError = new Error(`API Error: ${response.status} ${response.statusText}`);
        await sleep(RETRY_DELAY_MS);
        continue;
      }

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      return response;
    } catch (error) {
      lastError = error;

      if (isNetworkError(error) && attempt < MAX_ATTEMPTS) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }

      throw error;
    }
  }

  throw lastError ?? new Error('No se pudo conectar con la API');
}

export async function apiClient<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const baseUrl = await resolveApiUrl();
  const response = await fetchWithRetry(`${baseUrl}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
