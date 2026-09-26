export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

interface ZodFlatten {
  formErrors?: string[];
  fieldErrors?: Record<string, string[] | undefined>;
}

function describe(data: { error?: string; details?: ZodFlatten } | null, status: number): string {
  const base = data?.error ?? `Ошибка ${status}`;
  const fields = data?.details?.fieldErrors;
  if (fields) {
    const parts = Object.entries(fields)
      .filter(([, v]) => v?.length)
      .map(([k, v]) => `${k}: ${v!.join(', ')}`);
    if (parts.length) return `${base} (${parts.join('; ')})`;
  }
  return base;
}

/** Событие для админки: сессия истекла — нужно снова войти. */
export const UNAUTHORIZED_EVENT = 'admin:unauthorized';

export async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Нет соединения с сервером');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && url.startsWith('/api/admin') && !url.endsWith('/login')) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    throw new ApiError(res.status, describe(data, res.status), data?.details);
  }
  return data as T;
}

export const http = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body ?? {}),
  del: <T = void>(url: string) => request<T>('DELETE', url),
};

/** Загрузка файла с прогрессом (fetch не умеет сообщать прогресс отправки). */
export function uploadFile<T>(url: string, file: File, onProgress?: (fraction: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.withCredentials = true;
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response as T);
      else {
        if (xhr.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
        reject(new ApiError(xhr.status, describe(xhr.response, xhr.status)));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, 'Нет соединения с сервером'));
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : 'Неизвестная ошибка');
