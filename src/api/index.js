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
};

const buildHeaders = () => {
  const token = localStorage.getItem('authToken')
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
};

export const scrapedChatsApi = {
  getChats: () => {
    const userId = getLoggedInUserId()
    const url = userId ? `${API_ENDPOINTS.scrapedChats}?userId=${userId}` : API_ENDPOINTS.scrapedChats
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
  filterProperties: (filters) => apiRequest(API_ENDPOINTS.filterProperties, {
    method: 'POST',
    body: JSON.stringify({ filters }),
  }),
};

// ML WhatsApp AI Search Backend
const ML_BASE_URL = import.meta.env.VITE_ML_API_URL || '/ml-api';

export const mlSearchApi = {
  dashboardSearch: (filters = {}) => {
    const payload = {}

    if (filters.purpose && filters.purpose !== 'All') payload.purpose = filters.purpose
    if (filters.city && filters.city !== 'All Cities') payload.city = filters.city
    if (filters.location) payload.location = filters.location
    if (filters.areaMin || filters.areaMax) {
      if (filters.areaUnit) payload.areaUnit = filters.areaUnit
      if (filters.areaMin) payload.areaMin = parseFloat(filters.areaMin)
      if (filters.areaMax) payload.areaMax = parseFloat(filters.areaMax)
    }
    if (filters.sortBy) payload.sortBy = filters.sortBy
    if (filters.query) payload.query = filters.query

    payload.limit = filters.limit || 10000

    return fetch(`${ML_BASE_URL}/api/dashboard-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(async (res) => {
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.detail || `ML API error: ${res.status}`)
      return data
    })
  },
};
