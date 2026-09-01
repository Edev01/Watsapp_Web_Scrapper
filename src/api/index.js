const BASE_URL = import.meta.env.VITE_SCRAPPER_URL || 'https://scrapper-node-app.onrender.com';

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
  filterProperties: `${BASE_URL}/api/properties/filter`,
  propertyStatuses: `${BASE_URL}/api/properties/statuses`,
  normalizeStatus: `${BASE_URL}/api/normalize/status`,
};

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
let qrBootstrapCache = null

const settleRequest = (promise) => promise.then(
  value => ({ status: 'fulfilled', value }),
  reason => ({ status: 'rejected', reason })
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
    const isFresh = qrBootstrapCache &&
      qrBootstrapCache.userId === cacheKey &&
      Date.now() - qrBootstrapCache.startedAt < QR_BOOTSTRAP_TTL_MS

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
    const isFresh = qrBootstrapCache.userId === String(userId) &&
      Date.now() - qrBootstrapCache.startedAt < QR_BOOTSTRAP_TTL_MS
    const cachedBootstrap = isFresh ? qrBootstrapCache : null
    qrBootstrapCache = null
    return cachedBootstrap
  },
};

export const scrapedChatsApi = {
  getChats: (options = {}) => {
    const userId = getLoggedInUserId()
    const params = new URLSearchParams()
    
    // Default pagination & filter parameters
    params.append('type', options.type || 'chats')
    params.append('page', options.page ?? 1)
    params.append('pageSize', options.pageSize ?? 50)

    if (userId) {
      params.append('userId', userId)
    }

    // Append any extra query parameters if provided
    Object.entries(options).forEach(([key, val]) => {
      if (!['type', 'page', 'pageSize', 'userId'].includes(key) && val !== undefined && val !== null) {
        params.append(key, val)
      }
    })

    const url = `${API_ENDPOINTS.scrapedChats}?${params.toString()}`
    return apiRequest(url)
  },
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

export const propertyApi = {
  getStatuses: () => apiRequest(API_ENDPOINTS.propertyStatuses),
  filterProperties: (filters) => {
    const userId = getLoggedInUserId()
    const normalizedFilters = {
      ...filters,
      ...(filters?.status ? { status: String(filters.status).toUpperCase() } : {}),
    }
    return apiRequest(API_ENDPOINTS.filterProperties, {
      method: 'POST',
      body: JSON.stringify({ filters: normalizedFilters, ...(userId ? { userId } : {}) }),
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
