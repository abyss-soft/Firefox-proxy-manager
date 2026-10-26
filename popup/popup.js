const siteInput = document.getElementById("siteInput");
const siteInputBypass = document.getElementById("siteInputBypassSite");
const siteList = document.getElementById("siteList");
const siteBypassList = document.getElementById("siteBypassList");
const siteListContainer = document.getElementById("siteListContainer");
const wrapperSiteBypassList = document.getElementById("wrapper-siteBypassList");
const addSiteButton = document.getElementById("addSite");
const addBypassSiteButton = document.getElementById("addBypassSite");
const toggleProxyCheckbox = document.getElementById("toggleProxy");
const toggleBypassListCheckbox = document.getElementById("toggleBypassList");
const proxyInput = document.getElementById("proxyInput");
const saveProxyConfigButton = document.getElementById("saveProxyConfig");
const titleUseProxy = document.getElementById("title-use-proxy");
const titleNoProxy = document.getElementById("title-no-proxy");
const listProxyTitle = document.getElementById("listProxyTitle");
const listBypassTitle = document.getElementById("listProxyBypassTitle");
const saveSitesButton = document.getElementById("saveSites");

let isProxyEnabled = false;
let isToggleBypassEnabled = false;

function showInfoText(message, element = document.body, className = "js-alert") {
  const notice = document.createElement("div");
  notice.className = className;
  notice.textContent = message;
  element.append(notice);
  setTimeout(() => notice.remove(), 4000);
}

function showActionError(action, error) {
  showInfoText(`${action}: ${error.message}`, document.body, "js-alertError");
}

async function storageGet(keys) {
  try {
    return await browser.storage.sync.get(keys);
  } catch (error) {
    throw new Error(error.message || "Ошибка чтения настроек.");
  }
}

async function storageSet(values) {
  try {
    await browser.storage.sync.set(values);
  } catch (error) {
    throw new Error(error.message || "Ошибка сохранения настроек.");
  }
}

function isValidUrl(site) {
  const pattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
  return pattern.test(site.trim());
}

function isValidProxy(proxy) {
  const match = /^(https?|socks(?:4|5)?):\/\/([^/:]+):(\d{1,5})$/i.exec(proxy.trim());
  if (!match) return false;

  const [, , host, rawPort] = match;
  const port = Number(rawPort);
  if (port < 1 || port > 65535) return false;

  const ipv4Parts = host.split(".");
  if (ipv4Parts.length === 4 && ipv4Parts.every(part => /^\d{1,3}$/.test(part))) {
    return ipv4Parts.every(part => Number(part) <= 255);
  }

  if (host.toLowerCase() === "localhost") return true;
  return /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(host);
}

function updateCounters() {
  listProxyTitle.textContent = siteList.children.length;
  listBypassTitle.textContent = siteBypassList.children.length;
}

function displaySites(sites, listElement, removeCallback) {
  listElement.replaceChildren();
  sites.forEach((site, index) => {
    const item = document.createElement("li");
    const siteName = document.createElement("span");
    siteName.className = "site-name";
    siteName.textContent = site;
    siteName.title = site;

    const removeButton = document.createElement("button");
    removeButton.textContent = "Удалить";
    removeButton.addEventListener("click", () => removeCallback(index));

    item.append(siteName, removeButton);
    listElement.append(item);
  });
  updateCounters();
}

function toggleOpacityDisplay() {
  wrapperSiteBypassList.classList.toggle("js-opacityDisplay", !isToggleBypassEnabled);
  siteListContainer.classList.toggle("js-opacityDisplay", isToggleBypassEnabled);
}

function updateBypassToggleAvailability() {
  toggleBypassListCheckbox.disabled = !isProxyEnabled;
  toggleBypassListCheckbox.title = isProxyEnabled
      ? ""
      : "Сначала включите активацию прокси";
}

async function addSite(inputElement, storeKey, listElement, errorElement) {
  const domain = inputElement.value.trim().toLowerCase();
  if (!isValidUrl(domain)) {
    showInfoText("Введите домен, например example.com или www.example.com", errorElement);
    return;
  }

  try {
    const data = await storageGet(storeKey);
    const existingSites = Array.isArray(data[storeKey]) ? data[storeKey] : [];
    const sites = [...new Set([...existingSites, domain])];
    await storageSet({ [storeKey]: sites });
    const removeCallback = storeKey === "bypassListProxySites" ? removeBypassSite : removeSite;
    displaySites(sites, listElement, removeCallback);
    inputElement.value = "";
  } catch (error) {
    showActionError("Не удалось сохранить список сайтов", error);
  }
}

async function removeStoredSite(storeKey, index, listElement, removeCallback) {
  try {
    const data = await storageGet(storeKey);
    const sites = Array.isArray(data[storeKey]) ? data[storeKey] : [];
    sites.splice(index, 1);
    await storageSet({ [storeKey]: sites });
    displaySites(sites, listElement, removeCallback);
  } catch (error) {
    showActionError("Не удалось удалить сайт", error);
  }
}

function removeSite(index) {
  return removeStoredSite("proxySites", index, siteList, removeSite);
}

function removeBypassSite(index) {
  return removeStoredSite("bypassListProxySites", index, siteBypassList, removeBypassSite);
}

