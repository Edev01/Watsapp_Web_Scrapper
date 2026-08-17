const BASE_URL = import.meta.env.VITE_SCRAPPER_URL || 'https://scrapper-node-app.onrender.com';

export const API_ENDPOINTS = {
  adminSignup: `${BASE_URL}/api/auth/admin/signup`,
  login: `${BASE_URL}/api/auth/login`,
  resetPassword: `${BASE_URL}/api/auth/reset-password`,
  users: `${BASE_URL}/api/users`,
  qrLatest: `${BASE_URL}/api/qr/latest`,
  scrapedChats: `${BASE_URL}/api/scraped-chats`,
  scrapedChatMessages: `${BASE_URL}/api/scraped-chats/messages`,
  scrapedChatsMonitor: `${BASE_URL}/api/scraped-chats/monitor`,
  scrapedChatsMonitored: `${BASE_URL}/api/scraped-chats/monitored`,
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

export const scrapedChatsApi = {
  getChats: () => apiRequest(API_ENDPOINTS.scrapedChats),
  getMessages: (chatId) => {
    const params = new URLSearchParams({ chatId })
    return apiRequest(`${API_ENDPOINTS.scrapedChatMessages}?${params.toString()}`)
  },
  monitorChats: (jids) => apiRequest(API_ENDPOINTS.scrapedChatsMonitor, {
    method: 'POST',
    body: JSON.stringify({
      jids: Array.isArray(jids) ? jids : [jids],
    }),
  }),
  unmonitorChats: (jids) => apiRequest(API_ENDPOINTS.scrapedChatsMonitor, {
    method: 'POST',
    body: JSON.stringify({
      jids: Array.isArray(jids) ? jids : [jids],
      action: 'unmonitor',
      isMonitored: false,
    }),
  }),
  getMonitoredChats: () => apiRequest(API_ENDPOINTS.scrapedChatsMonitored),
};

export const propertyApi = {
  filterProperties: (filters) => apiRequest(API_ENDPOINTS.filterProperties, {
    method: 'POST',
    body: JSON.stringify({ filters }),
  }),
};

// ML WhatsApp AI Search Backend
const ML_BASE_URL = import.meta.env.VITE_ML_API_URL || (import.meta.env.DEV ? '/ml-api' : 'http://13.48.129.228:8000');

export const mlSearchApi = {
  dashboardSearch: (filters = {}) => {
    const payload = {}

    if (filters.purpose && filters.purpose !== 'All') payload.purpose = filters.purpose
    if (filters.city && filters.city !== 'All Cities') payload.city = filters.city
    if (filters.location) payload.location = filters.location
    if (filters.propertyType && filters.propertyType !== 'All') payload.propertyType = filters.propertyType
    if (filters.propertySubType) payload.propertySubType = filters.propertySubType
    if (filters.priceMin) payload.priceMin = parseFloat(filters.priceMin)
    if (filters.priceMax) payload.priceMax = parseFloat(filters.priceMax)
    if (filters.areaMin || filters.areaMax) {
      if (filters.areaUnit) payload.areaUnit = filters.areaUnit
      if (filters.areaMin) payload.areaMin = parseFloat(filters.areaMin)
      if (filters.areaMax) payload.areaMax = parseFloat(filters.areaMax)
    }
    if (filters.sortBy) payload.sortBy = filters.sortBy
    if (filters.query) payload.query = filters.query

    payload.limit = filters.limit || 50

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
