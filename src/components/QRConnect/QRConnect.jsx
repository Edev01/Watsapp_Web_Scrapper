import { useState, useEffect, useCallback, useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { io } from 'socket.io-client'
import { API_ENDPOINTS, qrApi, getLoggedInUserId } from '../../api'

const API_URL = API_ENDPOINTS.qrLatest
const STATUS_API_URL = API_ENDPOINTS.qrConnectionStatus
const SOCKET_BASE_URL = import.meta.env.VITE_SCRAPPER_URL || 'https://scrapper-node-app.onrender.com'
const POLL_INTERVAL = 5000 // 5 seconds interval fallback

const STATUS = {
  LOADING: 'loading',
  READY: 'ready',
  CONNECTED: 'connected',
  ERROR: 'error'
}

// Format relative time (e.g. "Just now", "25s ago", "5m ago")
const formatRelativeTime = (dateStr) => {
  if (!dateStr) return 'Recently'
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return 'Recently'
  
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 5) return 'Just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  return date.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })
}

const QRConnect = () => {
  const [status, setStatus] = useState(STATUS.LOADING)
  const [qrData, setQrData] = useState(null)
  const [qrMeta, setQrMeta] = useState(null) // { createdAt, pageUrl, source }
  const [connectionDetails, setConnectionDetails] = useState(null) // { linked, boundPhone, whatsappJid, status, message }
  const [checkingStatus, setCheckingStatus] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [lastUpdatedText, setLastUpdatedText] = useState('')
  const [socketConnected, setSocketConnected] = useState(false)

  const isInitialFetch = useRef(true)

  // 📡 Check Active WhatsApp Connection Status via GET /api/qr/connection-status?userId=...
  const checkConnectionStatus = useCallback(async () => {
    try {
      setCheckingStatus(true)
      const res = await qrApi.getConnectionStatus()
      const data = res?.data || res
      console.log('Active WhatsApp Connection Status:', data)
      setConnectionDetails(data)

      if (data?.linked === true || data?.status === 'connected' || data?.status === 'authenticated') {
        setStatus(STATUS.CONNECTED)
        setQrData(null)
        setErrorMsg('')
        return true
      }
      return false
    } catch (err) {
      console.error('Error fetching connection status:', err.message)
      return false
    } finally {
      setCheckingStatus(false)
    }
  }, [])

  // 🔄 Fetch latest QR Code for logged-in user
  const fetchQR = useCallback(async (silent = false) => {
    if (!silent && isInitialFetch.current) {
      setStatus(STATUS.LOADING)
    }

    // First check if user is already connected
    const isAlreadyConnected = await checkConnectionStatus()
    if (isAlreadyConnected) {
      isInitialFetch.current = false
      return
    }

    try {
      const userId = getLoggedInUserId()
      const queryParams = new URLSearchParams({ t: Date.now() })
      if (userId) {
        queryParams.append('userId', userId)
      }

      const cacheBustUrl = `${API_URL}?${queryParams.toString()}`
      const res = await fetch(cacheBustUrl, {
        headers: {
          'bypass-tunnel-reminder': 'true',
          'Pragma': 'no-cache',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      })

      const json = await res.json().catch(() => null)

      // Handle 404 or "No QR found" messages — skip only if there's truly no QR URL
      const rawDataCheck = Array.isArray(json?.data) ? json.data[0] : (json?.data || json)
      const hasQrUrl = !!(rawDataCheck?.url || rawDataCheck?.qr || json?.url || json?.qr)

      if (res.status === 404 || json?.message === 'No fresh QR URL found') {
        setStatus(prev => (prev === STATUS.CONNECTED ? prev : STATUS.LOADING))
        return
      }

      // If backend says "waiting" but has NO QR URL yet, keep loading
      if (json?.data?.status === 'waiting' && !hasQrUrl) {
        setStatus(prev => (prev === STATUS.CONNECTED ? prev : STATUS.LOADING))
        return
      }
      // If status is "waiting" but QR URL IS present, fall through and display it

      if (!res.ok) throw new Error(json?.message || `Server error: ${res.status}`)

      // Handle array or object structure
      const rawData = Array.isArray(json?.data) ? json.data[0] : (json?.data || json)
      const qrCode = rawData?.url || rawData?.qr || json?.url || json?.qr || '';

      if (!qrCode) {
        setStatus(prev => (prev === STATUS.CONNECTED ? prev : STATUS.LOADING))
        return
      }

      const createdAt = rawData?.created_at || rawData?.createdAt || json?.created_at || new Date().toISOString()

      setQrData(qrCode)
      setQrMeta({
        createdAt,
        pageUrl: rawData?.page_url || rawData?.pageUrl || '',
        source: rawData?.source || 'API'
      })
      setLastUpdatedText(formatRelativeTime(createdAt))
      setStatus(STATUS.READY)
      setErrorMsg('')
      isInitialFetch.current = false
    } catch (err) {
      console.error('QR fetch error:', err.message)
      // Only show error if not a 404 / waiting status and no active QR
      if (isInitialFetch.current && !qrData) {
        if (!err.message?.includes('404') && !err.message?.includes('fresh QR')) {
          setStatus(STATUS.ERROR)
          setErrorMsg(err.message || 'Failed to fetch QR code from backend')
        }
      }
    }
  }, [checkConnectionStatus, qrData])

  // ⚡ Socket.IO live sync for real-time QR updates & connection events
  useEffect(() => {
    let socket;
    try {
      socket = io(SOCKET_BASE_URL, {
        transports: ['polling', 'websocket'],
        reconnection: true,
      })

      socket.on('connect', () => {
        setSocketConnected(true)
        try {
          const userId = getLoggedInUserId()
          if (userId) {
            console.log("Emitting join_user_room for userId:", userId)
            socket.emit("join_user_room", { userId })
          }
        } catch (err) {
          console.error("Error emitting join_user_room on connect:", err)
        }
      })

      socket.on('disconnect', () => {
        setSocketConnected(false)
      })

      // Listen for 'new_qr' event from backend
      socket.on('new_qr', (data) => {
        console.log("new_qr_data", data);
        
        const rawData = Array.isArray(data) ? data[0] : data
        const qrCode = typeof rawData === 'string'
          ? rawData
          : (rawData?.url || rawData?.qr || rawData?.data || '')

        if (qrCode) {
          setQrData(qrCode)
          const createdAt = rawData?.created_at || rawData?.createdAt || new Date().toISOString()
          setQrMeta({
            createdAt,
            pageUrl: rawData?.page_url || rawData?.pageUrl || '',
            source: 'WebSocket Live'
          })
          setLastUpdatedText(formatRelativeTime(createdAt))
          setStatus(STATUS.READY)
          setErrorMsg('')
          isInitialFetch.current = false
        }
      })

      // Listen for 'qr_disappeared' or 'whatsapp_connected' events
      socket.on('qr_disappeared', () => {
        console.log("qr_disappeared event received");
        checkConnectionStatus()
      })

      socket.on('whatsapp_connected', (data) => {
        console.log("whatsapp_connected event received:", data);
        checkConnectionStatus()
      })
    } catch (e) {
      console.error('Socket initialization error:', e)
    }

    return () => {
      if (socket) socket.disconnect()
    }
  }, [checkConnectionStatus])

  // Initial fetch + Auto polling every 5 seconds as fallback
  useEffect(() => {
    fetchQR(false)

    const interval = setInterval(() => {
      fetchQR(true)
    }, POLL_INTERVAL)

    return () => clearInterval(interval)
  }, [fetchQR])

  // Update relative time readout every 5 seconds
  useEffect(() => {
    if (!qrMeta?.createdAt) return
    const timer = setInterval(() => {
      setLastUpdatedText(formatRelativeTime(qrMeta.createdAt))
    }, 5000)
    return () => clearInterval(timer)
  }, [qrMeta?.createdAt])

  const activePhone = connectionDetails?.boundPhone || (connectionDetails?.whatsappJid ? connectionDetails.whatsappJid.replace('@c.us', '') : '')
  const activeJid = connectionDetails?.boundWhatsappJid || connectionDetails?.whatsappJid || ''

  return (
    <div className="p-4 sm:p-8 max-w-xl mx-auto transition-colors text-center">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 mb-1">WhatsApp Connection</h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          {status === STATUS.CONNECTED
            ? 'Your WhatsApp account is active and connected.'
            : 'Connect your WhatsApp account by scanning the QR code below.'}
        </p>
      </div>

      {/* QR Code / Active Connection Details Box */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 sm:p-8 shadow-sm flex flex-col items-center justify-center min-h-[380px] transition-colors relative">

        {/* LOADING STATE */}
        {status === STATUS.LOADING && (
          <div className="text-center py-8">
            <div className="w-14 h-14 rounded-full border-4 border-emerald-200 border-t-emerald-500 animate-spin mx-auto mb-4" />
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Generating WhatsApp QR Code...</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Connecting to WhatsApp server and preparing fresh QR code</p>
          </div>
        )}

        {/* 🟢 ACTIVE CONNECTED DETAILS STATE */}
        {status === STATUS.CONNECTED && (
          <div className="text-center flex flex-col items-center w-full py-2">
            <div className="w-16 h-16 rounded-3xl bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center mx-auto mb-4 text-emerald-600 dark:text-emerald-400 shadow-inner">
              <svg className="w-9 h-9" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              </svg>
            </div>

            {/* Status Badge */}
            <div className="inline-flex items-center gap-2 mb-3 px-3.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                Active WhatsApp Connected
              </span>
            </div>

            <h2 className="text-lg font-black text-slate-900 dark:text-slate-100 mb-1">
              WhatsApp Linked Successfully!
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-5 max-w-xs">
              {connectionDetails?.message || 'Your device is actively synced and scraping messages in real-time.'}
            </p>

            {/* Active Details Card */}
            <div className="w-full bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 mb-5 text-left space-y-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                Active WhatsApp Account Details
              </p>

              {activePhone && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Bound Number:</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                    +{activePhone}
                  </span>
                </div>
              )}

              {activeJid && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">WhatsApp JID:</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300 truncate max-w-[200px]">
                    {activeJid}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Connection Status:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {connectionDetails?.status || 'Connected'}
                </span>
              </div>

              {connectionDetails?.userId && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">User ID:</span>
                  <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                    #{connectionDetails.userId}
                  </span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 w-full">
              <button 
                type="button"
                onClick={checkConnectionStatus} 
                disabled={checkingStatus}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-xs transition-colors cursor-pointer disabled:opacity-60"
              >
                <svg className={`w-3.5 h-3.5 ${checkingStatus ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Check Status</span>
              </button>

              <button 
                type="button"
                onClick={() => fetchQR(false)} 
                className="px-4 py-2.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-300 rounded-xl font-bold text-xs transition-colors cursor-pointer"
              >
                Relink QR
              </button>
            </div>
          </div>
        )}

        {/* 📱 READY STATE (QR Code display for scanning) */}
        {status === STATUS.READY && qrData && (
          <div className="text-center flex flex-col items-center w-full">
            {/* Live sync badge */}
            <div className="flex items-center gap-2 mb-4 px-3.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50">
              <span className={`w-2 h-2 rounded-full ${socketConnected ? 'bg-emerald-500 animate-ping' : 'bg-amber-500'}`} />
              <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                {socketConnected ? 'WebSocket Live Sync' : 'Live Sync Active'}
              </span>
            </div>

            {/* QR Code Container */}
            <div className="p-4 bg-white rounded-2xl border-2 border-emerald-100 dark:border-slate-700 shadow-md transition-transform hover:scale-[1.01]">
              <QRCodeSVG
                value={qrData}
                size={220}
                bgColor="#ffffff"
                fgColor="#0f172a"
                level="H"
              />
            </div>

            <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-4">
              Open WhatsApp › Linked Devices › Link a Device
            </p>
            
            <div className="flex items-center justify-center gap-3 mt-2">
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Last updated: <span className="font-semibold text-slate-600 dark:text-slate-400">{lastUpdatedText}</span>
              </p>
              <button
                type="button"
                onClick={() => fetchQR(false)}
                className="text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 dark:hover:text-emerald-300 font-bold underline cursor-pointer"
              >
                ↻ Refresh
              </button>
            </div>

            {connectionDetails?.message && (
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-3 max-w-xs">
                ℹ️ {connectionDetails.message}
              </p>
            )}
          </div>
        )}

        {/* ❌ ERROR STATE */}
        {status === STATUS.ERROR && (
          <div className="text-center py-6">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-950/40 flex items-center justify-center mx-auto mb-3">
              <svg className="w-7 h-7 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-sm font-bold text-rose-600 dark:text-rose-400 mb-1">Server Connection Failed</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 max-w-[220px] mx-auto">{errorMsg}</p>
            <button 
              type="button"
              onClick={() => fetchQR(false)} 
              className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-xs cursor-pointer hover:bg-emerald-500 transition-colors shadow-sm"
            >
              Retry Connection
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default QRConnect
