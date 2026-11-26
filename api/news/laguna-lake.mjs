const baseUrl = 'https://search.mediacloud.org/api/';
const query = '"Laguna Lake" OR "Laguna de Bay" OR "Laguna Lake Development Authority" OR "Lawa ng Laguna" OR "Lawa ng Bay"';

const freshFor = 30 * 60_000;
const staleFor = 24 * 60 * 60_000;
let cached;
let pending;
let retryAt = 0;
let failure = 'news_unavailable';
let discoveredCollections;

async function requestMediaCloud(path, params, key, signal) {
  const url = new URL(path, baseUrl);
  url.search = new URLSearchParams(params);
  const response = await fetch(url, {
    headers: { Authorization: `Token ${key}`, Accept: 'application/json' },
    redirect: 'error',
    signal
  });
  if (!response.ok) {
    if ([400, 401, 403].includes(response.status)) failure = 'provider_rejected_request';
    if (response.status === 429) {
      failure = 'provider_rate_limited';
      const header = response.headers.get('Retry-After');
      const delay = /^\d+$/.test(header ?? '') ? Number(header) * 1000 : Date.parse(header) - Date.now();
      retryAt = Date.now() + Math.max(freshFor, Number.isFinite(delay) ? delay : 0);
    }
    throw new Error('Upstream request failed');
  }
  return response.json();
}

async function refresh(key, collectionOverride) {
  failure = 'news_unavailable';
  const signal = AbortSignal.timeout(8_000);
  try {
    if (!collectionOverride && !discoveredCollections) {
      const directory = await requestMediaCloud('sources/collections/', {
        name: 'Philippines', platform: 'online_news', limit: '50'
      }, key, signal);
      if (!Array.isArray(directory?.results)) throw new Error('Invalid Media Cloud directory response');
      discoveredCollections = [...new Set(directory.results
        .filter(collection => /\bPhilippines\b/i.test(collection?.name) && Number.isSafeInteger(collection?.id) && collection.id > 0)
        .map(collection => collection.id))].join(',');
    }
    const collections = collectionOverride || discoveredCollections;
    if (!collections) {
      failure = 'collection_not_found';
      throw new Error('No Philippine news collection found');
    }
    const data = await requestMediaCloud('search/story-list', {
      q: query, platform: 'onlinenews-mediacloud', cs: collections,
      start: '2020-01-01', end: new Date().toISOString().slice(0, 10),
      page_size: '25', sort_order: 'desc'
    }, key, signal);
    if (!Array.isArray(data?.stories)) throw new Error('Invalid Media Cloud story response');
    cached = {
      fetchedAt: Date.now(),
      articles: data.stories.slice(0, 25).map(story => ({
        title: story?.title,
        url: story?.url,
        publishedAt: typeof story?.publish_date === 'string' ? story.publish_date.slice(0, 10) : null,
        source: story?.media_name
      })).sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
    };
    return cached;
  } catch {
    retryAt = Math.max(retryAt, Date.now() + 60_000);
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  // Keep the endpoint on a single cache key and use a fixed upstream query.
  if (Object.keys(req.query ?? {}).length > 0) {
    return res.status(400).json({ error: 'unexpected_parameters' });
  }
  const key = process.env.MEDIACLOUD_API_KEY?.trim();
  if (!key) return res.status(503).json({ error: 'news_not_configured' });
  const collectionOverride = process.env.MEDIACLOUD_COLLECTION_IDS?.trim();
  if (collectionOverride && !/^\d+(,\s*\d+)*$/.test(collectionOverride)) {
    return res.status(503).json({ error: 'collection_not_found' });
  }

  let result = cached && Date.now() - cached.fetchedAt < freshFor ? cached : null;
  if (!result && Date.now() >= retryAt) {
    pending ??= refresh(key, collectionOverride?.replace(/\s/g, '')).finally(() => { pending = null; });
    result = await pending;
  }
  if (result) {
    const remaining = Math.max(1, Math.floor((freshFor - (Date.now() - result.fetchedAt)) / 1000));
    res.setHeader('Vercel-CDN-Cache-Control', `s-maxage=${remaining}, stale-while-revalidate=60`);
    return res.status(200).json(result);
  }
  if (cached && Date.now() - cached.fetchedAt < staleFor) {
    return res.status(200).json({ ...cached, stale: true });
  }
  res.setHeader('Retry-After', String(Math.max(1, Math.ceil((retryAt - Date.now()) / 1000))));
  return res.status(503).json({ error: failure });
}
