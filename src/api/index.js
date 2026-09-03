const BASE_URL = (
  import.meta.env.VITE_SCRAPPER_URL || 'https://watsapp-web-backend.onrender.com'
).replace(/\/$/, '');

export const API_ENDPOINTS = {
  adminSignup: `${BASE_URL}/api/auth/admin/signup`,
  login: `${BASE_URL}/api/auth/login`,
  resetPassword: `${BASE_URL}/api/auth/reset-password`,
  users: `${BASE_URL}/api/users`,
  qrLatest: `${BASE_URL}/api/qr/latest`,
  qrConnectionStatus: `${BASE_URL}/api/qr/connection-status`,
  scrapedChats: `${BASE_URL}/api/scraped-chats`,
  scrapedChatMessages: `${BASE_URL}/api/scraped-chats/messages`,
  scrapedChatsMonitor: `${BASE_URL}/api/scraped-chats/monitor`,
  scrapedChatsMonitored: `${BASE_URL}/api/scraped-chats/monitored`,
  scrapedChatsDelete: `${BASE_URL}/api/scraped-chats/delete`,
  scrapedChatsStats: `${BASE_URL}/api/scraped-chats/stats`,
  filterProperties: `${BASE_URL}/api/properties/filter`,
  propertyStatuses: `${BASE_URL}/api/properties/statuses`,
  normalizeStatus: `${BASE_URL}/api/normalize/status`,
};

export const PROPERTY_STATUS_ENUM = [
  'AVAILABLE',
  'SOLD',
  'RENTED',
  'RESERVED',
  'WITHDRAWN',
  'ON_HOLD',
]

const propertyStatusPatchUrl = (propertyId) => (
  `${BASE_URL}/api/properties/${encodeURIComponent(propertyId)}/status`
)

const buildHeaders = (tokenOverride = '') => {
  const token = tokenOverride || localStorage.getItem('authToken')
  const headers = {
    'Content-Type': 'application/json',
    'bypass-tunnel-reminder': 'true',
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  return headers
}

export const apiRequest = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...buildHeaders(),
      ...(options.headers || {}),
    },
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok || payload?.error) {
    throw new Error(payload?.message || payload?.error || `Server error: ${response.status}`)
  }

  return payload
}

export const getLoggedInUserId = () => {
  try {
    const saved = localStorage.getItem('currentUser')
    if (saved) {
      const u = JSON.parse(saved)
      return u?.id || u?._id || u?.userId || null
    }
  } catch (e) {
    console.error('Error reading currentUser from localStorage:', e)
  }
  return null
}

const QR_BOOTSTRAP_TTL_MS = 45000
const QR_READY_TTL_MS = 5 * 60 * 1000
const MONITORED_BOOTSTRAP_TTL_MS = 45000
const CHATS_TAB_CACHE_TTL_MS = 10 * 60 * 1000
export const CHATS_PAGE_SIZE = 50
let qrBootstrapCache = null
let qrReadyCache = null
let monitoredBootstrapCache = null
let allChatsTabCache = null
let monitoredChatsTabCache = null
let allChatsPrefetch = null

const getChatsCacheUserKey = (userId) => String(userId || '')

const readTabCacheData = (cache, userId) => {
  if (!cache || cache.userId !== getChatsCacheUserKey(userId)) return []
  return Array.isArray(cache.data) ? cache.data : []
}

const readTabCacheMeta = (cache, userId) => {
  if (!cache || cache.userId !== getChatsCacheUserKey(userId)) {
    return { data: [], total: 0, page: 1, search: '', hasMore: true }
  }
  return {
    data: Array.isArray(cache.data) ? cache.data : [],
    total: Number(cache.total) || 0,
    page: Number(cache.page) || 1,
    search: cache.search || '',
    hasMore: cache.hasMore !== false,
  }
}

const extractScrapedChatList = (payload) => {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.chats)) return payload.chats
  if (Array.isArray(payload?.results)) return payload.results
  if (Array.isArray(payload?.items)) return payload.items
  if (Array.isArray(payload?.data?.chats)) return payload.data.chats
  if (Array.isArray(payload?.data?.results)) return payload.data.results
  if (Array.isArray(payload?.data?.items)) return payload.data.items
  return []
}

