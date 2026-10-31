"use strict";

/**
 * Extraction robuste de l'image principale d'un article sans dépendance DOM.
 * Les flux RSS sont souvent incomplets : cette fonction inspecte les métadonnées,
 * le JSON-LD et les images lazy-loaded présentes dans le corps de l'article.
 */

function decodeEntities(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (match, code) => {
      const point = Number(code);
      return Number.isInteger(point) && point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : match;
    })
    .replace(/&#x([0-9a-f]+);/gi, (match, code) => {
      const point = Number.parseInt(code, 16);
      return Number.isInteger(point) && point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : match;
    })
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;|&#039;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function absoluteImageUrl(value, baseUrl = "") {
  let src = decodeEntities(value).trim().replace(/^['"]|['"]$/g, "");
  if (!src || /^(?:data|javascript):/i.test(src)) return "";
  if (src.startsWith("//")) src = "https:" + src;
  try {
    const url = new URL(src, baseUrl || undefined);
    if (!/^https?:$/i.test(url.protocol)) return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function parseAttributes(tag) {
  const attrs = {};
  const source = String(tag || "");
  const attrPattern = /(?:^|[\s<])([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match;
  while ((match = attrPattern.exec(source))) {
    attrs[String(match[1] || "").toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "").trim();
  }
  return attrs;
}

function largestSrcsetCandidate(srcset) {
  const values = String(srcset || "")
    .split(",")
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const match = part.match(/^(\S+)(?:\s+(\d+(?:\.\d+)?)(w|x))?$/i);
      if (!match) return null;
      const number = Number(match[2] || 1);
      const unit = String(match[3] || "x").toLowerCase();
      return { url: match[1], weight: unit === "w" ? number : number * 1000 };
    })
    .filter(Boolean)
    .sort((a, b) => b.weight - a.weight);
  return values[0]?.url || "";
}

function imageLikeValue(value, depth = 0) {
  if (!value || depth > 32) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = imageLikeValue(item, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (typeof value === "object") {
    for (const key of ["url", "contentUrl", "thumbnailUrl", "@id", "image"]) {
      const found = imageLikeValue(value[key], depth + 1);
      if (found) return found;
    }
  }
  return "";
}

function walkJsonLd(value, candidates, context = "") {
  const pending = [{ value, context, depth: 0 }];
  let visited = 0;
  while (pending.length && visited++ < 20000 && candidates.length < 4096) {
    const entry = pending.pop(), node = entry.value;
    if (!node || typeof node !== 'object' || entry.depth > 64) continue;
    const type = String(node['@type'] || entry.context || '').toLowerCase();
    if (!Array.isArray(node)) for (const key of ['image','thumbnailUrl','contentUrl','associatedMedia','primaryImageOfPage']) {
      const raw = imageLikeValue(node[key]);
      if (raw) candidates.push({ raw, baseScore: /newsarticle|article|blogposting/.test(type) ? 178 : 158, source: `jsonld:${key}`, context: type });
    }
    const children = Object.values(node);
    for (let i = children.length - 1; i >= 0 && pending.length < 20000; i--) if (children[i] && typeof children[i] === 'object') pending.push({ value: children[i], context: type, depth: entry.depth + 1 });
  }
}

// Missing closing tags are remembered, preventing repeated suffix scans.
function closingTags(text) {
  const scans = new Map();
  return (tag, from) => {
    if (!scans.has(tag)) scans.set(tag, { pattern: new RegExp('</' + tag + '\\s*>', 'gi'), exhausted: false });
    const scan = scans.get(tag);
    if (scan.exhausted) return null;
    scan.pattern.lastIndex = from;
    const found = scan.pattern.exec(text);
    if (!found) scan.exhausted = true;
    return found ? { start: found.index, end: scan.pattern.lastIndex } : null;
  };
}

function articleRegions(text) {
  const chunks = [], pattern = /<(article|main|div|section)\b[^<>]*>/gi, close = closingTags(text);
  let match;
  while (chunks.length < 16 && (match = pattern.exec(text))) {
    const tag = match[1].toLowerCase();
    if (tag === 'div' || tag === 'section') {
      const attrs = parseAttributes(match[0]);
      if (!/(?:article-content|entry-content|post-content|single-content|story-content|news-content)/i.test((attrs.class || '') + ' ' + (attrs.id || ''))) continue;
    }
    const end = close(tag, pattern.lastIndex);
    if (end) { chunks.push(text.slice(match.index, end.end)); pattern.lastIndex = end.end; }
  }
  return chunks;
}

function imagePenalty(url, context = "") {
  const haystack = `${url} ${context}`.toLowerCase();
  if (/\.(?:svg|ico)(?:$|[?#])/i.test(url)) return 1000;
  if (/(?:logo|favicon|avatar|author[-_ ]?photo|sprite|emoji|emoticon|tracking|pixel|spacer|blank|transparent|placeholder|no[-_ ]?image|missing[-_ ]?image|default[-_ ]?(?:image|thumb)|loader|loading|gravatar|badge|icon[-_.\/]|\/icons?\/)/i.test(haystack)) return 1000;
  if (/(?:advert|advertisement|doubleclick|googlesyndication|adserver|promo[-_]?button)/i.test(haystack)) return 240;
  if (/(?:cookie|consent|newsletter|social|share[-_]|facebook|twitter|instagram|youtube)/i.test(haystack)) return 150;
  return 0;
}

function scoreCandidate(candidate, baseUrl) {
  const url = absoluteImageUrl(candidate.raw, baseUrl);
  if (!url) return null;
  const context = String(candidate.context || "");
  const penalty = imagePenalty(url, context);
  if (penalty >= 1000) return null;

  let score = Number(candidate.baseScore || 0) - penalty;
  const lower = `${url} ${context}`.toLowerCase();
  if (/(?:hero|featured|cover|poster|article|content|main[-_]?image|lead[-_]?image|wp-post-image|attachment-post|news[-_]?image)/i.test(lower)) score += 45;
  if (/(?:thumb|thumbnail)/i.test(lower)) score += 8;
  if (/\.(?:jpe?g|png|webp|avif)(?:$|[?#])/i.test(url)) score += 14;
  if (/\.(?:gif)(?:$|[?#])/i.test(url)) score -= 20;

  const width = Number(candidate.width || 0);
  const height = Number(candidate.height || 0);
  if (width >= 1000 || height >= 700) score += 42;
  else if (width >= 600 || height >= 400) score += 28;
  else if (width >= 300 || height >= 220) score += 12;
  if ((width && width < 120) || (height && height < 90)) score -= 90;
  if (width && height) {
    const ratio = width / height;
    if (ratio > 0.45 && ratio < 3.4) score += 9;
    if (ratio > 5 || ratio < 0.2) score -= 70;
  }
  return { ...candidate, url, score };
}

function extractBestArticleImage(html, baseUrl = "", options = {}) {
  const text = String(html || "").slice(0, 8 * 1024 * 1024);
  if (!text) return "";
  const candidates = [];

  // Métadonnées sociales et liens d'image principaux.
  for (const match of text.matchAll(/<meta\b[^<>]*>/gi)) {
    const tag = match[0];
    if (candidates.length >= 4096) break;
    const attrs = parseAttributes(tag);
    const key = String(attrs.property || attrs.name || attrs.itemprop || "").toLowerCase();
    const content = attrs.content || attrs.value || "";
    if (!content) continue;
    if (/^(?:og:image(?::secure_url|:url)?|twitter:image(?::src)?|twitter:image0|thumbnailurl|image|primaryimageofpage|parsely-image-url|sailthru\.image\.full)$/.test(key)) {
      const baseScore = key.startsWith("og:image") ? 220 : key.startsWith("twitter:image") ? 210 : 185;
      candidates.push({ raw: content, baseScore, source: key, width: attrs.width, height: attrs.height, context: tag });
    }
  }
  for (const match of text.matchAll(/<link\b[^<>]*>/gi)) {
    const tag = match[0];
    if (candidates.length >= 4096) break;
    const attrs = parseAttributes(tag);
    const rel = String(attrs.rel || "").toLowerCase();
    if (/(?:^|\s)(?:image_src|preload)(?:\s|$)/.test(rel) && (attrs.as === "image" || rel.includes("image_src"))) {
      candidates.push({ raw: attrs.href, baseScore: rel.includes("image_src") ? 195 : 150, source: `link:${rel}`, context: tag });
    }
  }

  // Données structurées des éditeurs modernes.
  const jsonLdPattern = /<script\b[^<>]*>/gi, closeScript = closingTags(text);
  let jsonMatch, scripts = 0;
  while (scripts++ < 32 && (jsonMatch = jsonLdPattern.exec(text))) {
    if (String(parseAttributes(jsonMatch[0]).type || '').toLowerCase() !== 'application/ld+json') continue;
    const end = closeScript('script', jsonLdPattern.lastIndex);
    if (!end) continue;
    const rawJson = decodeEntities(text.slice(jsonLdPattern.lastIndex, end.start)).trim().replace(/^<!--|-->$/g, "").trim();
    jsonLdPattern.lastIndex = end.end;
    if (!rawJson) continue;
    try { walkJsonLd(JSON.parse(rawJson), candidates); } catch {}
  }
  const articleChunks = articleRegions(text);
  const scanChunks = [
    ...articleChunks.map(chunk => ({ html: chunk, baseScore: 132, context: "article-main" })),
    { html: text, baseScore: 72, context: "document" }
  ];

  for (const chunk of scanChunks) {
    // Images classiques, AMP, <source> et éléments lazy-load. Plusieurs sites
    // d'actualité placent l'URL sur <figure>/<div data-bg> plutôt que sur <img>.
    for (const match of chunk.html.matchAll(/<(?:img|amp-img|source|figure|div|section|a|picture)\b[^<>]*>/gi)) {
      const tag = match[0];
      if (candidates.length >= 4096) break;
      const attrs = parseAttributes(tag);
      const tagName = String(tag.match(/^<\s*([\w-]+)/i)?.[1] || "").toLowerCase();
      const classContext = `${tagName} ${attrs.class || ""} ${attrs.id || ""} ${attrs.alt || ""} ${attrs.title || ""} ${attrs.role || ""} ${chunk.context}`;
      const lazyAttrs = [
        "data-src", "data-lazy-src", "data-original", "data-original-src", "data-orig-file",
        "data-url", "data-image", "data-image-src", "data-full-src", "data-large-file",
        "data-flickity-lazyload", "data-bg", "data-bg-src", "data-background", "data-background-image",
        "data-hero", "data-cover", "data-poster", "data-lazy-background"
      ];
      const srcsetAttrs = ["srcset", "data-srcset", "data-lazy-srcset", "data-responsive-srcset"];
      const raws = [];
      for (const key of lazyAttrs) {
        if (!attrs[key]) continue;
        const raw = String(attrs[key]).replace(/^url\(\s*(['"]?)(.*?)\1\s*\)$/i, "$2");
        raws.push({ raw, bonus: tagName === "img" || tagName === "amp-img" ? 16 : 8, source: key });
      }
      for (const key of srcsetAttrs) {
        const selected = largestSrcsetCandidate(attrs[key]);
        if (selected) raws.push({ raw: selected, bonus: 24, source: key });
      }
      if (["img", "amp-img", "source"].includes(tagName) && attrs.src) raws.push({ raw: attrs.src, bonus: 0, source: "src" });
      if (attrs.poster) raws.push({ raw: attrs.poster, bonus: 10, source: "poster" });
      for (const item of raws) {
        candidates.push({
          raw: item.raw,
          baseScore: chunk.baseScore + item.bonus + (/(?:featured|hero|cover|poster|wp-post-image|attachment|lead[-_ ]?media)/i.test(classContext) ? 42 : 0),
          source: `html:${item.source}`,
          width: attrs.width || attrs["data-width"],
          height: attrs.height || attrs["data-height"],
          context: classContext
        });
      }
    }

    // Certains thèmes injectent l'image principale dans un attribut style ou
    // un bloc CSS. Le scan reste limité à l'article en priorité.
    for (const match of chunk.html.matchAll(/background(?:-image)?\s*:\s*url\(\s*(?:"([^"<>]*)"|'([^'<>]*)'|([^"'()<>\s]+))\s*\)/gi)) {
      if (candidates.length >= 4096) break;
      candidates.push({ raw: match[1] || match[2] || match[3], baseScore: chunk.baseScore + 4, source: "css-background", context: chunk.context });
    }
  }

  const ranked = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const scored = scoreCandidate(candidate, baseUrl);
    if (!scored || seen.has(scored.url) || (options.exclude||[]).includes(scored.url)) continue;
    seen.add(scored.url);
    ranked.push(scored);
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked[0]?.url || "";
}

module.exports = {
  absoluteImageUrl,
  decodeEntities,
  extractBestArticleImage,
  largestSrcsetCandidate,
  parseAttributes,
  scoreCandidate
};