async function saveProxyConfig() {
  const proxy = proxyInput.value.trim();
  if (!isValidProxy(proxy)) {
    showInfoText("Введите прокси в формате схема://хост:порт с портом от 1 до 65535");
    return;
  }

  const [scheme, hostPort] = proxy.split("://");
  const [host, port] = hostPort.split(":");
  try {
    await storageSet({
      proxyConfig: { scheme: scheme.toLowerCase(), host: host.toLowerCase(), port: Number(port) },
    });
    showInfoText("Настройки прокси сохранены!");
  } catch (error) {
    showActionError("Не удалось сохранить настройки прокси", error);
  }
}

async function exportToFile() {
  try {
    const data = await storageGet(["proxySites", "bypassListProxySites"]);
    const allSites = {
      sites: Array.isArray(data.proxySites) ? data.proxySites : [],
      sitesBypass: Array.isArray(data.bypassListProxySites) ? data.bypassListProxySites : [],
    };
    const file = new Blob([JSON.stringify(allSites)], { type: "text/plain" });
    const objectUrl = window.URL.createObjectURL(file);
    const link = document.createElement("a");
    link.download = "listSitesAll.txt";
    link.href = objectUrl;
    link.click();
    setTimeout(() => {
      window.URL.revokeObjectURL(objectUrl);
      link.remove();
    }, 1000);
  } catch (error) {
    showActionError("Не удалось экспортировать списки", error);
  }
}

async function loadDefaults() {
  try {
    const data = await storageGet([
      "proxyConfig",
      "proxySites",
      "isProxyEnabled",
      "isToggleBypassEnabled",
      "bypassListProxySites",
    ]);
    const defaultProxy = data.proxyConfig || {
      scheme: "http",
      host: "127.0.0.1",
      port: 8080,
    };
    proxyInput.value = `${defaultProxy.scheme}://${defaultProxy.host}:${defaultProxy.port}`;

    const defaultSites = Array.isArray(data.proxySites) ? data.proxySites : [
      "2ip.ru",
      "youtube.com",
      "y2mate.mx",
      "nuancesprog.ru",
      "vueframework.com",
      "dev.to",
      "userstyles.org",
      "devexpress.com",
      "programmersought.com",
      "mo4tech.com",
      "huggingface.co",
      "javascripttutorial.net",
    ];
    const defaultBypassList = Array.isArray(data.bypassListProxySites) ? data.bypassListProxySites : [
      "myip.com",
      "ip2location.com",
      "2ip.ru",
      "afisha.ru",
    ];
    const defaultsToSave = {};
    if (!Array.isArray(data.proxySites)) defaultsToSave.proxySites = defaultSites;
    if (!Array.isArray(data.bypassListProxySites)) {
      defaultsToSave.bypassListProxySites = defaultBypassList;
    }
    if (Object.keys(defaultsToSave).length) await storageSet(defaultsToSave);

    displaySites(defaultSites, siteList, removeSite);
    displaySites(defaultBypassList, siteBypassList, removeBypassSite);

    isProxyEnabled = Boolean(data.isProxyEnabled);
    toggleProxyCheckbox.checked = isProxyEnabled;
    isToggleBypassEnabled = Boolean(data.isToggleBypassEnabled);
    toggleBypassListCheckbox.checked = isToggleBypassEnabled;
    updateBypassToggleAvailability();
    toggleOpacityDisplay();
  } catch (error) {
    showActionError("Не удалось загрузить настройки", error);
  }
}

toggleProxyCheckbox.addEventListener("change", async () => {
  const previousValue = isProxyEnabled;
  isProxyEnabled = toggleProxyCheckbox.checked;
  updateBypassToggleAvailability();
  try {
    await storageSet({ isProxyEnabled });
    showInfoText(
      `Прокси ${isProxyEnabled ? "включен" : "выключен"}`,
      document.getElementById("js-activator-proxy"),
      isProxyEnabled ? "js-alert" : "js-alertError"
    );
  } catch (error) {
    isProxyEnabled = previousValue;
    toggleProxyCheckbox.checked = previousValue;
    updateBypassToggleAvailability();
    showActionError("Не удалось изменить состояние прокси", error);
  }
});

toggleBypassListCheckbox.addEventListener("change", async () => {
  if (!isProxyEnabled) {
    toggleBypassListCheckbox.checked = false;
    return;
  }

  const previousValue = isToggleBypassEnabled;
  isToggleBypassEnabled = toggleBypassListCheckbox.checked;
  try {
    await storageSet({ isToggleBypassEnabled });
    toggleOpacityDisplay();
    showInfoText(
      `Исключение ${isToggleBypassEnabled ? "включено" : "выключено"}`,
      document.getElementById("js-bypassList-proxy"),
      isToggleBypassEnabled ? "js-alert" : "js-alertError"
    );
  } catch (error) {
    isToggleBypassEnabled = previousValue;
    toggleBypassListCheckbox.checked = previousValue;
    showActionError("Не удалось изменить режим исключений", error);
  }
});

addSiteButton.addEventListener("click", () =>
  addSite(siteInput, "proxySites", siteList, titleUseProxy)
);
addBypassSiteButton.addEventListener("click", () =>
  addSite(siteInputBypass, "bypassListProxySites", siteBypassList, titleNoProxy)
);
saveProxyConfigButton.addEventListener("click", saveProxyConfig);
saveSitesButton.addEventListener("click", exportToFile);
siteInput.addEventListener("keypress", event => {
  if (event.key === "Enter") {
    addSite(siteInput, "proxySites", siteList, titleUseProxy);
  }
});
siteInputBypass.addEventListener("keypress", event => {
  if (event.key === "Enter") {
    addSite(siteInputBypass, "bypassListProxySites", siteBypassList, titleNoProxy);
  }
});

loadDefaults();
