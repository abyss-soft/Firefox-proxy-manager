const SETTINGS_KEYS = [
    "proxyConfig",
    "proxySites",
    "isProxyEnabled",
    "isToggleBypassEnabled",
    "bypassListProxySites",
];
const SETTINGS_KEY_SET = new Set(SETTINGS_KEYS);
const DEFAULT_SETTINGS = {
    proxyConfig: { scheme: "http", host: "127.0.0.1", port: 8080 },
    proxySites: [],
    isProxyEnabled: false,
    isToggleBypassEnabled: false,
    bypassListProxySites: [],
};

let settings = { ...DEFAULT_SETTINGS };
let settingsRevision = 0;
let settingsReady = Promise.resolve();

function matchesDomain(host, domains) {
    return domains.some(domain => host === domain || host.endsWith(`.${domain}`));
}

function refreshSettings() {
    const revision = ++settingsRevision;
    return browser.storage.sync.get(SETTINGS_KEYS).then(data => {
        if (revision === settingsRevision) {
            settings = {
                ...DEFAULT_SETTINGS,
                ...data,
                proxyConfig: data.proxyConfig || DEFAULT_SETTINGS.proxyConfig,
                proxySites: Array.isArray(data.proxySites) ? data.proxySites : [],
                bypassListProxySites: Array.isArray(data.bypassListProxySites)
                    ? data.bypassListProxySites
                    : [],
            };
        }
    }).catch(error => {
        console.error(`Не удалось обновить настройки прокси: ${error.message}`);
    });
}

function routeRequest(requestInfo) {
    return settingsReady.then(() => routeRequestWithSettings(requestInfo));
}

function routeRequestWithSettings(requestInfo) {
    if (!settings.isProxyEnabled) return { type: "direct" };

    let host;
    try {
        host = new URL(requestInfo.url).hostname.toLowerCase();
    } catch {
        return { type: "direct" };
    }

    const proxyDomains = settings.proxySites
        .filter(domain => typeof domain === "string")
        .map(domain => domain.toLowerCase());
    const bypassDomains = settings.bypassListProxySites
        .filter(domain => typeof domain === "string")
        .map(domain => domain.toLowerCase());
    const shouldProxy = settings.isToggleBypassEnabled
        ? !matchesDomain(host, bypassDomains)
        : matchesDomain(host, proxyDomains);

    if (!shouldProxy) return { type: "direct" };

    const config = settings.proxyConfig;
    const proxyTypes = {
        http: "http",
        https: "https",
        socks: "socks",
        socks4: "socks4",
        socks5: "socks",
    };
    const type = proxyTypes[config.scheme];
    const port = Number(config.port);

    if (!type || !config.host || !Number.isInteger(port) || port < 1 || port > 65535) {
        console.error("Некорректные настройки прокси; запрос будет отправлен напрямую.");
        return { type: "direct" };
    }

    return { type, host: config.host, port };
}

browser.proxy.onRequest.addListener(routeRequest, { urls: ["<all_urls>"] });

function updateProxyIcon(isProxyEnabled) {
    return browser.browserAction.setIcon({
        path: isProxyEnabled ? "icons/enabled.svg" : "icons/disabled.svg",
    }).catch(error => {
        console.error(`Не удалось обновить значок расширения: ${error.message}`);
    });
}

function usePerRequestProxy() {
    return browser.proxy.settings.set(
        { value: { proxyType: "none" }, scope: "regular" }
    ).catch(error => {
        console.error(`Не удалось сбросить глобальный proxy mode: ${error.message}`);
    });
}

browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync") return;

    const changedKeys = Object.keys(changes);
    if (!changedKeys.some(key => SETTINGS_KEY_SET.has(key))) return;

    settingsReady = refreshSettings();
    usePerRequestProxy();

    if (changes.isProxyEnabled) {
        updateProxyIcon(Boolean(changes.isProxyEnabled.newValue));
    }
});

function validateImportedDomains(domains) {
    const domainPattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
    if (!Array.isArray(domains) || domains.length > 500) return null;

    const normalized = [...new Set(domains.map(domain => {
        if (typeof domain !== "string") return null;
        const value = domain.trim().toLowerCase();
        return domainPattern.test(value) ? value : null;
    }))];

    if (normalized.includes(null)) return null;
    if (new TextEncoder().encode(JSON.stringify(normalized)).length > 7000) return null;
    return normalized;
}

browser.runtime.onMessage.addListener(request => {
    if (request?.type !== "importSites") return undefined;

    const sites = validateImportedDomains(request.sites);
    const bypassSites = validateImportedDomains(request.sitesBypass);
    if (!sites || !bypassSites) {
        return { ok: false, error: "Файл содержит некорректные или слишком большие списки доменов." };
    }

    return browser.storage.sync.set({
        proxySites: sites,
        bypassListProxySites: bypassSites,
    }).then(
        () => ({ ok: true }),
        error => {
            console.error(`Не удалось сохранить импортированные списки: ${error.message}`);
            return { ok: false, error: "Не удалось сохранить списки в синхронизируемое хранилище." };
        }
    );
});

usePerRequestProxy();
settingsReady = refreshSettings();
settingsReady.then(() => updateProxyIcon(Boolean(settings.isProxyEnabled)));
