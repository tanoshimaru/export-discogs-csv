let selectedFolder = null;
const API_BASE = "https://api.discogs.com";

// ==== utils ====
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function isUrlNode(n) { return !!n.url; }

function isTargetDomain(urlStr) {
  try {
    const u = new URL(urlStr);
    return u.hostname === "discogs.com" || u.hostname.endsWith(".discogs.com");
  } catch { return false; }
}

function getPathSegments(urlStr) {
  try {
    const u = new URL(urlStr);
    return u.pathname.split("/").filter(Boolean);
  } catch { return []; }
}

// release/master のID抽出（/ja/release/... などにも対応）
function parseDiscogsId(urlStr) {
  const parts = getPathSegments(urlStr);
  if (parts.length < 2) return null;
  const idx = parts.findIndex(p => p === "release" || p === "master");
  if (idx === -1 || idx + 1 >= parts.length) return null;
  const kind = parts[idx];
  const idPart = parts[idx + 1];
  const id = idPart.split("-")[0];
  if (!/^\d+$/.test(id)) return null;
  return { type: kind, id };
}

// CSV: artist,title,genre,style,year,url
function toCsvBlob(rows) {
  const header = ["artist","title","genre","style","year","url"];
  const safe = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const text = [header, ...rows].map(cols => cols.map(safe).join(",")).join("\r\n");
  return new Blob(["\uFEFF" + text], { type: "text/csv" });
}

async function mapLimit(items, limit, task) {
  const ret = [];
  let i = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (i < items.length) {
      const idx = i++;
      ret[idx] = await task(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return ret;
}

// ==== bookmarks収集 ====
function countUrls(node, recursive = true) {
  if (isUrlNode(node)) return isTargetDomain(node.url) && !!parseDiscogsId(node.url) ? 1 : 0;
  if (!node.children) return 0;
  if (!recursive) {
    return node.children.filter(isUrlNode).filter(n => isTargetDomain(n.url) && !!parseDiscogsId(n.url)).length;
  }
  return node.children.reduce((sum, c) => sum + countUrls(c, true), 0);
}

function renderNode(node) {
  if (isUrlNode(node)) return null;
  const li = document.createElement("li");
  const span = document.createElement("span");
  span.textContent = `📁 ${node.title || "(無題フォルダ)"}`;
  span.className = "folder";
  const cnt = document.createElement("span");
  cnt.className = "count";
  cnt.textContent = `(${countUrls(node)} discogs items)`;
  span.addEventListener("click", () => {
    document.querySelectorAll(".folder.selected").forEach(el => el.classList.remove("selected"));
    span.classList.add("selected");
    selectedFolder = node;
    const recursive = $("includeChildren").checked;
    $("exportBtn").disabled = countUrls(node, recursive) === 0;
  });
  li.appendChild(span);
  li.appendChild(cnt);
  if (node.children && node.children.length) {
    const ul = document.createElement("ul");
    for (const child of node.children) {
      const childLi = renderNode(child);
      if (childLi) ul.appendChild(childLi);
    }
    li.appendChild(ul);
  }
  return li;
}

function collectDiscogsUrls(node, urls = [], recursive = true, seen = new Set()) {
  if (isUrlNode(node)) {
    if (isTargetDomain(node.url) && !seen.has(node.url) && !!parseDiscogsId(node.url)) {
      seen.add(node.url);
      urls.push(node.url);
    }
    return urls;
  }
  if (!node.children || node.children.length === 0) return urls;
  if (recursive) {
    for (const c of node.children) collectDiscogsUrls(c, urls, true, seen);
  } else {
    for (const c of node.children) {
      if (isUrlNode(c) && isTargetDomain(c.url) && !seen.has(c.url) && !!parseDiscogsId(c.url)) {
        seen.add(c.url);
        urls.push(c.url);
      }
    }
  }
  return urls;
}

// ==== API ====
async function fetchJsonWithRetry(url, maxRetry = 2) {
  let attempt = 0;
  while (true) {
    const res = await fetch(url, { headers: { "User-Agent": "DiscogsBookmarks/1.0 (+chrome-extension)" } });
    if (res.ok) return res.json();
    if ((res.status === 429 || res.status >= 500) && attempt < maxRetry) {
      attempt++;
      await sleep(500 * Math.pow(2, attempt));
      continue;
    }
    throw new Error(`HTTP ${res.status}`);
  }
}

async function fetchRelease(id) {
  const data = await fetchJsonWithRetry(`${API_BASE}/releases/${id}`);
  return {
    artist: (data.artists || []).map(a => a.name).join(", "),
    title: data.title || "",
    genre: (data.genres || []).join(" / "),
    style: (data.styles || []).join(" / "),
    year: data.year || ""
  };
}

async function fetchMaster(id) {
  const data = await fetchJsonWithRetry(`${API_BASE}/masters/${id}`);
  return {
    artist: (data.artists || []).map(a => a.name).join(", "),
    title: data.title || "",
    genre: (data.genres || []).join(" / "),
    style: (data.styles || []).join(" / "),
    year: data.year || ""
  };
}

async function getDiscogsInfo(url) {
  const parsed = parseDiscogsId(url);
  if (!parsed) throw new Error("Unsupported URL");
  if (parsed.type === "release") return await fetchRelease(parsed.id);
  return await fetchMaster(parsed.id);
}

// ==== Export ====
async function exportCsv(folderNode) {
  const recursive = $("includeChildren").checked;
  const nameInput = $("filename").value.trim();
  const urls = collectDiscogsUrls(folderNode, [], recursive);

  const rows = await mapLimit(urls, 5, async (url) => {
    try {
      const info = await getDiscogsInfo(url);
      return [info.artist, info.title, info.genre, info.style, info.year, url];
    } catch {
      return null;
    }
  });

  const filtered = rows.filter(r => Array.isArray(r));
  const blob = toCsvBlob(filtered);
  const dlUrl = URL.createObjectURL(blob);
  const base = nameInput || (folderNode.title || "discogs_records");
  const filename = base.endsWith(".csv") ? base : base + ".csv";
  await chrome.downloads.download({ url: dlUrl, filename, saveAs: true });
  URL.revokeObjectURL(dlUrl);
}

// ==== init ====
chrome.bookmarks.getTree((trees) => {
  const root = trees[0];
  const container = document.getElementById("tree");
  const ul = document.createElement("ul");
  for (const child of root.children || []) {
    const li = renderNode(child);
    if (li) ul.appendChild(li);
  }
  container.appendChild(ul);
});

$("exportBtn").addEventListener("click", () => {
  if (selectedFolder) exportCsv(selectedFolder);
});

$("includeChildren").addEventListener("change", () => {
  if (!selectedFolder) return;
  $("exportBtn").disabled = countUrls(selectedFolder, $("includeChildren").checked) === 0;
});
