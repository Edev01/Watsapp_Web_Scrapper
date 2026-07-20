import { useState, useEffect, useCallback } from 'react'
import { QRCodeSVG } from 'qrcode.react'

const API_URL = 'https://amlos-backend.onrender.com/api/auth/get-latest-url'

// WhatsApp QR codes expire in ~20 seconds
const QR_EXPIRY_SECONDS = 20

const STATUS = {
  IDLE: 'idle',
  LOADING: 'loading',
  QR_READY: 'qr_ready',
  EXPIRED: 'expired',
  ERROR: 'error'
}

const isQRExpired = (createdAt) => {
  if (!createdAt) return true
  const created = new Date(createdAt)
  const ageSeconds = (Date.now() - created.getTime()) / 1000
  return ageSeconds > QR_EXPIRY_SECONDS
}

const QRConnect = () => {
  const [status, setStatus] = useState(STATUS.IDLE)
  const [qrData, setQrData] = useState(null)
  const [qrMeta, setQrMeta] = useState(null) // { createdAt, pageUrl }
  const [errorMsg, setErrorMsg] = useState('')
  const [countdown, setCountdown] = useState(QR_EXPIRY_SECONDS)

  const fetchQR = useCallback(async () => {
    setStatus(STATUS.LOADING)
    setErrorMsg('')
    setQrData(null)
    setQrMeta(null)

    try {
      const res = await fetch(API_URL)
      if (!res.ok) throw new Error(`Server error: ${res.status}`)
      const json = await res.json()

      // Parse response: { success, data: { url, source, pageUrl, created_at }, code }
      const data = json?.data
      const rawUrl = data?.url || json?.url

      if (!rawUrl) throw new Error('QR URL not found in API response')

      // Check if QR is already expired
      if (isQRExpired(data?.created_at)) {
        setErrorMsg(
          `QR code is expired (generated: ${data?.created_at ?? 'unknown'}). ` +
          `Ask backend to refresh the WhatsApp session so a fresh QR is generated.`
        )
        setStatus(STATUS.EXPIRED)
        return
      }

      // The URL from API is: https://wa.me/settings/linked_devices#<QR_DATA>
      // WhatsApp mobile needs the FULL URL as the QR value
      setQrData(rawUrl)
      setQrMeta({
        createdAt: data?.created_at,
        pageUrl: data?.pageUrl,
        source: data?.source
      })
      setStatus(STATUS.QR_READY)
      setCountdown(QR_EXPIRY_SECONDS)

    } catch (err) {
      setErrorMsg(err.message || 'Failed to fetch QR code')
      setStatus(STATUS.ERROR)
    }
  }, [])

  // Countdown timer when QR is ready
  useEffect(() => {
    if (status !== STATUS.QR_READY) return
    if (countdown <= 0) {
      setStatus(STATUS.EXPIRED)
      return
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [status, countdown])

  const formatAge = (createdAt) => {
    if (!createdAt) return ''
    const d = new Date(createdAt)
    return d.toLocaleString('en-PK', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-black text-slate-900 mb-1">WhatsApp Connection</h1>
        <p className="text-sm text-slate-500">
          Connect your WhatsApp account by scanning the QR code below.
        </p>
      </div>

      {/* Expired Warning Banner */}
      {status === STATUS.EXPIRED && (
        <div className="mb-5 p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
          <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p className="text-sm font-bold text-amber-800">QR Code Expired</p>
            <p className="text-xs text-amber-700 mt-0.5">
              WhatsApp QR codes expire within {QR_EXPIRY_SECONDS} seconds. The backend needs to open WhatsApp Web and generate a fresh QR. 
              Click "Get Fresh QR" to try again from server.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* QR Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col items-center justify-center min-h-[380px]">

          {/* IDLE */}
          {status === STATUS.IDLE && (
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75V16.5zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75V13.5zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75V13.5zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75V16.5z" />
                </svg>
              </div>
              <p className="text-sm text-slate-600 mb-5 font-medium">Generate a QR code to link your WhatsApp</p>
              <button
                onClick={fetchQR}
                className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-bold text-sm hover:shadow-lg hover:shadow-emerald-500/20 transition-all cursor-pointer"
              >
                Get Fresh QR Code
              </button>
            </div>
          )}

          {/* LOADING */}
          {status === STATUS.LOADING && (
            <div className="text-center">
              <div className="w-16 h-16 rounded-full border-4 border-emerald-200 border-t-emerald-500 animate-spin mx-auto mb-4" />
              <p className="text-sm text-slate-600 font-medium">Fetching QR from server...</p>
              <p className="text-xs text-slate-400 mt-1">Server may take 10–30s to wake up</p>
            </div>
          )}

          {/* QR READY */}
          {status === STATUS.QR_READY && qrData && (
            <div className="text-center">
              {/* Countdown ring */}
              <div className="relative inline-block mb-3">
                <div className="p-3 bg-white rounded-2xl border-2 border-emerald-100 shadow-sm">
                  <QRCodeSVG
                    value={qrData}
                    size={210}
                    bgColor="#ffffff"
                    fgColor="#0f172a"
                    level="M"
                  />
                </div>
                {/* Expiry badge */}
                <div className={`absolute -top-2 -right-2 w-9 h-9 rounded-full flex items-center justify-center text-xs font-black text-white shadow ${
                  countdown > 10 ? 'bg-emerald-500' : 'bg-rose-500'
                }`}>
                  {countdown}s
                </div>
              </div>
              <p className="text-xs font-semibold text-slate-600">Open WhatsApp → Linked Devices → Scan</p>
              {qrMeta?.createdAt && (
                <p className="text-[10px] text-slate-400 mt-1">Generated: {formatAge(qrMeta.createdAt)}</p>
              )}
              <button
                onClick={fetchQR}
                className="mt-3 text-xs text-emerald-600 hover:text-emerald-500 font-bold underline cursor-pointer"
              >
                ↺ Refresh QR
              </button>
            </div>
          )}

          {/* EXPIRED */}
          {status === STATUS.EXPIRED && (
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-3">
                <svg className="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-sm font-bold text-slate-700 mb-1">QR Code Expired</p>
              <p className="text-xs text-slate-500 mb-4 max-w-[200px] mx-auto">
                QR expires in {QR_EXPIRY_SECONDS}s. Backend needs to re-open WhatsApp Web to generate fresh QR.
              </p>
              <button
                onClick={fetchQR}
                className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-bold text-sm transition-all cursor-pointer hover:shadow-md"
              >
                Try Get Fresh QR
              </button>
            </div>
          )}

          {/* ERROR */}
          {status === STATUS.ERROR && (
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-rose-50 flex items-center justify-center mx-auto mb-3">
                <svg className="w-8 h-8 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <p className="text-sm font-bold text-rose-600 mb-1">Request Failed</p>
              <p className="text-xs text-slate-500 mb-4 max-w-[220px] mx-auto">{errorMsg}</p>
              <button onClick={fetchQR} className="px-5 py-2.5 bg-slate-900 text-white rounded-xl font-bold text-sm cursor-pointer hover:bg-slate-800">
                Retry
              </button>
            </div>
          )}
        </div>

        {/* Right Panel */}
        <div className="flex flex-col gap-4">
          {/* How to Connect */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h3 className="font-bold text-slate-900 mb-4 text-sm">How to Connect</h3>
            <div className="space-y-3">
              {[
                { step: '1', title: 'Open WhatsApp on Phone', desc: 'Make sure WhatsApp is up to date' },
                { step: '2', title: 'Go to Linked Devices', desc: 'Tap ⋮ → Linked Devices → Link a Device' },
                { step: '3', title: 'Scan QR Code Quickly', desc: 'QR expires in 20 seconds — scan fast!' },
                { step: '4', title: 'Start Scraping', desc: 'Select groups and extract property data' },
              ].map(item => (
                <div key={item.step} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-emerald-500 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {item.step}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800">{item.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Status Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h3 className="font-bold text-slate-900 mb-3 text-sm">Connection Status</h3>
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                status === STATUS.QR_READY ? 'bg-emerald-500 animate-pulse' :
                status === STATUS.LOADING ? 'bg-amber-400 animate-pulse' :
                status === STATUS.EXPIRED ? 'bg-amber-500' :
                status === STATUS.ERROR ? 'bg-rose-500' : 'bg-slate-300'
              }`} />
              <span className="text-sm font-semibold text-slate-700">
                {status === STATUS.IDLE && 'Not connected'}
                {status === STATUS.LOADING && 'Fetching QR...'}
                {status === STATUS.QR_READY && `QR Ready — scan within ${countdown}s`}
                {status === STATUS.EXPIRED && 'QR Expired — needs backend refresh'}
                {status === STATUS.ERROR && 'Error fetching QR'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Backend: amlos-backend.onrender.com</p>

            {/* Debug info */}
            {qrMeta && (
              <div className="mt-3 p-2.5 bg-slate-50 rounded-lg">
                <p className="text-[10px] text-slate-500 font-mono">Source: {qrMeta.source}</p>
                <p className="text-[10px] text-slate-500 font-mono">Page: {qrMeta.pageUrl}</p>
              </div>
            )}
          </div>

          {/* Important Note */}
          <div className="bg-blue-50 rounded-xl border border-blue-100 p-4">
            <p className="text-xs font-bold text-blue-800 mb-1">⚠️ Important Note</p>
            <p className="text-xs text-blue-700 leading-relaxed">
              WhatsApp QR codes expire in ~20 seconds. If you see "Couldn't link device", the QR was stale from the backend. 
              The backend dev needs to ensure a <strong>live session</strong> is running on web.whatsapp.com when generating the QR.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default QRConnect