const normalizeScrapedChat = (chat = {}, { forceMonitored = false } = {}) => ({
  jid: chat.jid || chat.chatId || chat.id || chat._id || '',
  name: chat.name || chat.pushName || chat.displayName || chat.title || chat.jid || 'Unknown chat',
  avatar: chat.avatar || chat.profilePicUrl || chat.picture || chat.image || '',
  isMonitored: forceMonitored || Boolean(chat.is_monitored ?? chat.isMonitored ?? chat.monitored),
  createdAt: chat.created_at || chat.createdAt || chat.updated_at || chat.updatedAt || '',
})

const normalizeScrapedChatList = (payload, options = {}) => (
  extractScrapedChatList(payload)
    .map(chat => normalizeScrapedChat(chat, options))
    .filter(chat => chat.jid)
)

export const parseChatsPageResponse = (payload) => {
  const body = payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
    ? payload.data
    : payload

  const chats = normalizeScrapedChatList(body?.chats ? { data: body.chats } : payload)
  const total = Number(body?.total ?? payload?.total ?? chats.length)
  const page = Number(body?.page ?? payload?.page ?? 1)
  const pageSize = Number(body?.pageSize ?? payload?.pageSize ?? CHATS_PAGE_SIZE)
  const hasMore = typeof body?.hasMore === 'boolean'
    ? body.hasMore
    : typeof payload?.hasMore === 'boolean'
      ? payload.hasMore
      : page * pageSize < total

  return { chats, total, page, pageSize, hasMore }
}

const storeAllChatsTabCache = (userId, data, meta = {}) => {
  allChatsTabCache = {
    userId: getChatsCacheUserKey(userId),
    data: Array.isArray(data) ? data : [],
    total: Number(meta.total) || 0,
    page: Number(meta.page) || 1,
    search: meta.search || '',
    hasMore: meta.hasMore !== false,
    updatedAt: Date.now(),
  }
}

const storeMonitoredChatsTabCache = (userId, data, meta = {}) => {
  monitoredChatsTabCache = {
    userId: getChatsCacheUserKey(userId),
    data: Array.isArray(data) ? data : [],
    total: Number(meta.total) || 0,
    page: Number(meta.page) || 1,
    search: meta.search || '',
    hasMore: meta.hasMore !== false,
    updatedAt: Date.now(),
  }
}

const settleRequest = (promise) => promise.then(
  value => ({ status: 'fulfilled', value }),
  reason => ({ status: 'rejected', reason })
)

export const isWhatsAppConnected = (data) => {
  if (!data) return false
  const payload = data?.data || data
  return payload?.linked === true
    || payload?.whatsappConnected === true
    || payload?.status === 'connected'
    || payload?.status === 'authenticated'
}

const isFreshCache = (cache, userId, ttlMs) => (
  cache
  && cache.userId === String(userId)
  && Date.now() - cache.startedAt < ttlMs
)

const getQrUrl = (endpoint, userId, cacheBust = false) => {
  const params = new URLSearchParams()
  if (userId) params.set('userId', userId)
  if (cacheBust) params.set('t', Date.now())
  const query = params.toString()
  return query ? `${endpoint}?${query}` : endpoint
}

