async function request(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text.slice(0, 300) };
  }

  if (!res.ok) {
    const err = new Error(data?.error || `Fehler ${res.status}`);
    err.status = res.status;
    err.details = data?.details;
    throw err;
  }
  return data;
}

export const api = {
  meta: () => request('GET', '/api/meta'),
  state: () => request('GET', '/api/state'),
  saveSettings: (settings) => request('PUT', '/api/settings', settings),

  uploadMedia: (payload) => request('POST', '/api/media', payload),
  deleteMedia: (id) => request('DELETE', `/api/media/${id}`),

  createPost: (post) => request('POST', '/api/posts', post),
  updatePost: (id, patch) => request('PATCH', `/api/posts/${id}`, patch),
  deletePost: (id) => request('DELETE', `/api/posts/${id}`),
  publishPost: (id) => request('POST', `/api/posts/${id}/publish`),
  refreshInsights: (id) => request('POST', `/api/posts/${id}/insights`),
  setManualInsights: (id, values) => request('PATCH', `/api/posts/${id}/manual-insights`, values),
  preview: (id) => request('GET', `/api/posts/${id}/preview`),

  generateCaptions: (payload) => request('POST', '/api/captions/generate', payload),
  reviewCaption: (payload) => request('POST', '/api/captions/review', payload),

  checkInstagram: () => request('GET', '/api/instagram/check'),
  accountInsights: () => request('GET', '/api/instagram/account-insights'),

  analytics: () => request('GET', '/api/analytics')
};
