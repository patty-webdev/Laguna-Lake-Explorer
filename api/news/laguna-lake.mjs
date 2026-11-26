const endpoint = new URL('https://gnews.io/api/v4/search');
endpoint.search = new URLSearchParams({
  q: '"Laguna Lake" OR "Laguna de Bay" OR "Laguna Lake Development Authority" OR "Laguna Bay" OR "Lawa ng Laguna" OR "Lawa ng Bay"',
  in: 'title,description,content',
  max: '10',
  sortby: 'publishedAt',
  nullable: 'description,content,image'
});

const freshFor = 30 * 60_000;
const staleFor = 24 * 60 * 60_000;
let cached;
let pending;
let retryAt = 0;
let failure = 'news_unavailable';

async function refresh(key) {
  failure = 'news_unavailable';
  try {
    const response = await fetch(endpoint, {
      headers: { 'X-Api-Key': key, Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(7_000)
    });
    if (!response.ok) {
      if ([400, 401, 403].includes(response.status)) failure = 'provider_rejected_request';
      if (response.status === 429) failure = 'provider_rate_limited';
      if ([403, 429].includes(response.status)) {
        const header = response.headers.get('Retry-After');
        const delay = /^\d+$/.test(header ?? '') ? Number(header) * 1000 : Date.parse(header) - Date.now();
        retryAt = Date.now() + Math.max(freshFor, Number.isFinite(delay) ? delay : 0);
      }
      throw new Error('Upstream request failed');
    }
    const data = await response.json();
    if (!Array.isArray(data?.articles)) throw new Error('Invalid upstream response');
    cached = {
      fetchedAt: Date.now(),
      articles: data.articles.slice(0, 10).map(article => ({
        title: article?.title,
        url: article?.url,
        image: article?.image,
        publishedAt: article?.publishedAt,
        source: article?.source?.name
      }))
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
  const key = process.env.GNEWS_API_KEY?.trim();
  if (!key) return res.status(503).json({ error: 'news_not_configured' });

  let result = cached && Date.now() - cached.fetchedAt < freshFor ? cached : null;
  if (!result && Date.now() >= retryAt) {
    pending ??= refresh(key).finally(() => { pending = null; });
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
