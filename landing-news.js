(() => {
  const endpoint = '/api/news/laguna-lake';
  const cacheKey = 'laguna-landing-mediacloud-v1';
  const refreshInterval = 30 * 60_000;
  const landing = document.getElementById('landingScreen');
  const slides = document.getElementById('landingNewsSlides');
  const status = document.getElementById('landingNewsStatus');
  const controls = document.getElementById('landingNewsControls');
  const previous = document.getElementById('landingNewsPrevious');
  const next = document.getElementById('landingNewsNext');
  const retry = document.getElementById('landingNewsRetry');
  const position = document.getElementById('landingNewsPosition');
  const errorMessages = {
    endpoint_missing: 'The news endpoint is missing. Open the Vercel Preview URL or run the app with vercel dev.',
    news_not_configured: 'Add MEDIACLOUD_API_KEY to the Vercel Preview environment and redeploy.',
    collection_not_found: 'Set MEDIACLOUD_COLLECTION_IDS to the Philippine news collection IDs and redeploy.',
    provider_rejected_request: 'Media Cloud rejected the search. Check the Preview API key and collection access.',
    provider_rate_limited: 'Media Cloud is limiting requests. The feed will retry automatically.'
  };
  const newsSearch = new URL('https://news.google.com/search');
  newsSearch.search = new URLSearchParams({
    q: '"Laguna Lake" OR "Laguna de Bay" OR "Laguna Lake Development Authority" OR "Lawa ng Laguna" OR "Lawa ng Bay"',
    hl: 'en-PH', gl: 'PH', ceid: 'PH:en'
  });
  document.getElementById('landingNewsAll').href = newsSearch.href;

  const categories = [
    ['Water Quality', /water quality|algal blooms?|dissolved oxygen/i],
    ['Pollution', /pollut|contaminat|wastewater|sewage|plastic waste/i],
    ['Fisheries and Aquaculture', /fish kills?|fisher|aquaculture|fishpens?|fish cages?/i],
    ['Flooding and Disasters', /flood|typhoon|disaster|water levels?/i],
    ['Climate Change', /climate change|global warming/i],
    ['Environment and Conservation', /conservat|rehabilitat|restoration|watershed/i],
    ['Biodiversity', /biodiversity|invasive species|wildlife|endemic/i],
    ['Infrastructure and Development', /infrastructure|dredg|embankment|reclamation|construction/i],
    ['Government and Policies', /govern|policy|regulat|ordinance|legislation|senate/i]
  ];
  const dateFormat = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila', day: 'numeric', month: 'short', year: 'numeric'
  });
  const updateFormat = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short'
  });
  let cache;
  let loading = false;
  let nextRequest = 0;
  let endpointMissing = false;

  function readSavedFeed() {
    try {
      const saved = JSON.parse(localStorage.getItem(cacheKey));
      if (Array.isArray(saved?.articles) && Number.isFinite(saved.fetchedAt) && saved.fetchedAt <= Date.now()) {
        return saved;
      }
    } catch { /* Storage is optional. */ }
    return null;
  }

  function safeUrl(value) {
    try {
      const url = new URL(value);
      if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) {
        url.hash = '';
        return url;
      }
    } catch { /* Ignore invalid links. */ }
    return null;
  }

  function normalize(records) {
    const links = new Set(), titles = new Set(), articles = [];
    for (const record of records) {
      const url = safeUrl(record?.url);
      const title = typeof record?.title === 'string' ? record.title.trim().replace(/\s+/g, ' ') : '';
      if (!url || !title) continue;
      const canonical = new URL(url);
      for (const key of [...canonical.searchParams.keys()]) {
        if (/^utm_|^(fbclid|gclid)$/i.test(key)) canonical.searchParams.delete(key);
      }
      canonical.searchParams.sort();
      const titleKey = title.toLowerCase();
      if (links.has(canonical.href) || titles.has(titleKey)) continue;
      links.add(canonical.href);
      titles.add(titleKey);
      const publishedAt = typeof record.publishedAt === 'string' && Number.isFinite(Date.parse(record.publishedAt))
        ? record.publishedAt : null;
      const image = safeUrl(record.image);
      articles.push({
        title, url: url.href, source: typeof record.source === 'string' && record.source.trim() || url.hostname,
        image: image?.protocol === 'https:' ? image.href : null,
        publishedAt,
        category: categories.find(([, pattern]) => pattern.test(title))?.[0] ?? 'General News'
      });
    }
    return articles.slice(0, 6);
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function makeSlide(article) {
    const slide = element('li', 'landing-news-slide');
    const card = element('article', 'landing-news-card');
    const thumbnail = element('span', 'landing-news-thumbnail', '▤');
    thumbnail.setAttribute('aria-hidden', 'true');
    if (article.image) {
      const image = document.createElement('img');
      image.alt = '';
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      image.addEventListener('error', () => image.remove(), { once: true });
      image.src = article.image;
      thumbnail.append(image);
    }
    const link = element('a', 'landing-news-headline', article.title);
    link.href = article.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    const publication = article.publishedAt ? ` · Published ${dateFormat.format(new Date(article.publishedAt))}` : '';
    const body = document.createElement('div');
    body.append(
      element('span', 'landing-news-category', article.category),
      link,
      element('span', 'landing-news-meta', article.source + publication)
    );
    card.append(thumbnail, body);
    slide.append(card);
    return slide;
  }

  function activeSlide() {
    if (!slides.clientHeight) return 0;
    const start = slides.firstElementChild?.offsetTop ?? 0;
    return [...slides.children].findLastIndex(slide => slide.offsetTop - start <= slides.scrollTop + 2);
  }

  function updateControls() {
    const index = activeSlide();
    const total = slides.children.length;
    previous.disabled = index <= 0;
    next.disabled = index >= total - 1;
    position.textContent = total > 1 ? `${index + 1} / ${total}` : '';
  }

  function moveSlide(direction) {
    const target = slides.children[activeSlide() + direction];
    if (!target) return;
    slides.scrollTo({
      top: target.offsetTop - slides.firstElementChild.offsetTop,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
    });
  }

  function render(articles, fetchedAt, stale = false) {
    slides.replaceChildren(...articles.map(makeSlide));
    slides.hidden = articles.length === 0;
    controls.hidden = articles.length < 2;
    slides.scrollTop = 0;
    updateControls();
    const lastUpdate = `Media Cloud · Updated ${updateFormat.format(fetchedAt)}`;
    status.textContent = stale ? `Showing saved results. ${lastUpdate}`
      : articles.length ? lastUpdate : 'No matches in the selected Media Cloud collections. Use the link below to search other sources.';
    retry.hidden = !stale;
  }

  function showCache(entry, stale = false) {
    render(normalize(entry.articles), entry.fetchedAt, stale);
  }

  async function refreshFeed(manual = false) {
    if (endpointMissing && !manual) return;
    const saved = readSavedFeed();
    if (saved && (!cache || saved.fetchedAt > cache.fetchedAt)) {
      cache = saved;
      showCache(cache, Date.now() - cache.fetchedAt >= refreshInterval);
    }
    if (cache && Date.now() - cache.fetchedAt < refreshInterval) return;
    if (Date.now() < nextRequest) {
      if (manual && !cache) {
        const seconds = Math.ceil((nextRequest - Date.now()) / 1000);
        const wait = seconds < 60 ? `${seconds}s` : `${Math.ceil(seconds / 60)} min`;
        status.textContent = `The feed can retry in about ${wait}.`;
      }
      return;
    }
    retry.disabled = true;
    if (!cache) status.textContent = 'Loading Media Cloud headlines…';
    try {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(10_000) });
      if (response.status === 404 || response.ok && !response.headers.get('Content-Type')?.includes('application/json')) {
        endpointMissing = true;
        throw new Error('endpoint_missing');
      }
      endpointMissing = false;
      const data = await response.json();
      if (!response.ok) {
        const retryAfter = Number(response.headers.get('Retry-After'));
        if (Number.isFinite(retryAfter) && retryAfter > 0) nextRequest = Date.now() + retryAfter * 1000;
        throw new Error(data?.error);
      }
      if (!Array.isArray(data?.articles) || !Number.isFinite(data.fetchedAt)) throw new Error('Invalid news response');
      cache = { articles: data.articles, fetchedAt: data.fetchedAt };
      showCache(cache, data.stale === true);
      try { localStorage.setItem(cacheKey, JSON.stringify(cache)); } catch { /* Storage is optional. */ }
    } catch (error) {
      if (cache) showCache(cache, true);
      else status.textContent = errorMessages[error.message] ?? 'Could not reach the news feed. Try again shortly.';
      retry.hidden = error.message === 'news_not_configured';
    } finally {
      retry.disabled = false;
    }
  }

  async function loadNews(manual = false) {
    if (loading || landing.hidden || document.hidden) return;
    loading = true;
    try {
      if (navigator.locks?.request) await navigator.locks.request(cacheKey, () => refreshFeed(manual));
      else await refreshFeed(manual);
    } finally {
      loading = false;
    }
  }

  previous.addEventListener('click', () => moveSlide(-1));
  next.addEventListener('click', () => moveSlide(1));
  retry.addEventListener('click', () => loadNews(true));
  slides.addEventListener('scroll', updateControls, { passive: true });
  document.addEventListener('landing:ready', () => {
    updateControls();
    loadNews();
  });
  document.addEventListener('visibilitychange', () => loadNews());
  window.setInterval(loadNews, 60_000);
  cache = readSavedFeed();
  if (cache) showCache(cache, Date.now() - cache.fetchedAt >= refreshInterval);
  loadNews();
})();
