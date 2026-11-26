const baseUrl = 'https://search.mediacloud.org/api/';
const query = '"Laguna Lake" OR "Laguna de Bay" OR "Laguna Lake Development Authority" OR "Lawa ng Laguna" OR "Lawa ng Bay"';
const googleNews = new URL('https://news.google.com/rss/search');
googleNews.search = new URLSearchParams({ q: query, hl: 'en-PH', gl: 'PH', ceid: 'PH:en' });

const freshFor = 30 * 60_000;
const staleFor = 24 * 60 * 60_000;
let cached;
let pending;
let retryAt = 0;
let failure = 'news_unavailable';
let discoveredCollections;

function decodeXml(text) {
  if (text.startsWith('<![CDATA[') && text.endsWith(']]>')) return text.slice(9, -3).trim();
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  return text.replace(/&(amp|lt|gt|quot|apos|#x[0-9a-fA-F]+|#\d+);/g, (entity, code) => {
    if (Object.hasOwn(entities, code)) return entities[code];
    const point = code.startsWith('#x') ? parseInt(code.slice(2), 16) : Number(code.slice(1));
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
  });
}

function rssText(xml, tag) {
  const text = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1].trim() ?? '';
  return decodeXml(text);
}

function tagAttribute(tag, name) {
  const value = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return decodeXml(value?.[1] ?? value?.[2] ?? '');
}

function imageUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password) return url.href;
  } catch { /* Missing or invalid image URL. */ }
  return null;
}

function rssImage(item) {
  for (const [tag, kind] of item.matchAll(/<(media:thumbnail|media:content|enclosure)(?=\s|\/?>)[^>]*>/gi)) {
    const image = /^(?:image\/)/i.test(tagAttribute(tag, 'type')) || /^image$/i.test(tagAttribute(tag, 'medium'));
    if (kind.toLowerCase() !== 'media:thumbnail' && !image) continue;
    const url = imageUrl(tagAttribute(tag, 'url'));
    if (url) return url;
  }
  const description = rssText(item, 'description');
  for (const [tag] of description.matchAll(/<img\s[^>]*>/gi)) {
    const url = imageUrl(tagAttribute(tag, 'src'));
    if (url) return url;
  }
  return null;
}

async function googleArticles() {
  const response = await fetch(googleNews, {
    headers: { Accept: 'application/rss+xml, application/xml, text/xml' },
    signal: AbortSignal.timeout(4_000)
  });
  if (!response.ok) throw new Error('Google News request failed');
  const xml = await response.text();
  if (!/<rss(?:\s|>)/i.test(xml) || !/<channel(?:\s|>)/i.test(xml) || !/<\/rss>\s*$/i.test(xml)) {
    throw new Error('Invalid Google News RSS feed');
  }
  const articles = [];
  for (const [, item] of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)) {
    const source = rssText(item, 'source');
    const headline = rssText(item, 'title');
    const suffix = ` - ${source}`;
    const title = source && headline.endsWith(suffix) ? headline.slice(0, -suffix.length).trim() : headline;
    const url = rssText(item, 'link');
    if (!title || !/^https?:\/\//i.test(url)) continue;
    const publishedAt = Date.parse(rssText(item, 'pubDate'));
    articles.push({ title, url, source, image: rssImage(item), publishedAt: Number.isFinite(publishedAt) ? new Date(publishedAt).toISOString() : null });
    if (articles.length === 25) break;
  }
  return articles.sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
}

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

async function mediaCloudArticles(key, collectionOverride) {
  const signal = AbortSignal.timeout(4_000);
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
    return data.stories.slice(0, 25).map(story => ({
        title: story?.title,
        url: story?.url,
        publishedAt: typeof story?.publish_date === 'string' ? story.publish_date.slice(0, 10) : null,
        source: story?.media_name
    })).sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
  } catch {
    retryAt = Math.max(retryAt, Date.now() + 60_000);
    return null;
  }
}

async function refresh() {
  failure = 'news_unavailable';
  let articles;
  let provider = 'Google News';
  try {
    articles = await googleArticles();
  } catch { /* Try Media Cloud when the primary feed is unavailable. */ }

  if (!articles?.length) {
    const key = process.env.MEDIACLOUD_API_KEY?.trim();
    const collections = process.env.MEDIACLOUD_COLLECTION_IDS?.trim().replace(/\s/g, '');
    if (key) {
      if (collections && !/^\d+(,\d+)*$/.test(collections)) {
        failure = 'collection_not_found';
      } else {
        const fallback = await mediaCloudArticles(key, collections);
        if (fallback?.length || (!articles && fallback)) {
          articles = fallback;
          provider = 'Media Cloud';
        }
      }
    }
  }
  if (!articles || (!articles.length && cached?.articles.length && Date.now() - cached.fetchedAt < staleFor)) {
    retryAt = Math.max(retryAt, Date.now() + 60_000);
    return null;
  }
  cached = { fetchedAt: Date.now(), provider, articles };
  return cached;
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
  let result = cached && Date.now() - cached.fetchedAt < freshFor ? cached : null;
  if (!result && Date.now() >= retryAt) {
    pending ??= refresh().finally(() => { pending = null; });
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
