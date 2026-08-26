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

  // Priority: WhatsApp `timestamp` (actual message time) → then DB `created_at`
  // `created_at` is DB insertion time which can be wrong if messages arrive out-of-order
  const msgTimestamp = normalizeDate(message.timestamp || message.t || message.created_at || message.createdAt)
  const dbCreatedAt = normalizeDate(message.created_at || message.createdAt)

  return {
    id: id || `${from || to || 'message'}-${message.timestamp || index}`,
    body: String(body || ''),
    from,
    to,
    senderName,
    type: message.type || message.messageType || message._data?.type || 'message',
    fromMe,
    createdAt: msgTimestamp || dbCreatedAt,  // display timestamp
    msgTimestamp,                              // raw WhatsApp timestamp for sorting
    dbCreatedAt,                               // DB insertion time (fallback)
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

const formatTimeOnly = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return date.toLocaleString('en-PK', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

const getInitial = (value) => {
  const cleaned = String(value || '').trim()
  return cleaned ? cleaned.charAt(0).toUpperCase() : '?'
}

// 🔤 Highlight matching text helper
const HighlightMatchedText = ({ text = '', query = '' }) => {
  const trimmed = query.trim()
  if (!trimmed || !text) return <span>{text}</span>

  const escapedQuery = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${escapedQuery})`, 'gi')
  const parts = String(text).split(regex)

  return (
    <span>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark
            key={i}
            className="bg-emerald-200 dark:bg-emerald-500/40 text-emerald-950 dark:text-emerald-100 font-bold px-0.5 rounded transition-colors"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  )
}

const ChatAvatar = ({ chat }) => {
  const [failed, setFailed] = useState(false)

  if (chat?.avatar && !failed) {
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
      {getInitial(chat?.name || chat?.jid)}
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
  const dropdownRef = useRef(null)
  const chatHeaderMenuRef = useRef(null)
  const chatContextMenuRef = useRef(null)
  const chatListContainerRef = useRef(null)
  const searchInputRef = useRef(null)
  const highlightTimeoutRef = useRef(null)
  // Right-click context menu refs
  const chatListCtxMenuRef = useRef(null)
  const msgCtxMenuRef = useRef(null)

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
  const [openDropdownJid, setOpenDropdownJid] = useState(null)
  const [dropdownPlacement, setDropdownPlacement] = useState('down')
  
  // 📱 WhatsApp Web Feature States
  const [chatHeaderMenuOpen, setChatHeaderMenuOpen] = useState(false)
  const [chatContextMenu, setChatContextMenu] = useState({
    isOpen: false,
    x: 0,
    y: 0,
    targetMessage: null,
  })
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedMessageIds, setSelectedMessageIds] = useState([])
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [messageSearchQuery, setMessageSearchQuery] = useState('')
  const [highlightedMsgId, setHighlightedMsgId] = useState(null)

  // 🖱️ Right-Click Context Menu: Chat List Item
  const [chatListContextMenu, setChatListContextMenu] = useState({
    isOpen: false, x: 0, y: 0, chat: null,
  })
  // 🖱️ Right-Click Context Menu: Message Bubble
  const [msgContextMenu, setMsgContextMenu] = useState({
    isOpen: false, x: 0, y: 0, message: null,
  })

  const [pinnedJids, setPinnedJids] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('pinned_chat_jids') || '[]')
    } catch {
      return []
    }
  })

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

  // Persist pinned chats
  useEffect(() => {
    localStorage.setItem('pinned_chat_jids', JSON.stringify(pinnedJids))
  }, [pinnedJids])

  // Close dropdowns & menus on click outside or Escape key
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpenDropdownJid(null)
      }
      if (chatHeaderMenuRef.current && !chatHeaderMenuRef.current.contains(e.target)) {
        setChatHeaderMenuOpen(false)
      }
      if (chatContextMenuRef.current && !chatContextMenuRef.current.contains(e.target)) {
        setChatContextMenu(prev => ({ ...prev, isOpen: false }))
      }
      if (chatListCtxMenuRef.current && !chatListCtxMenuRef.current.contains(e.target)) {
        setChatListContextMenu(prev => ({ ...prev, isOpen: false }))
      }
      if (msgCtxMenuRef.current && !msgCtxMenuRef.current.contains(e.target)) {
        setMsgContextMenu(prev => ({ ...prev, isOpen: false }))
      }
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setOpenDropdownJid(null)
        setChatHeaderMenuOpen(false)
        setChatContextMenu(prev => ({ ...prev, isOpen: false }))
        setChatListContextMenu(prev => ({ ...prev, isOpen: false }))
        setMsgContextMenu(prev => ({ ...prev, isOpen: false }))
        if (isSelectionMode) {
          setIsSelectionMode(false)
          setSelectedMessageIds([])
        }
        if (isSearchOpen) {
          setIsSearchOpen(false)
          setMessageSearchQuery('')
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isSelectionMode, isSearchOpen])

  // Auto focus search input when search drawer opens
  useEffect(() => {
    if (isSearchOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 100)
    }
  }, [isSearchOpen])

  // Reset chat-specific states on chat change
  const handleSelectChat = (jid) => {
    setSelectedChatId(jid)
    setShowMobileMessages(true)
    setIsSelectionMode(false)
    setSelectedMessageIds([])
    setIsSearchOpen(false)
    setMessageSearchQuery('')
    setChatHeaderMenuOpen(false)
    setChatContextMenu({ isOpen: false, x: 0, y: 0, targetMessage: null })
  }

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

  const selectedMsgIdSet = useMemo(
    () => new Set(selectedMessageIds),
    [selectedMessageIds]
  )

  const visibleChats = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    let baseList = chatFilter === 'monitored'
      ? chats.filter(chat => chat.isMonitored)
      : chats

    if (term) {
      baseList = baseList.filter(chat => (
        chat.name.toLowerCase().includes(term)
        || chat.jid.toLowerCase().includes(term)
      ))
    }

    // Pinned chats stay on top like WhatsApp Web
    return [...baseList].sort((a, b) => {
      const aPinned = pinnedJids.includes(a.jid)
      const bPinned = pinnedJids.includes(b.jid)
      if (aPinned && !bPinned) return -1
      if (!aPinned && bPinned) return 1
      return 0
    })
  }, [chatFilter, chats, searchTerm, pinnedJids])

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

  // 🔍 Filtered messages for search side drawer
  const searchResults = useMemo(() => {
    const q = messageSearchQuery.trim().toLowerCase()
    if (!q) return []
    return messages.filter(m => (
      (m.body && m.body.toLowerCase().includes(q)) ||
      (m.senderName && m.senderName.toLowerCase().includes(q))
    ))
  }, [messages, messageSearchQuery])

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
          // Sort by WhatsApp timestamp first (most accurate actual message time)
          // Fall back to DB created_at if timestamp is missing
          const timeA = a.msgTimestamp ? new Date(a.msgTimestamp).getTime()
            : a.dbCreatedAt ? new Date(a.dbCreatedAt).getTime() : 0
          const timeB = b.msgTimestamp ? new Date(b.msgTimestamp).getTime()
            : b.dbCreatedAt ? new Date(b.dbCreatedAt).getTime() : 0
          if (timeA !== timeB) return timeA - timeB  // ascending: old → new
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
    // Primary: use messagesEndRef scrollIntoView — most reliable after DOM paint
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior, block: 'end' })
      return
    }
    // Fallback: manually set scrollTop to max
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    }
  }, [])

  // 📱 WhatsApp-like Auto Scroll to Bottom on chat open / messages load
  useEffect(() => {
    if (!loadingMessages && messages.length > 0 && !isSearchOpen) {
      // First paint — scroll immediately after DOM updates
      const frame = requestAnimationFrame(() => {
        scrollToBottom('auto')
      })
      // Second pass — catches slow renders / image loads
      const timer = setTimeout(() => {
        scrollToBottom('auto')
      }, 120)
      // Third pass — final safety net for large message lists
      const timer2 = setTimeout(() => {
        scrollToBottom('auto')
      }, 350)
      return () => {
        cancelAnimationFrame(frame)
        clearTimeout(timer)
        clearTimeout(timer2)
      }
    }
  }, [messages, loadingMessages, selectedChatId, scrollToBottom, isSearchOpen])

  // 🎯 Scroll ONLY inside the messages container and flash highlight (WhatsApp Style)
  const handleJumpToMessage = (messageId) => {
    const el = document.getElementById(`msg-${messageId}`)
    const container = messagesContainerRef.current
    if (el && container) {
      // Calculate target position relative to the messages container ONLY
      const containerRect = container.getBoundingClientRect()
      const elRect = el.getBoundingClientRect()

      const targetScrollTop = container.scrollTop + (elRect.top - containerRect.top) - (container.clientHeight / 2) + (el.clientHeight / 2)

      container.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: 'smooth'
      })

      setHighlightedMsgId(messageId)

      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current)
      }

      highlightTimeoutRef.current = setTimeout(() => {
        setHighlightedMsgId(null)
      }, 2500)
    }
  }

  // 📱 WhatsApp Web Right-Click Context Menu on Chat Messages Area
  const handleChatAreaContextMenu = (e, message = null) => {
    if (!selectedChat) return
    e.preventDefault()
    e.stopPropagation()

    const menuWidth = 240
    const menuHeight = 300  // chat area menu: 7 items
    const spaceBelow = window.innerHeight - e.clientY
    const openUpward = spaceBelow < menuHeight + 16

    const x = Math.min(Math.max(8, e.clientX), window.innerWidth - menuWidth - 12)
    const y = openUpward
      ? Math.max(8, e.clientY - menuHeight)
      : Math.min(e.clientY, window.innerHeight - menuHeight - 12)

    setChatHeaderMenuOpen(false)
    setOpenDropdownJid(null)
    setChatContextMenu({
      isOpen: true,
      x,
      y,
      openUpward,
      targetMessage: message,
    })
  }

  // 🖱️ Right-Click on Chat List Item → show context menu (smart up/down)
  const handleChatListContextMenu = (e, chat) => {
    e.preventDefault()
    e.stopPropagation()
    const menuWidth = 220
    const menuHeight = 200   // 4 items
    const spaceBelow = window.innerHeight - e.clientY
    const openUpward = spaceBelow < menuHeight + 16

    const x = Math.min(Math.max(8, e.clientX), window.innerWidth - menuWidth - 12)
    const y = openUpward
      ? Math.max(8, e.clientY - menuHeight)
      : Math.min(e.clientY, window.innerHeight - menuHeight - 12)

    setOpenDropdownJid(null)
    setChatHeaderMenuOpen(false)
    setMsgContextMenu(prev => ({ ...prev, isOpen: false }))
    setChatListContextMenu({ isOpen: true, x, y, openUpward, chat })
  }

  // 🖱️ Right-Click on Message Bubble → show context menu (smart up/down)
  const handleMsgContextMenu = (e, message) => {
    e.preventDefault()
    e.stopPropagation()
    const menuWidth = 200
    const menuHeight = 150   // 3 items
    const spaceBelow = window.innerHeight - e.clientY
    const openUpward = spaceBelow < menuHeight + 16

    const x = Math.min(Math.max(8, e.clientX), window.innerWidth - menuWidth - 12)
    const y = openUpward
      ? Math.max(8, e.clientY - menuHeight)
      : Math.min(e.clientY, window.innerHeight - menuHeight - 12)

    setChatHeaderMenuOpen(false)
    setOpenDropdownJid(null)
    setChatListContextMenu(prev => ({ ...prev, isOpen: false }))
    setMsgContextMenu({ isOpen: true, x, y, openUpward, message })
  }


  // ✅ Toggle Single Message Selection
  const toggleSelectMessage = (messageId) => {
    setSelectedMessageIds(prev =>
      prev.includes(messageId)
        ? prev.filter(id => id !== messageId)
        : [...prev, messageId]
    )
  }

  // ✅ Toggle Select All Messages
  const toggleSelectAllMessages = () => {
    if (selectedMessageIds.length === messages.length) {
      setSelectedMessageIds([])
    } else {
      setSelectedMessageIds(messages.map(m => m.id))
    }
  }

  // ✕ Exit Selection Mode
  const handleCancelSelectionMode = () => {
    setIsSelectionMode(false)
    setSelectedMessageIds([])
  }

  // ✕ Close Active Chat (WhatsApp Style)
  const handleCloseChat = () => {
    setChatHeaderMenuOpen(false)
    setChatContextMenu({ isOpen: false, x: 0, y: 0, targetMessage: null })
    setSelectedChatId('')
    setIsSearchOpen(false)
    setMessageSearchQuery('')
    setIsSelectionMode(false)
    setSelectedMessageIds([])
    setShowMobileMessages(false)
    setToast?.({ type: 'info', message: 'Chat closed' })
  }

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
        setIsSelectionMode(false)
        setSelectedMessageIds([])
        setIsSearchOpen(false)
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

  const promptDeleteSelectedMessages = () => {
    if (selectedMessageIds.length === 0) return
    const isSingle = selectedMessageIds.length === 1
    setConfirmModal({
      isOpen: true,
      title: isSingle ? 'Delete 1 Selected Message?' : `Delete ${selectedMessageIds.length} Selected Messages?`,
      message: `The selected ${selectedMessageIds.length} message(s) will be permanently deleted.`,
      confirmText: 'Delete Messages',
      isLoading: false,
      onConfirm: () => executeDeleteMessages(selectedMessageIds),
    })
  }

  const promptClearChat = (chat) => {
    if (!messages || messages.length === 0) {
      setToast?.({ type: 'info', message: 'No messages to clear in this chat' })
      return
    }
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
      setSelectedMessageIds([])
      setIsSelectionMode(false)
      closeConfirmModal()
    } catch (err) {
      setToast?.({ type: 'error', message: err.message || 'Failed to delete message(s)' })
      setConfirmModal(prev => ({ ...prev, isLoading: false }))
    } finally {
      setDeletingMessageIds(prev => prev.filter(id => !messageIds.includes(id)))
    }
  }

  const togglePinChat = (chat) => {
    if (!chat?.jid) return
    const isPinned = pinnedJids.includes(chat.jid)
    if (isPinned) {
      setPinnedJids(prev => prev.filter(id => id !== chat.jid))
      setToast?.({ type: 'success', message: `"${chat.name}" unpinned` })
    } else {
      setPinnedJids(prev => [chat.jid, ...prev.filter(id => id !== chat.jid)])
      setToast?.({ type: 'success', message: `"${chat.name}" pinned to top 📌` })
    }
    setOpenDropdownJid(null)
  }

  const handleToggleMonitorSingle = async (chat) => {
    setOpenDropdownJid(null)
    if (!chat?.jid) return
    const jid = chat.jid
    setMonitoringIds(prev => Array.from(new Set([...prev, jid])))

    if (chat.isMonitored) {
      setChats(prev => prev.map(c => c.jid === jid ? { ...c, isMonitored: false } : c))
      try {
        await scrapedChatsApi.unmonitorChats([jid])
        setToast?.({ type: 'success', message: `"${chat.name}" unmonitored` })
        await loadChats()
      } catch (err) {
        await loadChats()
        setToast?.({ type: 'error', message: err.message || 'Failed to unmonitor chat' })
      } finally {
        setMonitoringIds(prev => prev.filter(id => id !== jid))
      }
    } else {
      setChats(prev => prev.map(c => c.jid === jid ? { ...c, isMonitored: true } : c))
      try {
        await scrapedChatsApi.monitorChats([jid])
        setToast?.({ type: 'success', message: `"${chat.name}" added to monitored chats` })
        await loadChats()
      } catch (err) {
        await loadChats()
        setToast?.({ type: 'error', message: err.message || 'Failed to monitor chat' })
      } finally {
        setMonitoringIds(prev => prev.filter(id => id !== jid))
      }
    }
  }

  const handleClearChatFromDropdown = async (chat) => {
    setOpenDropdownJid(null)
    if (!chat?.jid) return

    if (chat.jid === selectedChatId && messages.length > 0) {
      promptClearChat(chat)
      return
    }

    try {
      const payload = await scrapedChatsApi.getMessages(chat.jid)
      const list = extractList(payload)
      if (list.length === 0) {
        setToast?.({ type: 'info', message: 'No messages to clear in this chat' })
        return
      }
      const ids = list.map(m => (typeof m.id === 'object' ? m.id?._serialized || m.id?.id : m.id) || m._id).filter(Boolean)
      setConfirmModal({
        isOpen: true,
        title: `Clear All Messages for "${chat.name}"?`,
        message: `All ${ids.length} scraped message(s) in this chat will be permanently deleted.`,
        confirmText: 'Clear All Messages',
        isLoading: false,
        onConfirm: async () => {
          setConfirmModal(prev => ({ ...prev, isLoading: true }))
          try {
            await scrapedChatsApi.deleteMessages(ids)
            setToast?.({ type: 'success', message: `Messages cleared for "${chat.name}"` })
            if (chat.jid === selectedChatId) {
              setMessages([])
            }
            closeConfirmModal()
          } catch (e) {
            setToast?.({ type: 'error', message: e.message || 'Failed to clear messages' })
            setConfirmModal(prev => ({ ...prev, isLoading: false }))
          }
        }
      })
    } catch (err) {
      setToast?.({ type: 'error', message: err.message || 'Failed to fetch messages to clear' })
    }
  }

  const handleDeleteChatFromDropdown = (chat) => {
    setOpenDropdownJid(null)
    promptDeleteChats([chat.jid], chat.name)
  }

  const handleOpenDropdown = (event, chat) => {
    event.stopPropagation()
    if (openDropdownJid === chat.jid) {
      setOpenDropdownJid(null)
      return
    }

    const buttonRect = event.currentTarget.getBoundingClientRect()
    const containerRect = chatListContainerRef.current?.getBoundingClientRect()

    const spaceBelow = containerRect
      ? containerRect.bottom - buttonRect.bottom
      : window.innerHeight - buttonRect.bottom

    if (spaceBelow < 230) {
      setDropdownPlacement('up')
    } else {
      setDropdownPlacement('down')
    }

    setOpenDropdownJid(chat.jid)
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
        {/* Left Side: Chats List */}
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
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
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

          <div ref={chatListContainerRef} className="flex-1 overflow-y-auto">
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
                  const isPinned = pinnedJids.includes(chat.jid)
                  const isDropdownOpen = openDropdownJid === chat.jid

                  return (
                    <div
                      key={chat.jid}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelectChat(chat.jid)}
                      onContextMenu={(e) => handleChatListContextMenu(e, chat)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          handleSelectChat(chat.jid)
                        }
                      }}
                      className={`w-full text-left p-3.5 transition-all relative group cursor-pointer ${isSelected
                          ? 'bg-emerald-50/80 dark:bg-emerald-950/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-700/40'
                        } ${isDropdownOpen ? 'z-30' : 'z-0'}`}
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
                          {/* Top row: Name + Time */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex items-center gap-1.5 flex-1">
                              <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{chat.name}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {isPinned && (
                                <span title="Pinned chat" className="text-slate-400 dark:text-slate-400">
                                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" fill="currentColor">
                                    <path d="M16 3H8C7.45 3 7 3.45 7 4V5.5C7 6.05 7.45 6.5 8 6.5H9V11.5L7.29 13.21C7.11 13.39 7 13.65 7 13.91V15.5C7 16.05 7.45 16.5 8 16.5H11V21C11 21.55 11.45 22 12 22C12.55 22 13 21.55 13 21V16.5H16C16.55 16.5 17 16.05 17 15.5V13.91C17 13.65 16.89 13.39 16.71 13.21L15 11.5V6.5H16C16.55 6.5 17 6.05 17 5.5V4C17 3.45 16.55 3 16 3Z" />
                                  </svg>
                                </span>
                              )}
                              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                                {formatDateTime(chat.createdAt)}
                              </p>
                            </div>
                          </div>

                          {/* Bottom row: Status / JID + Dropdown Trigger Button */}
                          <div className="mt-1.5 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${chat.isMonitored
                                  ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50'
                                  : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                                }`}>
                                {chat.isMonitored ? '● Monitored' : 'New'}
                              </span>
                              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono truncate">{chat.jid}</p>
                            </div>

                            {/* WhatsApp Web Context Dropdown Button */}
                            <div className="relative shrink-0">
                              <button
                                type="button"
                                title="Chat options"
                                onClick={(event) => handleOpenDropdown(event, chat)}
                                className={`p-1.5 rounded-full transition-all cursor-pointer ${
                                  isDropdownOpen
                                    ? 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 opacity-100'
                                    : 'text-slate-400 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/80 opacity-70 group-hover:opacity-100'
                                }`}
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>

                              {/* WhatsApp Web Style Dropdown Menu (Smart Up/Down Positioning) */}
                              {isDropdownOpen && (
                                <div
                                  ref={dropdownRef}
                                  onClick={(event) => event.stopPropagation()}
                                  className={`absolute right-0 z-50 min-w-[200px] bg-white dark:bg-[#233138] border border-slate-200 dark:border-slate-700/80 rounded-2xl shadow-2xl py-1.5 animate-fadeIn backdrop-blur-md ${
                                    dropdownPlacement === 'up'
                                      ? 'bottom-8 origin-bottom-right'
                                      : 'top-8 origin-top-right'
                                  }`}
                                >
                                  {/* 1. Pin Chat / Unpin Chat */}
                                  <button
                                    type="button"
                                    onClick={() => togglePinChat(chat)}
                                    className="w-full px-3.5 py-2.5 flex items-center gap-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors cursor-pointer text-left"
                                  >
                                    {isPinned ? (
                                      <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 fill-current text-slate-400 dark:text-slate-300" fill="currentColor">
                                        <path d="M2.71 3.29a1 1 0 0 0 0 1.41l2.43 2.43C5.05 7.37 5 7.68 5 8v1.5a1 1 0 0 0 1 1h.5v2.24l-1.71 1.71A1 1 0 0 0 4.5 15.15V16.5a1 1 0 0 0 1 1H11V21a1 1 0 0 0 2 0v-3.5h3.15l3.14 3.14a1 1 0 0 0 1.41-1.41L4.12 3.29a1 1 0 0 0-1.41 0ZM14 11.5V6.5h1.5a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H8.5a1 1 0 0 0-.6.2l6.1 6.1Z" />
                                      </svg>
                                    ) : (
                                      <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 fill-current text-slate-400 dark:text-slate-300" fill="currentColor">
                                        <path d="M16 3H8C7.45 3 7 3.45 7 4V5.5C7 6.05 7.45 6.5 8 6.5H9V11.5L7.29 13.21C7.11 13.39 7 13.65 7 13.91V15.5C7 16.05 7.45 16.5 8 16.5H11V21C11 21.55 11.45 22 12 22C12.55 22 13 21.55 13 21V16.5H16C16.55 16.5 17 16.05 17 15.5V13.91C17 13.65 16.89 13.39 16.71 13.21L15 11.5V6.5H16C16.55 6.5 17 6.05 17 5.5V4C17 3.45 16.55 3 16 3Z" />
                                      </svg>
                                    )}
                                    <span>{isPinned ? 'Unpin chat' : 'Pin chat'}</span>
                                  </button>

                                  {/* 2. Monitor / Unmonitor */}
                                  <button
                                    type="button"
                                    onClick={() => handleToggleMonitorSingle(chat)}
                                    className="w-full px-3.5 py-2.5 flex items-center gap-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors cursor-pointer text-left"
                                  >
                                    <svg className={`w-4 h-4 shrink-0 ${chat.isMonitored ? 'text-amber-500' : 'text-emerald-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span>{chat.isMonitored ? 'Unmonitor' : 'Monitor'}</span>
                                  </button>

                                  {/* 3. Clear Chat */}
                                  <button
                                    type="button"
                                    onClick={() => handleClearChatFromDropdown(chat)}
                                    className="w-full px-3.5 py-2.5 flex items-center gap-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors cursor-pointer text-left"
                                  >
                                    <svg className="w-4 h-4 shrink-0 text-slate-400 dark:text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    <span>Clear chat</span>
                                  </button>

                                  <div className="my-1 border-t border-slate-100 dark:border-slate-700/70" />

                                  {/* 4. Delete Chat */}
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteChatFromDropdown(chat)}
                                    className="w-full px-3.5 py-2.5 flex items-center gap-3 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer text-left"
                                  >
                                    <svg className="w-4 h-4 shrink-0 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    <span>Delete chat</span>
                                  </button>
                                </div>
                              )}
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

        {/* Right Side: Active Chat Messages with WhatsApp Web Header 3-Dots, Selection Mode & Search Drawer */}
        <section className={`bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex-col h-[600px] relative ${showMobileMessages ? 'flex' : 'hidden xl:flex'
          }`}>
          {/* Active Chat Header */}
          <div className="p-3.5 sm:p-4 border-b border-slate-100 dark:border-slate-700 flex flex-row items-center justify-between gap-3 bg-white dark:bg-slate-800 z-10">
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
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                {/* 🔍 Quick Search Button */}
                <button
                  type="button"
                  title="Search messages in chat"
                  onClick={() => {
                    setIsSearchOpen(prev => !prev)
                    setChatHeaderMenuOpen(false)
                  }}
                  className={`p-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    isSearchOpen
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </button>

                {/* 🔄 Reload Messages Button */}
                <button
                  type="button"
                  title="Reload Messages"
                  onClick={() => loadMessages(selectedChat.jid)}
                  disabled={loadingMessages}
                  className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 text-slate-700 dark:text-slate-300 hover:border-emerald-300 dark:hover:border-emerald-700 disabled:opacity-60 transition-colors cursor-pointer"
                >
                  <svg className={`w-4 h-4 ${loadingMessages ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>

                {/* 📱 3-DOTS HEADER MENU (Exact WhatsApp Web Style) */}
                <div className="relative" ref={chatHeaderMenuRef}>
                  <button
                    type="button"
                    title="Menu"
                    onClick={() => setChatHeaderMenuOpen(prev => !prev)}
                    className={`p-2 rounded-xl border transition-all cursor-pointer ${
                      chatHeaderMenuOpen
                        ? 'bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    {/* WhatsApp 3 Vertical Dots Icon */}
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current text-slate-600 dark:text-slate-300" fill="currentColor">
                      <path d="M12 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
                    </svg>
                  </button>

                  {/* 3-DOTS DROPDOWN MENU */}
                  {chatHeaderMenuOpen && (
                    <div className="absolute right-0 top-11 z-50 min-w-[220px] bg-white dark:bg-[#233138] border border-slate-200 dark:border-slate-700/90 rounded-2xl shadow-2xl py-2 animate-scaleUp origin-top-right backdrop-blur-md">
                      {/* 1. Search with icon */}
                      <button
                        type="button"
                        onClick={() => {
                          setChatHeaderMenuOpen(false)
                          setIsSearchOpen(true)
                        }}
                        className="w-full px-4 py-2.5 flex items-center gap-3.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors cursor-pointer text-left"
                      >
                        <svg className="w-4 h-4 shrink-0 text-slate-400 dark:text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <span>Search</span>
                      </button>

                      {/* 2. Select messages with icon */}
                      <button
                        type="button"
                        onClick={() => {
                          setChatHeaderMenuOpen(false)
                          setIsSelectionMode(true)
                          setSelectedMessageIds([])
                        }}
                        className="w-full px-4 py-2.5 flex items-center gap-3.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors cursor-pointer text-left"
                      >
                        <svg className="w-4 h-4 shrink-0 text-slate-400 dark:text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>Select messages</span>
                      </button>

                      <div className="my-1 border-t border-slate-100 dark:border-slate-700/70" />

                      {/* 3. Pin / Unpin chat */}
                      <button
                        type="button"
                        onClick={() => { setChatHeaderMenuOpen(false); togglePinChat(selectedChat) }}
                        className="w-full px-4 py-2.5 flex items-center gap-3.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors cursor-pointer text-left"
                      >
                        <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 fill-current text-slate-400 dark:text-slate-300" fill="currentColor">
                          <path d="M16 3H8C7.45 3 7 3.45 7 4V5.5C7 6.05 7.45 6.5 8 6.5H9V11.5L7.29 13.21C7.11 13.39 7 13.65 7 13.91V15.5C7 16.05 7.45 16.5 8 16.5H11V21C11 21.55 11.45 22 12 22C12.55 22 13 21.55 13 21V16.5H16C16.55 16.5 17 16.05 17 15.5V13.91C17 13.65 16.89 13.39 16.71 13.21L15 11.5V6.5H16C16.55 6.5 17 6.05 17 5.5V4C17 3.45 16.55 3 16 3Z" />
                        </svg>
                        <span>{pinnedJids.includes(selectedChat?.jid) ? 'Unpin chat' : 'Pin chat'}</span>
                      </button>

                      {/* 4. Monitor / Unmonitor */}
                      <button
                        type="button"
                        onClick={() => { setChatHeaderMenuOpen(false); handleToggleMonitorSingle(selectedChat) }}
                        className="w-full px-4 py-2.5 flex items-center gap-3.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors cursor-pointer text-left"
                      >
                        <svg className={`w-4 h-4 shrink-0 ${selectedChat?.isMonitored ? 'text-amber-500' : 'text-emerald-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{selectedChat?.isMonitored ? 'Unmonitor chat' : 'Monitor chat'}</span>
                      </button>

                      <div className="my-1 border-t border-slate-100 dark:border-slate-700/70" />

                      {/* 5. Close chat with icon */}
                      <button
                        type="button"
                        onClick={handleCloseChat}
                        className="w-full px-4 py-2.5 flex items-center gap-3.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors cursor-pointer text-left"
                      >
                        <svg className="w-4 h-4 shrink-0 text-slate-400 dark:text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        <span>Close chat</span>
                      </button>

                      {/* 6. Clear chat with icon */}
                      <button
                        type="button"
                        onClick={() => {
                          setChatHeaderMenuOpen(false)
                          promptClearChat(selectedChat)
                        }}
                        className="w-full px-4 py-2.5 flex items-center gap-3.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors cursor-pointer text-left"
                      >
                        <svg className="w-4 h-4 shrink-0 text-slate-400 dark:text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        <span>Clear chat</span>
                      </button>

                      <div className="my-1 border-t border-slate-100 dark:border-slate-700/70" />

                      {/* 7. Delete chat with icon */}
                      <button
                        type="button"
                        onClick={() => {
                          setChatHeaderMenuOpen(false)
                          promptDeleteChats([selectedChat.jid], selectedChat.name)
                        }}
                        className="w-full px-4 py-2.5 flex items-center gap-3.5 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer text-left"
                      >
                        <svg className="w-4 h-4 shrink-0 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        <span>Delete chat</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Messages & Search Drawer Container */}
          <div className="flex flex-1 min-h-0 overflow-hidden relative">
            {/* Conversation Messages Area */}
            <div className="flex-1 flex flex-col min-w-0 h-full relative">
              <div
                ref={messagesContainerRef}
                onContextMenu={(e) => handleChatAreaContextMenu(e, null)}
                className="flex-1 bg-slate-50 dark:bg-slate-900/45 p-4 overflow-y-auto"
              >
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
                    {messages.map(message => {
                      const isMsgSelected = selectedMsgIdSet.has(message.id)
                      const isHighlighted = highlightedMsgId === message.id

                      return (
                        <div
                          key={message.id}
                          id={`msg-${message.id}`}
                          onClick={() => {
                            if (isSelectionMode) {
                              toggleSelectMessage(message.id)
                            }
                          }}
                          className={`flex items-start gap-3 transition-all rounded-2xl p-1.5 ${
                            message.fromMe ? 'justify-end' : 'justify-start'
                          } ${
                            isSelectionMode ? 'cursor-pointer hover:bg-slate-200/50 dark:hover:bg-slate-800/60' : ''
                          } ${
                            isMsgSelected ? 'bg-emerald-50/70 dark:bg-emerald-950/30 ring-2 ring-emerald-500/50' : ''
                          } ${
                            isHighlighted ? 'whatsapp-highlight' : ''
                          } group`}
                        >
                          {/* 🔘 Selection Checkbox in Select Mode (WhatsApp Web style) */}
                          {isSelectionMode && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleSelectMessage(message.id)
                              }}
                              className={`mt-2 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all cursor-pointer ${
                                isMsgSelected
                                  ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                                  : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 hover:border-emerald-500'
                              }`}
                              aria-label={`Select message ${message.id}`}
                            >
                              {isMsgSelected && (
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </button>
                          )}

                          <div
                            onContextMenu={(e) => handleMsgContextMenu(e, message)}
                            className={`relative max-w-[86%] rounded-2xl border p-3 shadow-sm transition-all ${
                            message.fromMe
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100'
                          } ${isHighlighted ? 'ring-2 ring-emerald-400 dark:ring-emerald-400' : ''}`}>
                            <div className="flex items-center justify-between gap-4 mb-1.5">
                              <p className={`text-[10px] font-bold truncate ${message.fromMe ? 'text-emerald-50' : 'text-slate-500 dark:text-slate-400'}`}>
                                {message.fromMe ? 'You' : message.senderName}
                              </p>
                              <div className="flex items-center gap-1.5">
                                <p className={`text-[10px] shrink-0 ${message.fromMe ? 'text-emerald-100' : 'text-slate-400 dark:text-slate-500'}`}>
                                  {formatDateTime(message.createdAt)}
                                </p>
                                {!isSelectionMode && (
                                  <button
                                    type="button"
                                    title="Delete message"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      promptDeleteMessage(message)
                                    }}
                                    className={`opacity-0 group-hover:opacity-100 p-0.5 rounded transition-opacity cursor-pointer ${
                                      message.fromMe ? 'text-emerald-200 hover:text-white' : 'text-slate-400 hover:text-rose-500'
                                    }`}
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  </button>
                                )}
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
                      )
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* 📱 WHATSAPP WEB SELECTION ACTION BAR (Bottom Bar) */}
              {isSelectionMode && selectedChat && (
                <div className="p-3 bg-white dark:bg-[#202c33] border-t border-slate-200 dark:border-slate-700/80 shadow-lg flex items-center justify-between gap-3 animate-fadeIn z-20">
                  {/* Left: Cancel X + Selection Count */}
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      title="Cancel selection"
                      onClick={handleCancelSelectionMode}
                      className="p-2 rounded-full text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700/80 transition-colors cursor-pointer"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                    <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                      {selectedMessageIds.length} selected
                    </span>
                  </div>

                  {/* Right: Actions (Select all / Delete selected) */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={toggleSelectAllMessages}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                    >
                      {selectedMessageIds.length === messages.length ? 'Deselect All' : 'Select All'}
                    </button>

                    <button
                      type="button"
                      title="Delete selected messages"
                      onClick={promptDeleteSelectedMessages}
                      disabled={selectedMessageIds.length === 0}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shadow-sm hover:shadow-rose-600/20"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      <span>Delete ({selectedMessageIds.length})</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 🔍 WHATSAPP WEB SEARCH MESSAGES SIDE DRAWER */}
            {isSearchOpen && selectedChat && (
              <div className="w-full sm:w-80 md:w-96 border-l border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111b21] flex flex-col h-full shrink-0 animate-fadeIn z-30 shadow-xl">
                {/* Search Drawer Header */}
                <div className="p-4 border-b border-slate-100 dark:border-slate-700/80 flex items-center justify-between gap-3 bg-white dark:bg-[#111b21]">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      title="Close search"
                      onClick={() => {
                        setIsSearchOpen(false)
                        setMessageSearchQuery('')
                      }}
                      className="p-1.5 rounded-full text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors cursor-pointer"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                    <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">Search messages</h3>
                  </div>
                </div>

                {/* Search Input Bar */}
                <div className="p-3 border-b border-slate-100 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-900/50">
                  <div className="relative w-full">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </span>
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={messageSearchQuery}
                      onChange={(e) => setMessageSearchQuery(e.target.value)}
                      placeholder="Search in chat..."
                      className="w-full pl-9 pr-8 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition-all"
                    />
                    {messageSearchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setMessageSearchQuery('')
                          searchInputRef.current?.focus()
                        }}
                        className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                {/* Search Results List */}
                <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  {!messageSearchQuery.trim() ? (
                    <div className="text-center py-16 px-4">
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800/80 mx-auto mb-3 flex items-center justify-center text-slate-400 dark:text-slate-500">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Search messages</p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Search for messages within this chat</p>
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div className="text-center py-16 px-4 animate-fadeIn">
                      <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/40 mx-auto mb-3 flex items-center justify-center text-rose-500">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-300">No message found</p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 truncate max-w-[200px] mx-auto">
                        No messages match &ldquo;{messageSearchQuery}&rdquo;
                      </p>
                    </div>
                  ) : (
                    <div>
                      <div className="px-4 py-2 bg-slate-50/80 dark:bg-slate-900/30 text-[11px] font-bold text-slate-400 dark:text-slate-500">
                        {searchResults.length} message{searchResults.length > 1 ? 's' : ''} found
                      </div>
                      {searchResults.map((msg) => (
                        <div
                          key={msg.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleJumpToMessage(msg.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              handleJumpToMessage(msg.id)
                            }
                          }}
                          className="p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors cursor-pointer text-left group"
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                              {msg.fromMe ? 'You' : msg.senderName}
                            </span>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                              {formatTimeOnly(msg.createdAt) || formatDateTime(msg.createdAt)}
                            </span>
                          </div>
                          <p className="text-xs text-slate-700 dark:text-slate-200 line-clamp-2 leading-relaxed">
                            <HighlightMatchedText text={msg.body} query={messageSearchQuery} />
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
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

      {/* 🖱️ RIGHT-CLICK CONTEXT MENU: Chat Room Background (same as 3-dot header menu) */}
      {chatContextMenu.isOpen && selectedChat && (
        <div
          ref={chatContextMenuRef}
          style={{ position: 'fixed', top: chatContextMenu.y, left: chatContextMenu.x, zIndex: 9999 }}
          className={`min-w-[230px] bg-white dark:bg-[#233138] border border-slate-200 dark:border-slate-700/80 rounded-2xl shadow-2xl py-1.5 animate-scaleUp backdrop-blur-md ${
            chatContextMenu.openUpward ? 'origin-bottom-left' : 'origin-top-left'
          }`}
        >
          {/* 1. Search */}
          <button
            type="button"
            onClick={() => { setChatContextMenu(p => ({ ...p, isOpen: false })); setIsSearchOpen(true) }}
            className="w-full px-4 py-2.5 flex items-center gap-3.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors cursor-pointer text-left"
          >
            <svg className="w-4 h-4 shrink-0 text-slate-400 dark:text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span>Search</span>
          </button>

          {/* 2. Select messages */}
          <button
            type="button"
            onClick={() => { setChatContextMenu(p => ({ ...p, isOpen: false })); setIsSelectionMode(true); setSelectedMessageIds([]) }}
            className="w-full px-4 py-2.5 flex items-center gap-3.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors cursor-pointer text-left"
          >
            <svg className="w-4 h-4 shrink-0 text-slate-400 dark:text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Select messages</span>
          </button>

          <div className="my-1 border-t border-slate-100 dark:border-slate-700/70" />

          {/* 3. Pin / Unpin */}
          <button
            type="button"
            onClick={() => { setChatContextMenu(p => ({ ...p, isOpen: false })); togglePinChat(selectedChat) }}
            className="w-full px-4 py-2.5 flex items-center gap-3.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors cursor-pointer text-left"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 fill-current text-slate-400 dark:text-slate-300" fill="currentColor">
              <path d="M16 3H8C7.45 3 7 3.45 7 4V5.5C7 6.05 7.45 6.5 8 6.5H9V11.5L7.29 13.21C7.11 13.39 7 13.65 7 13.91V15.5C7 16.05 7.45 16.5 8 16.5H11V21C11 21.55 11.45 22 12 22C12.55 22 13 21.55 13 21V16.5H16C16.55 16.5 17 16.05 17 15.5V13.91C17 13.65 16.89 13.39 16.71 13.21L15 11.5V6.5H16C16.55 6.5 17 6.05 17 5.5V4C17 3.45 16.55 3 16 3Z" />
            </svg>
            <span>{pinnedJids.includes(selectedChat.jid) ? 'Unpin chat' : 'Pin chat'}</span>
          </button>

          {/* 4. Monitor / Unmonitor */}
          <button
            type="button"
            onClick={() => { setChatContextMenu(p => ({ ...p, isOpen: false })); handleToggleMonitorSingle(selectedChat) }}
            className="w-full px-4 py-2.5 flex items-center gap-3.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors cursor-pointer text-left"
          >
            <svg className={`w-4 h-4 shrink-0 ${selectedChat.isMonitored ? 'text-amber-500' : 'text-emerald-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{selectedChat.isMonitored ? 'Unmonitor chat' : 'Monitor chat'}</span>
          </button>

          <div className="my-1 border-t border-slate-100 dark:border-slate-700/70" />

          {/* 5. Close chat */}
          <button
            type="button"
            onClick={() => { setChatContextMenu(p => ({ ...p, isOpen: false })); handleCloseChat() }}
            className="w-full px-4 py-2.5 flex items-center gap-3.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors cursor-pointer text-left"
          >
            <svg className="w-4 h-4 shrink-0 text-slate-400 dark:text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span>Close chat</span>
          </button>

          {/* 6. Clear chat */}
          <button
            type="button"
            onClick={() => { setChatContextMenu(p => ({ ...p, isOpen: false })); promptClearChat(selectedChat) }}
            className="w-full px-4 py-2.5 flex items-center gap-3.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors cursor-pointer text-left"
          >
            <svg className="w-4 h-4 shrink-0 text-slate-400 dark:text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span>Clear chat</span>
          </button>

          <div className="my-1 border-t border-slate-100 dark:border-slate-700/70" />

          {/* 7. Delete chat */}
          <button
            type="button"
            onClick={() => { setChatContextMenu(p => ({ ...p, isOpen: false })); promptDeleteChats([selectedChat.jid], selectedChat.name) }}
            className="w-full px-4 py-2.5 flex items-center gap-3.5 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer text-left"
          >
            <svg className="w-4 h-4 shrink-0 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span>Delete chat</span>
          </button>
        </div>
      )}

      {/* 🖱️ RIGHT-CLICK CONTEXT MENU: Chat List Item (WhatsApp Web Style) */}

      {chatListContextMenu.isOpen && chatListContextMenu.chat && (() => {
        const c = chatListContextMenu.chat
        const isPinnedCtx = pinnedJids.includes(c.jid)
        return (
          <div
            ref={chatListCtxMenuRef}
            style={{ position: 'fixed', top: chatListContextMenu.y, left: chatListContextMenu.x, zIndex: 9999 }}
            className={`min-w-[210px] bg-white dark:bg-[#233138] border border-slate-200 dark:border-slate-700/80 rounded-2xl shadow-2xl py-1.5 animate-scaleUp backdrop-blur-md ${
              chatListContextMenu.openUpward ? 'origin-bottom-left' : 'origin-top-left'
            }`}
          >
            {/* Pin / Unpin */}
            <button
              type="button"
              onClick={() => { setChatListContextMenu(p => ({ ...p, isOpen: false })); togglePinChat(c) }}
              className="w-full px-4 py-2.5 flex items-center gap-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors cursor-pointer text-left"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 fill-current text-slate-400" fill="currentColor">
                <path d="M16 3H8C7.45 3 7 3.45 7 4V5.5C7 6.05 7.45 6.5 8 6.5H9V11.5L7.29 13.21C7.11 13.39 7 13.65 7 13.91V15.5C7 16.05 7.45 16.5 8 16.5H11V21C11 21.55 11.45 22 12 22C12.55 22 13 21.55 13 21V16.5H16C16.55 16.5 17 16.05 17 15.5V13.91C17 13.65 16.89 13.39 16.71 13.21L15 11.5V6.5H16C16.55 6.5 17 6.05 17 5.5V4C17 3.45 16.55 3 16 3Z" />
              </svg>
              <span>{isPinnedCtx ? 'Unpin chat' : 'Pin chat'}</span>
            </button>

            {/* Monitor / Unmonitor */}
            <button
              type="button"
              onClick={() => { setChatListContextMenu(p => ({ ...p, isOpen: false })); handleToggleMonitorSingle(c) }}
              className="w-full px-4 py-2.5 flex items-center gap-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors cursor-pointer text-left"
            >
              <svg className={`w-4 h-4 shrink-0 ${c.isMonitored ? 'text-amber-500' : 'text-emerald-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{c.isMonitored ? 'Unmonitor' : 'Monitor'}</span>
            </button>

            {/* Clear chat */}
            <button
              type="button"
              onClick={() => { setChatListContextMenu(p => ({ ...p, isOpen: false })); handleClearChatFromDropdown(c) }}
              className="w-full px-4 py-2.5 flex items-center gap-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors cursor-pointer text-left"
            >
              <svg className="w-4 h-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <span>Clear chat</span>
            </button>

            <div className="my-1 border-t border-slate-100 dark:border-slate-700/60" />

            {/* Delete chat */}
            <button
              type="button"
              onClick={() => { setChatListContextMenu(p => ({ ...p, isOpen: false })); handleDeleteChatFromDropdown(c) }}
              className="w-full px-4 py-2.5 flex items-center gap-3 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer text-left"
            >
              <svg className="w-4 h-4 shrink-0 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <span>Delete chat</span>
            </button>
          </div>
        )
      })()}

      {/* 🖱️ RIGHT-CLICK CONTEXT MENU: Message Bubble (WhatsApp Web Style) */}
      {msgContextMenu.isOpen && msgContextMenu.message && (
        <div
          ref={msgCtxMenuRef}
          style={{ position: 'fixed', top: msgContextMenu.y, left: msgContextMenu.x, zIndex: 9999 }}
          className={`min-w-[190px] bg-white dark:bg-[#233138] border border-slate-200 dark:border-slate-700/80 rounded-2xl shadow-2xl py-1.5 animate-scaleUp backdrop-blur-md ${
            msgContextMenu.openUpward ? 'origin-bottom-left' : 'origin-top-left'
          }`}
        >
          {/* Copy text */}
          <button
            type="button"
            onClick={() => {
              if (msgContextMenu.message?.body) {
                navigator.clipboard.writeText(msgContextMenu.message.body).catch(() => {})
                setToast?.({ type: 'success', message: 'Message copied to clipboard' })
              }
              setMsgContextMenu(p => ({ ...p, isOpen: false }))
            }}
            className="w-full px-4 py-2.5 flex items-center gap-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors cursor-pointer text-left"
          >
            <svg className="w-4 h-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span>Copy text</span>
          </button>

          {/* Select message */}
          <button
            type="button"
            onClick={() => {
              setIsSelectionMode(true)
              toggleSelectMessage(msgContextMenu.message.id)
              setMsgContextMenu(p => ({ ...p, isOpen: false }))
            }}
            className="w-full px-4 py-2.5 flex items-center gap-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors cursor-pointer text-left"
          >
            <svg className="w-4 h-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Select message</span>
          </button>

          <div className="my-1 border-t border-slate-100 dark:border-slate-700/60" />

          {/* Delete message */}
          <button
            type="button"
            onClick={() => {
              promptDeleteMessage(msgContextMenu.message)
              setMsgContextMenu(p => ({ ...p, isOpen: false }))
            }}
            className="w-full px-4 py-2.5 flex items-center gap-3 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer text-left"
          >
            <svg className="w-4 h-4 shrink-0 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span>Delete message</span>
          </button>
        </div>
      )}
    </div>
  )
}

export default ScrapedChats