const fetchLatestQRResponse = async (userId, token = '') => {
  const response = await fetch(getQrUrl(API_ENDPOINTS.qrLatest, userId, true), {
    headers: {
      ...buildHeaders(token),
      'Pragma': 'no-cache',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  })

  const json = await response.json().catch(() => null)
  return { status: response.status, ok: response.ok, json }
}

const extractConnectionFromResult = (connectionResult) => {
  if (connectionResult?.status !== 'fulfilled') return null
  const connPayload = connectionResult.value
  return connPayload?.data || connPayload
}

const extractQrFromResult = (qrResult) => {
  if (qrResult?.status !== 'fulfilled' || !qrResult.value) return null

  const { status: resStatus, ok: resOk, json } = qrResult.value
  const rawData = Array.isArray(json?.data) ? json.data[0] : (json?.data || json)
  const qrCode = rawData?.url || rawData?.qr || json?.url || json?.qr || ''

  if (resStatus === 404 || json?.message === 'No fresh QR URL found') return null
  if (json?.data?.status === 'waiting' && !qrCode) return null
  if (!resOk || !qrCode) return null

  return {
    qrCode,
    createdAt: rawData?.created_at || rawData?.createdAt || json?.created_at || new Date().toISOString(),
    pageUrl: rawData?.page_url || rawData?.pageUrl || '',
    source: rawData?.source || 'API',
  }
}

const buildQrReadyState = (userId, connectionResult, qrResult) => {
  const connectionDetails = extractConnectionFromResult(connectionResult)
  const connected = isWhatsAppConnected(connectionDetails)
  const qrPayload = extractQrFromResult(qrResult)

  return {
    userId: String(userId),
    updatedAt: Date.now(),
    connectionDetails,
    connected,
    displayStatus: connected ? 'connected' : (qrPayload?.qrCode ? 'ready' : 'loading'),
    qrCode: qrPayload?.qrCode || null,
    qrMeta: qrPayload
      ? {
          createdAt: qrPayload.createdAt,
          pageUrl: qrPayload.pageUrl,
          source: qrPayload.source,
        }
      : null,
  }
}

export const qrApi = {
  getLatestQR: () => {
    const userId = getLoggedInUserId()
    const url = userId ? `${API_ENDPOINTS.qrLatest}?userId=${userId}` : API_ENDPOINTS.qrLatest
    return apiRequest(url)
  },
  getConnectionStatus: () => {
    const userId = getLoggedInUserId()
    const url = userId ? `${API_ENDPOINTS.qrConnectionStatus}?userId=${userId}` : API_ENDPOINTS.qrConnectionStatus
    return apiRequest(url)
  },
  getLatestQRResponse: ({ userId = getLoggedInUserId(), token = '' } = {}) => (
    fetchLatestQRResponse(userId, token)
  ),
  prefetchBootstrap: ({ userId = getLoggedInUserId(), token = '', force = false } = {}) => {
    if (!userId) return null

    const cacheKey = String(userId)
    const isFresh = isFreshCache(qrBootstrapCache, cacheKey, QR_BOOTSTRAP_TTL_MS)

    if (!force && isFresh) return qrBootstrapCache

    const statusUrl = getQrUrl(API_ENDPOINTS.qrConnectionStatus, userId)
    const authHeaders = token ? { Authorization: `Bearer ${token}` } : {}

    qrBootstrapCache = {
      userId: cacheKey,
      startedAt: Date.now(),
      connectionResult: settleRequest(apiRequest(statusUrl, { headers: authHeaders })),
      qrResult: settleRequest(fetchLatestQRResponse(userId, token)),
    }

    return qrBootstrapCache
  },
  consumePrefetchedBootstrap: (userId = getLoggedInUserId()) => {
    if (!userId || !qrBootstrapCache) return null
    return isFreshCache(qrBootstrapCache, userId, QR_BOOTSTRAP_TTL_MS)
      ? qrBootstrapCache
      : null
  },
  getReadyState: (userId = getLoggedInUserId()) => {
    if (!userId || !qrReadyCache) return null
    if (qrReadyCache.userId !== String(userId)) return null
    if (Date.now() - qrReadyCache.updatedAt > QR_READY_TTL_MS) return null
    return qrReadyCache
  },
  warmQrSession: async ({ userId = getLoggedInUserId(), token = '', force = false } = {}) => {
    if (!userId) return null

    const cacheKey = String(userId)
    if (!force && qrReadyCache?.userId === cacheKey && Date.now() - qrReadyCache.updatedAt < QR_READY_TTL_MS) {
      return qrReadyCache
    }

    const bootstrap = qrApi.prefetchBootstrap({ userId, token, force: force || !isFreshCache(qrBootstrapCache, cacheKey, QR_BOOTSTRAP_TTL_MS) })
    if (!bootstrap) return qrReadyCache

    const [connectionResult, qrResult] = await Promise.all([
      bootstrap.connectionResult,
      bootstrap.qrResult,
    ])

    qrReadyCache = buildQrReadyState(userId, connectionResult, qrResult)
    return qrReadyCache
  },
  cacheReadyFromResults: (userId, connectionResult, qrResult) => {
    if (!userId) return null
    qrReadyCache = buildQrReadyState(userId, connectionResult, qrResult)
    return qrReadyCache
  },
  getPrefetchedConnectionStatus: async (userId = getLoggedInUserId()) => {
    if (!userId) return null

    if (isFreshCache(qrBootstrapCache, userId, QR_BOOTSTRAP_TTL_MS)) {
      const connectionResult = await qrBootstrapCache.connectionResult
      if (connectionResult.status === 'fulfilled') {
        return connectionResult.value
      }
    }

    const statusUrl = getQrUrl(API_ENDPOINTS.qrConnectionStatus, userId)
    return apiRequest(statusUrl)
  },
};

export const scrapedChatsApi = {
  getChats: (options = {}) => {
    const userId = getLoggedInUserId()
    const params = new URLSearchParams()
    
    params.append('type', options.type || 'all')
    params.append('page', String(options.page ?? 1))
    params.append('pageSize', String(options.pageSize ?? CHATS_PAGE_SIZE))

    if (userId) {
      params.append('userId', userId)
    }

    const search = String(options.search || options.q || '').trim()
    if (search) {
      params.append('search', search)
    }

    Object.entries(options).forEach(([key, val]) => {
      if (!['type', 'page', 'pageSize', 'userId', 'search', 'q'].includes(key) && val !== undefined && val !== null) {
        params.append(key, val)
      }
    })

    const url = `${API_ENDPOINTS.scrapedChats}?${params.toString()}`
    return apiRequest(url)
  },
  getChatStats: () => {
    const userId = getLoggedInUserId()
    const url = userId
      ? `${API_ENDPOINTS.scrapedChatsStats}?userId=${userId}`
      : API_ENDPOINTS.scrapedChatsStats
    return apiRequest(url)
  },
  parseChatsPage: parseChatsPageResponse,
  getMessages: (chatId) => {
    const userId = getLoggedInUserId()
    const params = new URLSearchParams({ chatId })
    if (userId) params.append('userId', userId)
    return apiRequest(`${API_ENDPOINTS.scrapedChatMessages}?${params.toString()}`)
  },
  monitorChats: (jids) => {
    const userId = getLoggedInUserId()
    return apiRequest(API_ENDPOINTS.scrapedChatsMonitor, {
      method: 'POST',
      body: JSON.stringify({
        jids: Array.isArray(jids) ? jids : [jids],
        ...(userId ? { userId } : {}),
      }),
    })
  },
  unmonitorChats: (jids) => {
    const userId = getLoggedInUserId()
    return apiRequest(API_ENDPOINTS.scrapedChatsMonitor, {
      method: 'POST',
      body: JSON.stringify({
        jids: Array.isArray(jids) ? jids : [jids],
        action: 'unmonitor',
        isMonitored: false,
        ...(userId ? { userId } : {}),
      }),
    })
  },
  getMonitoredChats: () => {
    const userId = getLoggedInUserId()
    const url = userId ? `${API_ENDPOINTS.scrapedChatsMonitored}?userId=${userId}` : API_ENDPOINTS.scrapedChatsMonitored
    return apiRequest(url)
  },
  getCachedAllChats: (userId = getLoggedInUserId()) => readTabCacheData(allChatsTabCache, userId),
  getCachedAllChatsMeta: (userId = getLoggedInUserId()) => readTabCacheMeta(allChatsTabCache, userId),
  getCachedMonitoredChats: (userId = getLoggedInUserId()) => readTabCacheData(monitoredChatsTabCache, userId),
  getCachedMonitoredChatsMeta: (userId = getLoggedInUserId()) => readTabCacheMeta(monitoredChatsTabCache, userId),
  setCachedAllChats: (data, userId = getLoggedInUserId(), meta = {}) => {
    if (!userId) return
    storeAllChatsTabCache(userId, data, meta)
  },
  setCachedMonitoredChats: (data, userId = getLoggedInUserId(), meta = {}) => {
    if (!userId) return
    storeMonitoredChatsTabCache(userId, data, meta)
  },
  prefetchAllChats: ({ userId = getLoggedInUserId(), token = '', force = false } = {}) => {
    if (!userId) return null

    const cacheKey = getChatsCacheUserKey(userId)
    if (
      !force
      && allChatsTabCache?.userId === cacheKey
      && Date.now() - allChatsTabCache.updatedAt < CHATS_TAB_CACHE_TTL_MS
    ) {
      return allChatsPrefetch
    }

    if (!force && allChatsPrefetch?.userId === cacheKey) {
      return allChatsPrefetch
    }

    const params = new URLSearchParams({
      type: 'all',
      page: '1',
      pageSize: String(CHATS_PAGE_SIZE),
      userId,
    })
    const authHeaders = token ? { Authorization: `Bearer ${token}` } : {}

    allChatsPrefetch = {
      userId: cacheKey,
      startedAt: Date.now(),
      result: settleRequest(apiRequest(`${API_ENDPOINTS.scrapedChats}?${params.toString()}`, { headers: authHeaders })),
    }

    allChatsPrefetch.result.then((settled) => {
      if (settled.status === 'fulfilled') {
        const page = parseChatsPageResponse(settled.value)
        storeAllChatsTabCache(userId, page.chats, page)
      }
    })

    return allChatsPrefetch
  },
  consumePrefetchedAllChats: async (userId = getLoggedInUserId()) => {
    const cachedMeta = readTabCacheMeta(allChatsTabCache, userId)
    if (cachedMeta.data.length > 0) return cachedMeta

    if (!allChatsPrefetch || allChatsPrefetch.userId !== getChatsCacheUserKey(userId)) {
      return null
    }

    const settled = await allChatsPrefetch.result
    if (settled.status === 'fulfilled') {
      const page = parseChatsPageResponse(settled.value)
      storeAllChatsTabCache(userId, page.chats, page)
      return readTabCacheMeta(allChatsTabCache, userId)
    }

    throw settled.reason
  },
  prefetchMonitoredChats: ({ userId = getLoggedInUserId(), token = '', force = false } = {}) => {
    if (!userId) return null

    const cacheKey = getChatsCacheUserKey(userId)
    if (
      !force
      && monitoredChatsTabCache?.userId === cacheKey
      && Date.now() - monitoredChatsTabCache.updatedAt < CHATS_TAB_CACHE_TTL_MS
    ) {
      return monitoredBootstrapCache
    }

    if (!force && isFreshCache(monitoredBootstrapCache, cacheKey, MONITORED_BOOTSTRAP_TTL_MS)) {
      return monitoredBootstrapCache
    }

    const params = new URLSearchParams({
      type: 'monitored',
      page: '1',
      pageSize: String(CHATS_PAGE_SIZE),
      userId,
    })
    const authHeaders = token ? { Authorization: `Bearer ${token}` } : {}

    monitoredBootstrapCache = {
      userId: cacheKey,
      startedAt: Date.now(),
      monitoredResult: settleRequest(
        apiRequest(`${API_ENDPOINTS.scrapedChats}?${params.toString()}`, { headers: authHeaders })
      ),
    }

    monitoredBootstrapCache.monitoredResult.then((settled) => {
      if (settled.status === 'fulfilled') {
        const page = parseChatsPageResponse(settled.value)
        storeMonitoredChatsTabCache(userId, page.chats.map(chat => ({ ...chat, isMonitored: true })), page)
      }
    })

    return monitoredBootstrapCache
  },
  consumePrefetchedMonitored: async (userId = getLoggedInUserId()) => {
    const cachedMeta = readTabCacheMeta(monitoredChatsTabCache, userId)
    if (cachedMeta.data.length > 0) return cachedMeta

    if (!userId || !monitoredBootstrapCache) return null
    if (!isFreshCache(monitoredBootstrapCache, userId, MONITORED_BOOTSTRAP_TTL_MS)) {
      monitoredBootstrapCache = null
      return null
    }

    const monitoredResult = await monitoredBootstrapCache.monitoredResult
    if (monitoredResult.status === 'fulfilled') {
      const page = parseChatsPageResponse(monitoredResult.value)
      const chats = page.chats.map(chat => ({ ...chat, isMonitored: true }))
      storeMonitoredChatsTabCache(userId, chats, page)
      return readTabCacheMeta(monitoredChatsTabCache, userId)
    }

    throw monitoredResult.reason
  },
  deleteChats: (chatIds) => {
    const userId = getLoggedInUserId()
    return apiRequest(API_ENDPOINTS.scrapedChatsDelete, {
      method: 'POST',
      body: JSON.stringify({
        chatIds: Array.isArray(chatIds) ? chatIds : [chatIds],
        ...(userId ? { userId } : {}),
      }),
    })
  },
  deleteMessages: (messageIds) => {
    const userId = getLoggedInUserId()
    return apiRequest(API_ENDPOINTS.scrapedChatsDelete, {
      method: 'POST',
      body: JSON.stringify({
        messageIds: Array.isArray(messageIds) ? messageIds : [messageIds],
        ...(userId ? { userId } : {}),
      }),
    })
  },
};

const buildPropertyFilterPayload = (filters = {}) => {
  const payload = {}

  if (filters.status) {
    payload.status = String(filters.status).toUpperCase()
  }

  if (filters.purpose && filters.purpose !== 'All') {
    payload.purpose = filters.purpose
  }

  if (filters.city && filters.city !== 'All Cities') {
    payload.city = filters.city
  }

  const location = (filters.location || filters.query || '').trim()
  if (location) {
    payload.location = location
  }

  if (filters.propertyType && filters.propertyType !== 'All') {
    payload.propertyType = filters.propertyType
  }

  if (filters.propertySubType && filters.propertySubType !== 'Any' && filters.propertySubType !== 'Standard') {
    payload.propertySubType = filters.propertySubType
  }

  if (filters.priceMin) payload.priceMin = String(filters.priceMin)
  if (filters.priceMax) payload.priceMax = String(filters.priceMax)

  if (filters.areaUnit && filters.areaUnit !== 'All') {
    payload.areaUnit = filters.areaUnit
  }

  if (filters.areaMin) payload.areaMin = String(filters.areaMin)
  if (filters.areaMax) payload.areaMax = String(filters.areaMax)

  if (filters.sortBy) payload.sortBy = filters.sortBy

  return payload
}

export const propertyApi = {
  getStatuses: () => apiRequest(API_ENDPOINTS.propertyStatuses),
  filterProperties: (filters) => {
    const userId = getLoggedInUserId()
    const normalizedFilters = buildPropertyFilterPayload(filters)

    return apiRequest(API_ENDPOINTS.filterProperties, {
      method: 'POST',
      body: JSON.stringify({
        filters: normalizedFilters,
        ...(userId ? { userId } : {}),
      }),
    })
  },
  updateStatus: (propertyId, status) => {
    const normalizedId = Number(propertyId)
    if (!normalizedId || Number.isNaN(normalizedId)) {
      throw new Error('Valid propertyId is required')
    }

    const normalizedStatus = String(status || '').trim().toUpperCase()

    if (!normalizedStatus) {
      throw new Error('Property status is required')
    }

    if (!PROPERTY_STATUS_ENUM.includes(normalizedStatus)) {
      throw new Error(`Invalid status. Allowed values: ${PROPERTY_STATUS_ENUM.join(', ')}`)
    }

    return apiRequest(propertyStatusPatchUrl(normalizedId), {
      method: 'PATCH',
      body: JSON.stringify({ status: normalizedStatus }),
    })
  },
};

// ML WhatsApp AI Search Backend
const ML_API_PROXY_PREFIX = '/ml-api'
const ML_SEARCH_PATH = '/api/dashboard-search'
const CORS_PROXIED_ML_HOSTS = new Set(['16.16.126.44:8000', '13.48.129.228:8000'])

const addMlSearchPath = (url) => {
  const cleanUrl = url.replace(/\/$/, '')
  return cleanUrl.endsWith(ML_SEARCH_PATH) ? cleanUrl : `${cleanUrl}${ML_SEARCH_PATH}`
}

const toCorsSafeMlUrl = (url) => {
  const configuredUrl = (url || '').trim() || ML_API_PROXY_PREFIX
  const fullUrl = addMlSearchPath(configuredUrl)

  if (fullUrl.startsWith('/')) return fullUrl

  try {
    const parsed = new URL(fullUrl)
    if (CORS_PROXIED_ML_HOSTS.has(parsed.host)) {
      return `${ML_API_PROXY_PREFIX}${parsed.pathname}${parsed.search}`
    }
  } catch (err) {
    console.warn('Invalid VITE_ML_API_URL, falling back to local ML proxy:', err)
    return addMlSearchPath(ML_API_PROXY_PREFIX)
  }

  return fullUrl
}

const ML_SEARCH_URL = toCorsSafeMlUrl(import.meta.env.VITE_ML_API_URL)

export const mlSearchApi = {
  dashboardSearch: (filters = {}) => {
    const userId = getLoggedInUserId()
    const payload = {}

    if (userId) {
      payload.userId = userId
      payload.user_id = userId
    }

    if (filters.purpose && filters.purpose !== 'All') payload.purpose = filters.purpose
    if (filters.city && filters.city !== 'All Cities') payload.city = filters.city
    if (filters.status) payload.status = String(filters.status).toUpperCase()
    
    // Pass user input to ML AI 'query' field so normalization and typo-tolerance work
    const searchParam = (filters.query || filters.location || '').trim()
    if (searchParam) {
      payload.query = searchParam
    }

    if (filters.propertyType && filters.propertyType !== 'All') payload.propertyType = filters.propertyType
    if (filters.propertySubType && filters.propertySubType !== 'Any' && filters.propertySubType !== 'Standard') {
      payload.propertySubType = filters.propertySubType
    }

    if (filters.priceMin) payload.priceMin = parseFloat(filters.priceMin)
    if (filters.priceMax) payload.priceMax = parseFloat(filters.priceMax)

    if (filters.areaMin || filters.areaMax) {
      if (filters.areaUnit && filters.areaUnit !== 'All') payload.areaUnit = filters.areaUnit
      if (filters.areaMin) payload.areaMin = parseFloat(filters.areaMin)
      if (filters.areaMax) payload.areaMax = parseFloat(filters.areaMax)
    }
    if (filters.sortBy) payload.sortBy = filters.sortBy

    payload.limit = filters.limit || 10000

    return fetch(ML_SEARCH_URL, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(payload),
    }).then(async (res) => {
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.detail || data?.message || `ML API error: ${res.status}`)
      return data
    })
  },
};

// 🧠 AI Message Normalization API (Status Only)
export const normalizeApi = {
  getStatus: async () => {
    const userId = getLoggedInUserId()
    const queryParams = new URLSearchParams()
    if (userId) {
      queryParams.append('userId', userId)
      queryParams.append('user_id', userId)
    }

    const url = queryParams.toString()
      ? `${API_ENDPOINTS.normalizeStatus}?${queryParams.toString()}`
      : API_ENDPOINTS.normalizeStatus

    console.log('🔍 [Normalize API] Checking normalization status...', { url, userId })

    try {
      const response = await apiRequest(url)
      console.log('📊 [Normalize API] Normalization Status Response:', response)
      return response
    } catch (err) {
      console.error('❌ [Normalize API] Normalization Status Failed:', err)
      throw err
    }
  },
};

// Expose on window for easy testing in browser console
if (typeof window !== 'undefined') {
  window.normalizeApi = normalizeApi
}
