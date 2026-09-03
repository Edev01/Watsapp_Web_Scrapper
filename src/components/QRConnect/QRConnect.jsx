import { useState, useEffect, useCallback, useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { io } from 'socket.io-client'
import { API_ENDPOINTS } from '../../api'

const SOCKET_BASE_URL = (
  import.meta.env.VITE_SCRAPPER_URL || 'https://watsapp-web-backend.onrender.com'
).replace(/\/$/, '')
const POLL_INTERVAL = 5000

const STATUS = {
  LOADING: 'loading',
  READY: 'ready',
  CONNECTED: 'connected',
  WAITING: 'waiting',
  ERROR: 'error'
}

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

const getStoredUserId = () => {
  try {
    const saved = JSON.parse(localStorage.getItem('currentUser') || 'null')
    return saved?.id || saved?.userId || saved?.user_id || null
  } catch {
    return null
  }
}

const QRConnect = () => {
  const [status, setStatus] = useState(STATUS.LOADING)
  const [qrData, setQrData] = useState(null)
  const [qrMeta, setQrMeta] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [lastUpdatedText, setLastUpdatedText] = useState('')
  const [socketConnected, setSocketConnected] = useState(false)
  const [boundPhone, setBoundPhone] = useState('')

  const isInitialFetch = useRef(true)
  const userIdRef = useRef(getStoredUserId())

  const applyConnected = useCallback((phone = '') => {
    setQrData(null)
    setStatus(STATUS.CONNECTED)
    setErrorMsg('')
    if (phone) setBoundPhone(phone)
    isInitialFetch.current = false
  }, [])

  const applyWaiting = useCallback((message = '') => {
    setStatus((prev) => (prev === STATUS.READY && qrData ? prev : STATUS.WAITING))
    if (message) setErrorMsg(message)
    isInitialFetch.current = false
  }, [qrData])

  const applyQr = useCallback((qrCode, rawData = {}) => {
    if (!qrCode) return
    setQrData(qrCode)
    const createdAt =
      rawData?.created_at || rawData?.createdAt || new Date().toISOString()
    setQrMeta({
      createdAt,
      pageUrl: rawData?.page_url || rawData?.pageUrl || '',
      source: rawData?.source || 'API'
    })
    setLastUpdatedText(formatRelativeTime(createdAt))
    setStatus(STATUS.READY)
    setErrorMsg('')
    isInitialFetch.current = false
  }, [])

  const syncConnectionState = useCallback(async (silent = false) => {
    if (!silent && isInitialFetch.current) {
      setStatus(STATUS.LOADING)
    }

    const userId = userIdRef.current || getStoredUserId()
    userIdRef.current = userId
    const qs = userId ? `userId=${encodeURIComponent(userId)}&` : ''

    try {
      const statusUrl = `${SOCKET_BASE_URL}/api/qr/connection-status?${qs}t=${Date.now()}`
      const statusRes = await fetch(statusUrl, {
        headers: {
          'bypass-tunnel-reminder': 'true',
          Pragma: 'no-cache',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          ...(localStorage.getItem('authToken')
            ? { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
            : {})
        }
      })
      const statusJson = statusRes.ok ? await statusRes.json().catch(() => null) : null
      const conn = statusJson?.data || {}

      if (conn.boundPhone || conn.boundWhatsappPhone) {
        setBoundPhone(conn.boundPhone || conn.boundWhatsappPhone)
      }

      // Linked / connected → show connected (no QR)
      if (conn.whatsappConnected || conn.linked || conn.status === 'linked') {
        applyConnected(conn.boundPhone || conn.boundWhatsappPhone || '')
        return
      }

      // Not linked → fetch QR (or waiting for worker)
      const cacheBustUrl = `${API_ENDPOINTS.qrLatest}${
        API_ENDPOINTS.qrLatest.includes('?') ? '&' : '?'
      }${qs}t=${Date.now()}`
      const res = await fetch(cacheBustUrl, {
        headers: {
          'bypass-tunnel-reminder': 'true',
          Pragma: 'no-cache',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          ...(localStorage.getItem('authToken')
            ? { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
            : {})
        }
      })
      const json = await res.json().catch(() => null)
      const rawData = Array.isArray(json?.data) ? json.data[0] : json?.data || json || {}
      const linked = rawData?.linked === true || rawData?.status === 'linked'
      const qrCode = rawData?.url || rawData?.qr || json?.url || json?.qr || ''

      if (linked) {
        applyConnected(rawData?.boundPhone || '')
        return
      }

      if (qrCode) {
        applyQr(qrCode, rawData)
        return
      }

      // Logged out / waiting — clear "Connected" UI even if QR not ready yet
      setQrData(null)
      setStatus(STATUS.WAITING)
      setErrorMsg(
        conn.message ||
          rawData?.message ||
          json?.message ||
          'Waiting for a fresh QR code…'
      )
      isInitialFetch.current = false
    } catch (err) {
      console.error('QR/connection sync error:', err.message)
      if (isInitialFetch.current) {
        setStatus(STATUS.ERROR)
        setErrorMsg(err.message || 'Failed to fetch WhatsApp status')
      }
    }
  }, [applyConnected, applyQr])

  // Socket.IO live sync
  useEffect(() => {
    let socket
    try {
      socket = io(SOCKET_BASE_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true
      })

      socket.on('connect', () => {
        setSocketConnected(true)
        const userId = userIdRef.current || getStoredUserId()
        if (userId) {
          socket.emit('join_user_room', { userId })
        }
      })

      socket.on('disconnect', () => {
        setSocketConnected(false)
      })

      socket.on('new_qr', (data) => {
        const rawData = Array.isArray(data) ? data[0] : data
        const qrCode =
          typeof rawData === 'string'
            ? rawData
            : rawData?.url || rawData?.qr || rawData?.data || ''
        if (qrCode) applyQr(qrCode, rawData)
      })

      socket.on('qr_disappeared', () => {
        applyConnected()
      })

      socket.on('whatsapp_connection_status', (data) => {
        if (data?.linked || data?.status === 'linked') {
          applyConnected(data?.boundPhone || '')
        } else {
          setQrData(null)
          setStatus(STATUS.WAITING)
          setErrorMsg(data?.message || 'WhatsApp disconnected — waiting for QR')
          syncConnectionState(true)
        }
      })

      socket.on('link_session_waiting', () => {
        setQrData(null)
        setStatus(STATUS.WAITING)
        setErrorMsg('WhatsApp logged out — generating a new QR…')
        syncConnectionState(true)
      })
    } catch (e) {
      console.error('Socket initialization error:', e)
    }

    return () => {
      if (socket) socket.disconnect()
    }
  }, [applyConnected, applyQr, syncConnectionState])

  useEffect(() => {
    syncConnectionState(false)
    const interval = setInterval(() => syncConnectionState(true), POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [syncConnectionState])

  useEffect(() => {
    if (!qrMeta?.createdAt) return
    const timer = setInterval(() => {
      setLastUpdatedText(formatRelativeTime(qrMeta.createdAt))
    }, 5000)
    return () => clearInterval(timer)
  }, [qrMeta?.createdAt])

  return (
    <div className="p-8 max-w-lg mx-auto transition-colors text-center">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 mb-1">
          WhatsApp Connection
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Connect your WhatsApp account by scanning the QR code below.
        </p>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm flex flex-col items-center justify-center min-h-[380px] transition-colors relative">
        {status === STATUS.LOADING && (
          <div className="text-center py-8">
            <div className="w-14 h-14 rounded-full border-4 border-emerald-200 border-t-emerald-500 animate-spin mx-auto mb-4" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Checking WhatsApp status...
            </p>
          </div>
        )}

        {status === STATUS.WAITING && (
          <div className="text-center py-8">
            <div className="w-14 h-14 rounded-full border-4 border-amber-200 border-t-amber-500 animate-spin mx-auto mb-4" />
            <p className="text-base font-black text-slate-900 dark:text-slate-100 mb-1">
              WhatsApp Disconnected
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-[260px] mx-auto mb-4">
              {errorMsg ||
                (boundPhone
                  ? `Waiting to re-link ${boundPhone}`
                  : 'Waiting for a fresh QR code…')}
            </p>
            <button
              onClick={() => syncConnectionState(false)}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-xs transition-colors cursor-pointer"
            >
              Refresh Status
            </button>
          </div>
        )}

        {status === STATUS.READY && qrData && (
          <div className="text-center flex flex-col items-center w-full">
            <div className="flex items-center gap-2 mb-4 px-3.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50">
              <span
                className={`w-2 h-2 rounded-full ${
                  socketConnected ? 'bg-emerald-500 animate-ping' : 'bg-amber-500'
                }`}
              />
              <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                {socketConnected ? 'WebSocket Live Sync' : 'Polling sync'}
              </span>
            </div>

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
              Open WhatsApp → Linked Devices → Link a Device
            </p>
            {boundPhone ? (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 font-semibold">
                Must use phone {boundPhone}
              </p>
            ) : null}

            <div className="flex items-center justify-center gap-3 mt-2">
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Last updated:{' '}
                <span className="font-semibold text-slate-600 dark:text-slate-400">
                  {lastUpdatedText}
                </span>
              </p>
              <button
                onClick={() => syncConnectionState(false)}
                className="text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 dark:hover:text-emerald-300 font-bold underline cursor-pointer"
              >
                ↺ Refresh
              </button>
            </div>
          </div>
        )}

        {status === STATUS.CONNECTED && (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center mx-auto mb-4 text-emerald-600 dark:text-emerald-400">
              <svg
                className="w-8 h-8"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <p className="text-base font-black text-slate-900 dark:text-slate-100 mb-1">
              WhatsApp Connected!
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-[240px] mx-auto mb-4">
              {boundPhone
                ? `Linked as ${boundPhone}. If you log out on your phone, this page will show a new QR.`
                : 'Linked successfully. Logging out on phone will show a new QR here.'}
            </p>
            <button
              onClick={() => syncConnectionState(false)}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-xs transition-colors cursor-pointer"
            >
              Refresh Status
            </button>
          </div>
        )}

        {status === STATUS.ERROR && (
          <div className="text-center py-6">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-950/40 flex items-center justify-center mx-auto mb-3">
              <svg
                className="w-7 h-7 text-rose-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <p className="text-sm font-bold text-rose-600 dark:text-rose-400 mb-1">
              Server Connection Failed
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 max-w-[220px] mx-auto">
              {errorMsg}
            </p>
            <button
              onClick={() => syncConnectionState(false)}
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
