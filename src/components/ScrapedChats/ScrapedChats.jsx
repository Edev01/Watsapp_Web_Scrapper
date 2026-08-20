import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { API_ENDPOINTS, scrapedChatsApi } from '../../api'

const extractList = (payload) => {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.chats)) return payload.chats
  if (Array.isArray(payload?.messages)) return payload.messages
  if (Array.isArray(payload?.data?.chats)) return payload.data.chats
  if (Array.isArray(payload?.data?.messages)) return payload.data.messages
  return []
}

const normalizeDate = (value) => {
  if (!value) return ''

  const numericValue = Number(value)
  if (Number.isFinite(numericValue) && String(value).trim() !== '') {
    const date = new Date(numericValue < 1000000000000 ? numericValue * 1000 : numericValue)
    return Number.isNaN(date.getTime()) ? '' : date.toISOString()
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

const normalizeChat = (chat = {}) => ({
  jid: chat.jid || chat.chatId || chat.id || chat._id || '',
  name: chat.name || chat.pushName || chat.displayName || chat.title || chat.jid || 'Unknown chat',
  avatar: chat.avatar || chat.profilePicUrl || chat.picture || chat.image || '',
  isMonitored: Boolean(chat.is_monitored ?? chat.isMonitored ?? chat.monitored),
  createdAt: normalizeDate(chat.created_at || chat.createdAt || chat.updated_at || chat.updatedAt),
})

const getCurrentUserTokens = () => {
  const tokens = new Set()
  try {
    const saved = localStorage.getItem('currentUser')
    if (saved) {
      const user = JSON.parse(saved)
      const fullName = String(user?.fullName || user?.name || user?.username || '').toLowerCase().trim()
      const email = String(user?.email || '').toLowerCase().trim()
      const emailPrefix = email.split('@')[0]

      if (fullName) {
        tokens.add(fullName)
        fullName.split(/\s+/).forEach(part => {
          if (part.length >= 3 && part !== 'user' && part !== 'standard' && part !== 'admin') {
            tokens.add(part)
          }
        })
      }
      if (emailPrefix && emailPrefix.length >= 3) {
        tokens.add(emailPrefix)
      }
    }
  } catch {}
  return tokens
}

const normalizeMessage = (message = {}, index) => {
  const id = typeof message.id === 'object'
    ? message.id?._serialized || message.id?.id
    : message.id

  const body = message.body
    || message.text
    || message.message
    || message.content
    || message.caption
    || message._data?.body
    || ''

  const from = message.from || message.author || message.sender || message._data?.from || ''
  const to = message.to || message.recipient || message._data?.to || ''
  const senderName = message.senderName || message.sender || message.notifyName || message.pushName || message._data?.notifyName || from || 'Unknown sender'

  const explicitFromMe = message.fromMe ?? message.from_me ?? message.isFromMe ?? message.id?.fromMe ?? message.key?.fromMe

  const userTokens = getCurrentUserTokens()
  const cleanSender = String(senderName || '').toLowerCase().trim()

  let fromMe = false

  if (explicitFromMe === true || explicitFromMe === 'true') {
    fromMe = true
  } else if (typeof id === 'string' && id.startsWith('true_')) {
    fromMe = true
  } else if (cleanSender === 'you' || cleanSender === 'me' || cleanSender === 'self') {
    fromMe = true
  } else if (userTokens.size > 0 && cleanSender) {
    for (const token of userTokens) {
      if (cleanSender.includes(token) || token.includes(cleanSender)) {
        fromMe = true
        break
      }
    }
  }

  return {
    id: id || `${from || to || 'message'}-${message.timestamp || index}`,
    body: String(body || ''),
    from,
    to,
    senderName,
    type: message.type || message.messageType || message._data?.type || 'message',
    fromMe,
    createdAt: normalizeDate(message.created_at || message.createdAt || message.timestamp || message.t),
  }
}

const formatDateTime = (value) => {
  if (!value) return 'No timestamp'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No timestamp'

  return date.toLocaleString('en-PK', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const getInitial = (value) => {
  const cleaned = String(value || '').trim()
  return cleaned ? cleaned.charAt(0).toUpperCase() : '?'
}

const ChatAvatar = ({ chat }) => {
  const [failed, setFailed] = useState(false)

  if (chat.avatar && !failed) {
    return (
      <img
        src={chat.avatar}
        alt=""
        className="w-10 h-10 rounded-xl object-cover bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-700 shrink-0"
        onError={() => setFailed(true)}
      />
    )
  }

  return (
    <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60 flex items-center justify-center text-sm font-black shrink-0">
      {getInitial(chat.name || chat.jid)}
    </div>
  )
}

const StatBox = ({ label, value, sub }) => (
  <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
    <p className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-1">{value}</p>
    {sub && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">{sub}</p>}
  </div>
)

const EmptyState = ({ title, description }) => (
  <div className="text-center py-12 px-4">
    <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-700/70 mx-auto mb-3 flex items-center justify-center">
      <svg className="w-6 h-6 text-slate-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-4 4v-4z" />
      </svg>
    </div>
    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{title}</p>
    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{description}</p>
  </div>
)

const ConfirmModal = ({ isOpen, title, message, confirmText = 'Delete', isLoading = false, onConfirm, onCancel }) => {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity" onClick={isLoading ? undefined : onCancel} />
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl max-w-md w-full p-6 space-y-4 z-10 animate-scaleUp">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-slate-100">{title}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{message}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-700">
          <button
            type="button"
            disabled={isLoading}
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={onConfirm}
            className="inline-flex items-center justify-center gap-2 px-5 py-2 rounded-xl text-white text-xs font-bold bg-rose-600 hover:bg-rose-500 shadow-sm hover:shadow-rose-500/20 disabled:opacity-60 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            {isLoading && (
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            <span>{confirmText}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

const ScrapedChats = ({ setToast }) => {
  const messagesEndRef = useRef(null)
  const messagesContainerRef = useRef(null)
  const [chats, setChats] = useState([])
  const [messages, setMessages] = useState([])
  const [selectedChatId, setSelectedChatId] = useState('')
  const [selectedJids, setSelectedJids] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [chatFilter, setChatFilter] = useState('all')
  const [loadingChats, setLoadingChats] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [monitoringIds, setMonitoringIds] = useState([])
  const [deletingJids, setDeletingJids] = useState([])
  const [deletingMessageIds, setDeletingMessageIds] = useState([])
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Delete',
    isLoading: false,
    onConfirm: () => {},
  })
  const [error, setError] = useState('')
  const [messageError, setMessageError] = useState('')
  const [lastSyncedAt, setLastSyncedAt] = useState('')
  const [showMobileMessages, setShowMobileMessages] = useState(false)

  const selectedChat = useMemo(
    () => chats.find(chat => chat.jid === selectedChatId) || null,
    [chats, selectedChatId]
  )

  const monitoredCount = useMemo(
    () => chats.filter(chat => chat.isMonitored).length,
    [chats]
  )

  const selectedJidSet = useMemo(
    () => new Set(selectedJids),
    [selectedJids]
  )

  const visibleChats = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    const baseList = chatFilter === 'monitored'
      ? chats.filter(chat => chat.isMonitored)
      : chats

    if (!term) return baseList

    return baseList.filter(chat => (
      chat.name.toLowerCase().includes(term)
      || chat.jid.toLowerCase().includes(term)
    ))
  }, [chatFilter, chats, searchTerm])

  const selectedUnmonitoredJids = useMemo(
    () => selectedJids.filter(id => chats.some(chat => chat.jid === id && !chat.isMonitored)),
    [selectedJids, chats]
  )

  const selectedMonitoredJids = useMemo(
    () => selectedJids.filter(id => chats.some(chat => chat.jid === id && chat.isMonitored)),
    [selectedJids, chats]
  )

  const allVisibleSelected = visibleChats.length > 0
    && visibleChats.every(chat => selectedJidSet.has(chat.jid))

  const loadChats = useCallback(async () => {
    setLoadingChats(true)
    setError('')

    const [allChatsResult, monitoredResult] = await Promise.allSettled([
      scrapedChatsApi.getChats(),
      scrapedChatsApi.getMonitoredChats(),
    ])

    const allChats = allChatsResult.status === 'fulfilled'
      ? extractList(allChatsResult.value).map(normalizeChat).filter(chat => chat.jid)
      : []

    const monitoredChats = monitoredResult.status === 'fulfilled'
      ? extractList(monitoredResult.value).map(normalizeChat).filter(chat => chat.jid)
      : []

    const monitoredIds = new Set(monitoredChats.map(chat => chat.jid))
    const knownIds = new Set(allChats.map(chat => chat.jid))

    const mergedChats = [
      ...allChats.map(chat => ({
        ...chat,
        isMonitored: chat.isMonitored || monitoredIds.has(chat.jid),
      })),
      ...monitoredChats
        .filter(chat => !knownIds.has(chat.jid))
        .map(chat => ({ ...chat, isMonitored: true })),
    ]

    setChats(mergedChats)
    setLastSyncedAt(new Date().toISOString())
    setSelectedJids(prev => prev.filter(id => mergedChats.some(chat => chat.jid === id)))

    if (allChatsResult.status === 'rejected' && monitoredResult.status === 'rejected') {
      setError(allChatsResult.reason?.message || 'Failed to load scraped chats')
    }

    setSelectedChatId(prev => {
      if (prev && mergedChats.some(chat => chat.jid === prev)) return prev
      return mergedChats[0]?.jid || ''
    })

    setLoadingChats(false)
  }, [])

  const loadMessages = useCallback(async (chatId) => {
    if (!chatId) {
      setMessages([])
      return
    }

    setLoadingMessages(true)
    setMessageError('')

    try {
      const payload = await scrapedChatsApi.getMessages(chatId)
      const list = extractList(payload)
        .map(normalizeMessage)
        .sort((a, b) => {
          const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0
          const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0
          if (timeA !== timeB) return timeA - timeB
          return (Number(a.id) || 0) - (Number(b.id) || 0)
        })
      setMessages(list)
    } catch (err) {
      setMessages([])
      setMessageError(err.message || 'Failed to load messages')
    } finally {
      setLoadingMessages(false)
    }
  }, [])

  useEffect(() => {
    loadChats()
  }, [loadChats])

  useEffect(() => {
    loadMessages(selectedChatId)
  }, [loadMessages, selectedChatId])

  const scrollToBottom = useCallback((behavior = 'auto') => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior, block: 'end' })
    } else if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    }
  }, [])

  // 📱 WhatsApp-like Auto Scroll to Bottom on chat open / refresh / messages load
  useEffect(() => {
    if (!loadingMessages && messages.length > 0) {
      const frame = requestAnimationFrame(() => {
        scrollToBottom('auto')
      })
      const timer = setTimeout(() => {
        scrollToBottom('auto')
      }, 50)
      return () => {
        cancelAnimationFrame(frame)
        clearTimeout(timer)
      }
    }
  }, [messages, loadingMessages, selectedChatId, scrollToBottom])

  const toggleChatSelection = (chat) => {
    if (!chat?.jid || monitoringIds.includes(chat.jid)) return

    setSelectedJids(prev => (
      prev.includes(chat.jid)
        ? prev.filter(id => id !== chat.jid)
        : [...prev, chat.jid]
    ))
  }

  const toggleVisibleSelection = () => {
    const visibleIds = visibleChats.map(chat => chat.jid)
    if (visibleIds.length === 0) return

    setSelectedJids(prev => {
      if (visibleIds.every(id => prev.includes(id))) {
        return prev.filter(id => !visibleIds.includes(id))
      }

      return Array.from(new Set([...prev, ...visibleIds]))
    })
  }

  const handleMonitorSelected = async () => {
    if (selectedUnmonitoredJids.length === 0) return

    setMonitoringIds(prev => Array.from(new Set([...prev, ...selectedUnmonitoredJids])))

    try {
      await scrapedChatsApi.monitorChats(selectedUnmonitoredJids)
      setToast?.({ type: 'success', message: `${selectedUnmonitoredJids.length} chat${selectedUnmonitoredJids.length > 1 ? 's' : ''} added to monitored chats` })
      setSelectedJids(prev => prev.filter(id => !selectedUnmonitoredJids.includes(id)))
      await loadChats()
    } catch (err) {
      setToast?.({ type: 'error', message: err.message || 'Failed to monitor selected chats' })
    } finally {
      setMonitoringIds(prev => prev.filter(id => !selectedUnmonitoredJids.includes(id)))
    }
  }

  const handleUnmonitorSelected = async () => {
    if (selectedMonitoredJids.length === 0) return

    const jidsToUnmonitor = [...selectedMonitoredJids]
    setMonitoringIds(prev => Array.from(new Set([...prev, ...jidsToUnmonitor])))

    // Optimistic update
    setChats(prev => prev.map(chat => (
      jidsToUnmonitor.includes(chat.jid) ? { ...chat, isMonitored: false } : chat
    )))

    try {
      await scrapedChatsApi.unmonitorChats(jidsToUnmonitor)
      setToast?.({ type: 'success', message: `${jidsToUnmonitor.length} chat${jidsToUnmonitor.length > 1 ? 's' : ''} unmonitored successfully` })
      setSelectedJids(prev => prev.filter(id => !jidsToUnmonitor.includes(id)))
      await loadChats()
    } catch (err) {
      await loadChats()
      setToast?.({ type: 'error', message: err.message || 'Failed to unmonitor selected chats' })
    } finally {
      setMonitoringIds(prev => prev.filter(id => !jidsToUnmonitor.includes(id)))
    }
  }

  const closeConfirmModal = () => {
    setConfirmModal(prev => ({ ...prev, isOpen: false, isLoading: false }))
  }

  const promptDeleteChats = (jids, chatName = '') => {
    if (!jids || jids.length === 0) return
    const isSingle = jids.length === 1
    const title = isSingle ? `Delete "${chatName || 'Chat'}"?` : `Delete ${jids.length} Selected Chats?`
    const message = isSingle
      ? 'This chat and all of its scraped messages will be permanently deleted.'
      : `All ${jids.length} selected chats and their scraped messages will be permanently deleted.`

    setConfirmModal({
      isOpen: true,
      title,
      message,
      confirmText: isSingle ? 'Delete Chat' : `Delete ${jids.length} Chats`,
      isLoading: false,
      onConfirm: () => executeDeleteChats(jids),
    })
  }

  const executeDeleteChats = async (jids) => {
    setConfirmModal(prev => ({ ...prev, isLoading: true }))
    setDeletingJids(prev => Array.from(new Set([...prev, ...jids])))

    try {
      await scrapedChatsApi.deleteChats(jids)
      setToast?.({
        type: 'success',
        message: `${jids.length} chat${jids.length > 1 ? 's' : ''} deleted successfully`,
      })

      setChats(prev => prev.filter(c => !jids.includes(c.jid)))
      setSelectedJids(prev => prev.filter(id => !jids.includes(id)))

      if (jids.includes(selectedChatId)) {
        const remaining = chats.filter(c => !jids.includes(c.jid))
        setSelectedChatId(remaining[0]?.jid || '')
      }

      closeConfirmModal()
      await loadChats()
    } catch (err) {
      setToast?.({ type: 'error', message: err.message || 'Failed to delete selected chats' })
      setConfirmModal(prev => ({ ...prev, isLoading: false }))
    } finally {
      setDeletingJids(prev => prev.filter(id => !jids.includes(id)))
    }
  }

  const promptDeleteMessage = (message) => {
    if (!message?.id) return
    setConfirmModal({
      isOpen: true,
      title: 'Delete Message?',
      message: 'This scraped message will be permanently deleted.',
      confirmText: 'Delete Message',
      isLoading: false,
      onConfirm: () => executeDeleteMessages([message.id]),
    })
  }

  const promptClearChat = (chat) => {
    if (!messages || messages.length === 0) return
    const ids = messages.map(m => m.id).filter(Boolean)
    setConfirmModal({
      isOpen: true,
      title: `Clear All Messages for "${chat.name}"?`,
      message: `All ${messages.length} scraped message(s) in this chat will be permanently deleted.`,
      confirmText: 'Clear All Messages',
      isLoading: false,
      onConfirm: () => executeDeleteMessages(ids, true),
    })
  }

  const executeDeleteMessages = async (messageIds, isClearAll = false) => {
    setConfirmModal(prev => ({ ...prev, isLoading: true }))
    setDeletingMessageIds(prev => Array.from(new Set([...prev, ...messageIds])))

    try {
      await scrapedChatsApi.deleteMessages(messageIds)
      setToast?.({
        type: 'success',
        message: isClearAll
          ? 'All messages cleared successfully'
          : `${messageIds.length} message${messageIds.length > 1 ? 's' : ''} deleted successfully`,
      })

      setMessages(prev => prev.filter(m => !messageIds.includes(m.id)))
      closeConfirmModal()
    } catch (err) {
      setToast?.({ type: 'error', message: err.message || 'Failed to delete message(s)' })
      setConfirmModal(prev => ({ ...prev, isLoading: false }))
    } finally {
      setDeletingMessageIds(prev => prev.filter(id => !messageIds.includes(id)))
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto transition-colors">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100">Scraped Chats</h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            WhatsApp chats, monitored status, and scraped messages
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          {selectedJids.length > 0 && (
            <button
              type="button"
              onClick={() => promptDeleteChats(selectedJids)}
              disabled={deletingJids.length > 0}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <svg className={`w-4 h-4 ${deletingJids.length > 0 ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete Selected ({selectedJids.length})
            </button>
          )}

          {selectedMonitoredJids.length > 0 && (
            <button
              type="button"
              onClick={handleUnmonitorSelected}
              disabled={monitoringIds.length > 0}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <svg className={`w-4 h-4 ${monitoringIds.length > 0 ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Unmonitor Selected ({selectedMonitoredJids.length})
            </button>
          )}

          {selectedUnmonitoredJids.length > 0 && (
            <button
              type="button"
              onClick={handleMonitorSelected}
              disabled={monitoringIds.length > 0}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <svg className={`w-4 h-4 ${monitoringIds.length > 0 ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Monitor Selected ({selectedUnmonitoredJids.length})
            </button>
          )}

          <button
            type="button"
            onClick={loadChats}
            disabled={loadingChats}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-700 text-white text-xs font-bold hover:bg-slate-800 dark:hover:bg-slate-600 disabled:opacity-60 transition-colors cursor-pointer"
          >
            <svg className={`w-4 h-4 ${loadingChats ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatBox label="Total chats" value={chats.length} sub="From scraped chats API" />
        <StatBox label="Monitored" value={monitoredCount} sub="Tracked by monitor API" />
        <StatBox label="Messages" value={messages.length} sub={selectedChat?.name || 'Select a chat'} />
        <StatBox label="Last sync" value={lastSyncedAt ? formatDateTime(lastSyncedAt) : 'Pending'} sub="Dashboard refresh time" />
      </div>

      {error && (
        <div className="mb-4 rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 p-4 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] gap-5">
        <section className={`bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex-col h-[600px] ${showMobileMessages ? 'hidden xl:flex' : 'flex'
          }`}>
          <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-black text-slate-900 dark:text-slate-100">Chats</h2>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{visibleChats.length} visible · {selectedJids.length} selected</p>
            </div>
            <div className="bg-slate-100 dark:bg-slate-900/70 rounded-xl p-1 flex">
              {[
                { id: 'all', label: 'All' },
                { id: 'monitored', label: 'Monitored' },
              ].map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setChatFilter(item.id)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${chatFilter === item.id
                      ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Search Bar inside Chats section */}
          <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800">
            <div className="relative w-full">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="w-4 h-4 text-slate-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input
                type="text"
                value={searchTerm}
                onChange={event => setSearchTerm(event.target.value)}
                placeholder="Search chats..."
                className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
              />
            </div>
          </div>

          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900/35">
            <button
              type="button"
              onClick={toggleVisibleSelection}
              disabled={visibleChats.length === 0}
              className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <span className={`w-4 h-4 rounded border flex items-center justify-center ${allVisibleSelected
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                }`}>
                {allVisibleSelected && (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
              {allVisibleSelected ? 'Unselect visible' : 'Select visible'}
            </button>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              {visibleChats.length} visible chats
            </p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingChats ? (
              <div className="p-4 space-y-3 animate-pulse">
                {[1, 2, 3].map(item => (
                  <div key={item} className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-700" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 bg-slate-200 dark:bg-slate-700 rounded w-36" />
                      <div className="h-2.5 bg-slate-100 dark:bg-slate-700/70 rounded w-48" />
                    </div>
                  </div>
                ))}
              </div>
            ) : visibleChats.length === 0 ? (
              <EmptyState
                title="No chats found"
                description={chatFilter === 'monitored' ? 'No monitored chats yet' : 'Try another search'}
              />
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-700/70">
                {visibleChats.map(chat => {
                  const isSelected = chat.jid === selectedChatId
                  const isChecked = selectedJidSet.has(chat.jid)
                  const isMonitoring = monitoringIds.includes(chat.jid)

                  return (
                    <div
                      key={chat.jid}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setSelectedChatId(chat.jid)
                        setShowMobileMessages(true)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          setSelectedChatId(chat.jid)
                          setShowMobileMessages(true)
                        }
                      }}
                      className={`w-full text-left p-4 transition-colors ${isSelected
                          ? 'bg-emerald-50 dark:bg-emerald-950/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-700/40'
                        }`}
                    >
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          disabled={isMonitoring}
                          onClick={(event) => {
                            event.stopPropagation()
                            toggleChatSelection(chat)
                          }}
                          className={`mt-2 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${isChecked
                              ? chat.isMonitored
                                ? 'bg-rose-600 border-rose-600 text-white'
                                : 'bg-emerald-600 border-emerald-600 text-white'
                              : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 hover:border-emerald-500'
                            }`}
                          aria-label={`Select ${chat.name}`}
                        >
                          {isChecked && (
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                        <ChatAvatar chat={chat} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{chat.name}</p>
                              <p className="text-[11px] text-slate-400 dark:text-slate-500 font-mono truncate mt-0.5">{chat.jid}</p>
                            </div>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${chat.isMonitored
                                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                                : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300'
                              }`}>
                              {chat.isMonitored ? 'Monitored' : 'New'}
                            </span>
                          </div>

                          <div className="mt-3 flex items-center justify-between gap-3">
                            <p className="text-[11px] text-slate-400 dark:text-slate-500">{formatDateTime(chat.createdAt)}</p>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                title={`Delete "${chat.name}"`}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  promptDeleteChats([chat.jid], chat.name)
                                }}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>

                              <span className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold ${isChecked
                                  ? chat.isMonitored
                                    ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                                    : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                                  : chat.isMonitored
                                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                                    : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300'
                                }`}>
                                {isMonitoring && (
                                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                  </svg>
                                )}
                                {chat.isMonitored
                                  ? isChecked ? 'Unmonitor?' : 'Monitored'
                                  : isChecked ? 'Selected' : 'Select'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </section>

        <section className={`bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex-col h-[600px] ${showMobileMessages ? 'flex' : 'hidden xl:flex'
          }`}>
          <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setShowMobileMessages(false)}
                className="xl:hidden p-1.5 -ml-1 rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shrink-0"
                aria-label="Back to chats"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
              </button>
              {selectedChat && <ChatAvatar chat={selectedChat} />}
              <div className="min-w-0">
                <h2 className="text-sm font-black text-slate-900 dark:text-slate-100 truncate">
                  {selectedChat ? selectedChat.name : 'Messages'}
                </h2>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 font-mono truncate mt-0.5">
                  {selectedChat ? selectedChat.jid : 'Select a chat to view conversation'}
                </p>
              </div>
            </div>
            {selectedChat && (
              <div className="flex items-center gap-2">
                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => promptClearChat(selectedChat)}
                    disabled={deletingMessageIds.length > 0}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 text-xs font-bold hover:bg-rose-100 dark:hover:bg-rose-900/50 disabled:opacity-60 transition-colors shrink-0 cursor-pointer"
                  >
                    <svg className={`w-4 h-4 ${deletingMessageIds.length > 0 ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    <span className="hidden sm:inline">Clear Messages</span>
                    <span className="sm:hidden">Clear</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => loadMessages(selectedChat.jid)}
                  disabled={loadingMessages}
                  className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 text-slate-700 dark:text-slate-300 text-xs font-bold hover:border-emerald-300 dark:hover:border-emerald-700 disabled:opacity-60 transition-colors shrink-0 cursor-pointer"
                >
                  <svg className={`w-4 h-4 ${loadingMessages ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span className="hidden sm:inline">Reload Messages</span>
                  <span className="sm:hidden">Reload</span>
                </button>
              </div>
            )}
          </div>

          <div ref={messagesContainerRef} className="flex-1 bg-slate-50 dark:bg-slate-900/45 p-4 overflow-y-auto">
            {!selectedChat ? (
              <EmptyState title="Select a chat" description="Messages will appear here" />
            ) : loadingMessages ? (
              <div className="space-y-3 animate-pulse">
                {[1, 2, 3, 4].map(item => (
                  <div key={item} className={`flex ${item % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
                    <div className="w-72 max-w-[80%] rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 space-y-2">
                      <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-24" />
                      <div className="h-3 bg-slate-100 dark:bg-slate-700/70 rounded w-full" />
                      <div className="h-3 bg-slate-100 dark:bg-slate-700/70 rounded w-2/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : messageError ? (
              <div className="rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 p-4 text-sm text-rose-700 dark:text-rose-300">
                {messageError}
              </div>
            ) : messages.length === 0 ? (
              <EmptyState title="No messages yet" description="This chat returned an empty message list" />
            ) : (
              <div className="space-y-3">
                {messages.map(message => (
                  <div key={message.id} className={`flex ${message.fromMe ? 'justify-end' : 'justify-start'} group`}>
                    <div className={`relative max-w-[86%] rounded-2xl border p-3 shadow-sm transition-all ${message.fromMe
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100'
                      }`}>
                      <div className="flex items-center justify-between gap-4 mb-1.5">
                        <p className={`text-[10px] font-bold truncate ${message.fromMe ? 'text-emerald-50' : 'text-slate-500 dark:text-slate-400'}`}>
                          {message.fromMe ? 'You' : message.senderName}
                        </p>
                        <div className="flex items-center gap-1.5">
                          <p className={`text-[10px] shrink-0 ${message.fromMe ? 'text-emerald-100' : 'text-slate-400 dark:text-slate-500'}`}>
                            {formatDateTime(message.createdAt)}
                          </p>
                          <button
                            type="button"
                            title="Delete message"
                            onClick={() => promptDeleteMessage(message)}
                            className={`opacity-0 group-hover:opacity-100 p-0.5 rounded transition-opacity cursor-pointer ${
                              message.fromMe ? 'text-emerald-200 hover:text-white' : 'text-slate-400 hover:text-rose-500'
                            }`}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                        {message.body || `[${message.type}]`}
                      </p>
                      {!message.fromMe && message.from && (
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-2 truncate">{message.from}</p>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </section>
      </div>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        isLoading={confirmModal.isLoading}
        onConfirm={confirmModal.onConfirm}
        onCancel={closeConfirmModal}
      />
    </div>
  )
}

export default ScrapedChats
