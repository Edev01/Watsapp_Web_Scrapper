import { useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { DEFAULT_FILTERS, formatPriceRangeLabel } from '../../components/PropertyFilters/PropertyFilters'
import { CardSkeleton } from '../../components/Skeleton/Skeleton'
import Header from '../../components/Header/Header'
import Sidebar from '../../components/Sidebar/Sidebar'
import { mlSearchApi, normalizeApi, propertyApi, PROPERTY_STATUS_ENUM } from '../../api'

const ITEMS_PER_PAGE = 20

const USER_NAV = [
  { id: 'search', label: 'Search Properties', icon: 'home' },
  { id: 'connect', label: 'WhatsApp Connect', icon: 'qr' },
  { id: 'scrapedChats', label: 'Scraped Chats', icon: 'messages' },
  { id: 'saved', label: 'Saved Listings', icon: 'heart' },
  { id: 'resetPassword', label: 'Reset Password', icon: 'key' },
]

// 🧠 Helper to analyze and explain why normalization occurred for search results
const analyzeNormalizationReasons = (rawResults = [], filters = {}, normStatus = null) => {
  const reasons = []

  // 1. Price Normalization & Currency Conversion
  const priceNormalizedItems = rawResults.filter(r => {
    const rawP = String(r.price || r.raw_message || '').toLowerCase()
    return rawP.includes('cr') || rawP.includes('crore') || rawP.includes('lac') || rawP.includes('lakh') || rawP.includes('k') || rawP.includes('demand')
  })
  if (priceNormalizedItems.length > 0) {
    reasons.push({
      category: 'Price & Demand Normalization',
      icon: '💰',
      badge: `${priceNormalizedItems.length} listings`,
      description: 'Extracted numeric PKR values from Pakistani real estate terms (e.g., Crore, Lac, Lakh, K, Demand, PKR/Rs).',
      examples: ['"1.8 Cr" → PKR 18,000,000', '"85 Lac" → PKR 8,500,000', '"500k" → PKR 500,000'],
    })
  }

  // 2. Intent & Purpose Classification
  if (filters.purpose && filters.purpose !== 'All') {
    reasons.push({
      category: 'Intent & Transaction Classification',
      icon: '🎯',
      badge: `Intent: ${filters.purpose}`,
      description: `Classified unstructured WhatsApp chat intents into distinct purpose categories ("${filters.purpose}").`,
      examples: ['"For Sale / Available" → Buy', '"Rent pe chahiye / Available for Rent" → Rent'],
    })
  }

  // 3. Location, Vicinity & Area Extraction
  const locationItems = rawResults.filter(r => r.area || r.vicinity || r.city)
  if (locationItems.length > 0 || filters.location || filters.city) {
    reasons.push({
      category: 'Location & Vicinity Extraction',
      icon: '📍',
      badge: `${locationItems.length} locations mapped`,
      description: 'Extracted sector, phase, block, and city information from noisy WhatsApp text.',
      examples: [filters.city && filters.city !== 'All Cities' ? `Filtered by City: ${filters.city}` : 'Mapped City & Sector', filters.location ? `Matched location query: "${filters.location}"` : 'Extracted Vicinity & Block'],
    })
  }

  // 4. Property Sub-Type & Size Standardizing
  const sizeItems = rawResults.filter(r => r.size_value || r.size_unit || r.property_sub_type || r.property_type)
  if (sizeItems.length > 0 || (filters.propertyType && filters.propertyType !== 'All')) {
    reasons.push({
      category: 'Property Type & Size Standardization',
      icon: '📐',
      badge: `${sizeItems.length} standardized`,
      description: 'Normalized colloquial Pakistani unit standards (Marla, Kanal, Sq Ft, Sq Yards) and standardized property sub-types.',
      examples: ['"5 Marla House" → 5 Marla (Residential)', '"1 Kanal Plot" → 1 Kanal (Plot/Land)'],
    })
  }

  // 5. Typo-Tolerance & Roman Urdu NLP
  const hasQuery = (filters.query || filters.location || '').trim()
  reasons.push({
    category: 'Roman Urdu & Typo-Tolerance NLP',
    icon: '🤖',
    badge: hasQuery ? 'Active for Query' : 'Active Pipeline',
    description: 'Processed Pakistani real estate abbreviations, phonetic Roman Urdu spelling variations, and keyword synonyms.',
    examples: ['"dem", "dmd", "prc" → Price', '"flt", "apprt" → Flat/Apartment', '"ghr", "makan" → House'],
  })

  // 6. Backend Normalization Service Status
  if (normStatus) {
    const isOk = normStatus.status === 'ok' || normStatus.status === 'active' || normStatus.success
    reasons.push({
      category: 'Backend /api/normalize/status Service',
      icon: isOk ? '⚡' : 'ℹ️',
      badge: normStatus.status || (isOk ? 'Operational' : 'Active'),
      description: normStatus.message || (isOk ? 'AI Normalization service is healthy and actively serving requests.' : 'AI Normalization endpoint queried.'),
      examples: [`Response Status: ${normStatus.status || '200 OK'}`],
    })
  }

  return reasons
}

// 💰 Robust helper to parse and normalize property prices from Pakistani WhatsApp messages
const parsePropertyPrice = (priceStr, priceVal, rawMessage = '') => {
  // 1. Try parsing priceStr if available
  if (typeof priceStr === 'string' && priceStr.trim()) {
    const s = priceStr.toLowerCase().replace(/,/g, '').trim()

    // 1a. Check for combined Crore and Lakh e.g. "15 Crore 50 Lakh", "15 Cr 50 Lac"
    const crLakhMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:cr|crore|cror)\s*(?:and)?\s*(\d+(?:\.\d+)?)\s*(?:lac|lakh|lacs)/i)
    if (crLakhMatch) {
      return Math.round(parseFloat(crLakhMatch[1]) * 10000000 + parseFloat(crLakhMatch[2]) * 100000)
    }

    // 1b. Check for Crore e.g. "1.8 Cr", "4.50 cror", "16 crore", "15C"
    const crMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:cr|crore|cror|c\b)/i)
    if (crMatch) {
      return Math.round(parseFloat(crMatch[1]) * 10000000)
    }

    // 1c. Check for Lac / Lakh e.g. "85 Lac", "1.5 Lac", "3.50 Lac"
    const lacMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:lac|lakh|lacs|l\b)/i)
    if (lacMatch) {
      return Math.round(parseFloat(lacMatch[1]) * 100000)
    }

    // 1d. Check for thousand / K e.g. "500k", "500 thousand"
    const kMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:k|thousand|hazar)\b/i)
    if (kMatch) {
      return Math.round(parseFloat(kMatch[1]) * 1000)
    }

    // 1e. Check for explicit numbers like "45000", "325000"
    const numMatch = s.match(/(\d+(?:\.\d+)?)/)
    if (numMatch) {
      const num = parseFloat(numMatch[1])
      if (num > 0) return num
    }
  }

  // 2. Check rawMessage if priceStr is empty/missing
  if (typeof rawMessage === 'string' && rawMessage.trim()) {
    const raw = rawMessage.toLowerCase().replace(/,/g, '')

    // Check demand / price in raw message
    const demandMatch = raw.match(/(?:demand|price|de|dem|pkr|rs\.?)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(cr|crore|cror|lac|lakh|lacs|c|l|k|thousand)?/i)
    if (demandMatch) {
      const val = parseFloat(demandMatch[1])
      const unit = (demandMatch[2] || '').toLowerCase()
      if (unit.startsWith('cr') || unit === 'c') return Math.round(val * 10000000)
      if (unit.startsWith('lac') || unit.startsWith('lakh') || unit === 'l') return Math.round(val * 100000)
      if (unit.startsWith('k') || unit.startsWith('thous')) return Math.round(val * 1000)
      if (val >= 1000) return val
      if (val > 0 && val < 100) {
        return Math.round(val * 10000000)
      }
    }
  }

  // 3. Fallback to priceVal if it's a valid positive number
  if (typeof priceVal === 'number' && !isNaN(priceVal) && priceVal > 0) {
    return priceVal
  }

  return null
}

const PRICE_UNIT_PATTERN = 'crores|crore|cror|cr|lakh|lakhs|lacs|lac|thousand|hazar|k|c|l'

const convertPriceAmount = (amount, unit = '') => {
  const value = parseFloat(amount)
  if (!Number.isFinite(value) || value <= 0) return null

  const normalizedUnit = unit.toLowerCase()
  if (['crores', 'crore', 'cror', 'cr', 'c'].includes(normalizedUnit)) {
    return Math.round(value * 10000000)
  }
  if (['lakh', 'lakhs', 'lacs', 'lac', 'l'].includes(normalizedUnit)) {
    return Math.round(value * 100000)
  }
  if (['thousand', 'hazar', 'k'].includes(normalizedUnit)) {
    return Math.round(value * 1000)
  }

  if (value >= 1000) return value
  if (value < 10) return Math.round(value * 10000000)
  return Math.round(value * 100000)
}

const parsePriceSearch = (input = '') => {
  const text = input.toLowerCase().replace(/,/g, '').replace(/[–—]/g, '-').trim()
  if (!text) return null

  const rangeRegex = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${PRICE_UNIT_PATTERN})?\\s*(?:-|to|se)\\s*(\\d+(?:\\.\\d+)?)\\s*(${PRICE_UNIT_PATTERN})?`, 'i')
  const rangeMatch = text.match(rangeRegex)

  if (rangeMatch) {
    const unit = rangeMatch[2] || rangeMatch[4] || ''
    const min = convertPriceAmount(rangeMatch[1], unit)
    const max = convertPriceAmount(rangeMatch[3], rangeMatch[4] || unit)

    if (min && max) {
      return {
        type: 'range',
        min: Math.min(min, max),
        max: Math.max(min, max),
      }
    }
  }

  const amountRegex = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${PRICE_UNIT_PATTERN})?`, 'i')
  const amountMatch = text.match(amountRegex)
  if (!amountMatch) return null

  const amount = convertPriceAmount(amountMatch[1], amountMatch[2] || '')
  if (!amount) return null

  const hasMaxIntent = /(^|\b)(under|below|less than|upto|up to|max|maximum|within|budget|tak|andar|kam)(\b|$)|<=|</i.test(text)
  const hasMinIntent = /(^|\b)(above|over|more than|greater than|min|minimum|from|zyada)(\b|$)|>=|>/i.test(text)

  if (hasMaxIntent) {
    return { type: 'max', min: null, max: amount }
  }

  if (hasMinIntent) {
    return { type: 'min', min: amount, max: null }
  }

  const tolerance = Math.max(amount * 0.05, amount >= 100000 ? 100000 : 5000)
  return {
    type: 'exact',
    min: Math.max(0, amount - tolerance),
    max: amount + tolerance,
    exact: amount,
  }
}

const getPropertyPriceBounds = (property) => {
  const formatted = String(property.priceFormatted || '').toLowerCase().replace(/,/g, '').replace(/[–—]/g, '-')
  const rangeRegex = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${PRICE_UNIT_PATTERN})?\\s*(?:-|to|se)\\s*(\\d+(?:\\.\\d+)?)\\s*(${PRICE_UNIT_PATTERN})?`, 'i')
  const rangeMatch = formatted.match(rangeRegex)

  if (rangeMatch) {
    const unit = rangeMatch[2] || rangeMatch[4] || ''
    const min = convertPriceAmount(rangeMatch[1], unit)
    const max = convertPriceAmount(rangeMatch[3], rangeMatch[4] || unit)

    if (min && max) {
      return {
        min: Math.min(min, max),
        max: Math.max(min, max),
      }
    }
  }

  if (property.price !== null && property.price !== undefined && !isNaN(property.price) && property.price > 0) {
    return { min: property.price, max: property.price }
  }

  const parsed = parsePropertyPrice(property.priceFormatted, property.price, property.description)
  return parsed ? { min: parsed, max: parsed } : null
}

// 🔄 Map backend property filter response to normalized property object
const normalizeFilterProperty = (item, index) => {
  const purposeMap = { SALE: 'Buy', RENT: 'Rent', BUY: 'Buy' }
  const rawPurpose = String(item.purpose || item.transaction_type || '').toUpperCase()
  const purpose = purposeMap[rawPurpose] || item.purpose || 'Buy'

  const propertyType = String(item.property_type || item.propertyType || item.type || '')
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')

  const location = [
    item.area,
    item.vicinity,
    item.location,
    item.area_name,
    item.areaName,
  ].filter(Boolean).join(', ')

  const parsedPrice = parsePropertyPrice(
    item.price || item.price_formatted || item.priceFormatted,
    item.price_value || item.priceValue || item.price,
    item.raw_message || item.description || item.message
  )

  return {
    id: item.id || item._id || item.message_id || index,
    title: item.title || item.summary || `${item.size || item.area_size || ''} ${item.propertySubType || item.property_sub_type || propertyType}`.trim() || 'Property Listing',
    price: parsedPrice ?? item.parsedPricePKR ?? null,
    priceFormatted: item.price || item.price_formatted || item.priceFormatted || '',
    area: item.parsedAreaInTargetUnit || item.size_value || item.area_size || item.area || 0,
    areaUnit: item.targetAreaUnit || item.size_unit || item.area_unit || item.areaUnit || 'Marla',
    type: propertyType || item.propertyType || 'House',
    subType: item.propertySubType || item.property_sub_type || '',
    purpose,
    city: item.city || '',
    location: item.location || location || item.city || 'Unknown',
    areaName: item.area || item.area_name || '',
    vicinity: item.vicinity || '',
    currency: 'PKR',
    phone: item.contactNumber || item.contact_number || item.phone || '',
    scrapedFrom: 'WhatsApp Property Search',
    scrapedAt: item.createdAt || item.created_at || new Date().toISOString(),
    description: item.rawMessage || item.raw_message || item.description || item.message || '',
    summary: item.summary || '',
    sentiment: item.sentiment || '',
    intent: item.intent || '',
    category: item.category || '',
    status: item.propertyStatus || item.property_status || item.status || 'AVAILABLE',
    similarityScore: item.similarity_score,
  }
}

// 🔄 Extract listing array from ML dashboard-search response
const parseMLSearchResults = (response) => {
  if (!response) return []
  if (Array.isArray(response.results)) return response.results
  if (Array.isArray(response?.data?.results)) return response.data.results
  if (Array.isArray(response.data)) return response.data
  if (Array.isArray(response.properties)) return response.properties
  return []
}

// 🔄 Map ML API response item to normalized property object
const normalizeMLResult = (item, index) => {
  const purposeMap = { SALE: 'Buy', RENT: 'Rent', BUY: 'Buy' }
  const rawPurpose = (item.purpose || '').toUpperCase()
  const purpose = purposeMap[rawPurpose] || item.purpose || 'Buy'

  const propertyType = (item.property_type || '')
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')

  const location = [item.area, item.vicinity].filter(Boolean).join(', ')
  const parsedPrice = parsePropertyPrice(item.price, item.price_value, item.raw_message)

  return {
    id: item.message_id || index,
    title: `${item.size || ''} ${item.property_sub_type || propertyType}`.trim() || 'Property Listing',
    price: parsedPrice,
    priceFormatted: item.price || '',
    area: item.size_value || 0,
    areaUnit: item.size_unit || 'Marla',
    type: propertyType || 'House',
    subType: item.property_sub_type || '',
    purpose,
    city: item.city || '',
    location: location || item.city || 'Unknown',
    areaName: item.area || '',
    vicinity: item.vicinity || '',
    currency: 'PKR',
    phone: item.contact_number || '',
    scrapedFrom: 'WhatsApp AI Search',
    scrapedAt: item.created_at || new Date().toISOString(),
    description: item.raw_message || '',
    summary: item.summary || '',
    sentiment: item.sentiment || '',
    intent: item.intent || '',
    category: item.category || '',
    status: item.property_status || item.propertyStatus || item.status || item.listing_status || item.listingStatus || 'AVAILABLE',
    similarityScore: item.similarity_score,
  }
}

const formatPrice = (price, purpose, priceFormatted) => {
  if (priceFormatted && priceFormatted.trim()) return priceFormatted.trim()
  if (price === null || price === undefined || isNaN(price) || price <= 0) {
    return 'Price on Call'
  }
  if (purpose === 'Rent') return `PKR ${price.toLocaleString()}/mo`
  if (price >= 10000000) return `PKR ${(price / 10000000).toFixed(2).replace(/\.?0+$/, '')} Cr`
  if (price >= 100000) return `PKR ${(price / 100000).toFixed(0)} Lac`
  return `PKR ${price.toLocaleString()}`
}

const formatDate = iso => {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('en-PK', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

const SentimentBadge = ({ sentiment }) => {
  if (!sentiment) return null
  const s = sentiment.toUpperCase()
  const styles = {
    POSITIVE: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50',
    NEUTRAL: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600',
    NEGATIVE: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50',
  }
  const icons = { POSITIVE: '😊', NEUTRAL: '😐', NEGATIVE: '😟' }
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${styles[s] || styles.NEUTRAL}`}>
      <span>{icons[s] || '•'}</span>
      <span>{s.charAt(0) + s.slice(1).toLowerCase()}</span>
    </span>
  )
}

const formatListingStatus = (status) => (
  String(status || 'AVAILABLE')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
)

const listingStatusClass = (status) => {
  const normalized = String(status || 'AVAILABLE').toUpperCase()
  const styles = {
    AVAILABLE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
    SOLD: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
    RENTED: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
    RESERVED: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300',
    WITHDRAWN: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
    ON_HOLD: 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300',
  }
  return styles[normalized] || styles.AVAILABLE
}

const PropertyStatusSelect = ({ value, options, disabled, onChange }) => (
  <select
    value={value || 'AVAILABLE'}
    disabled={disabled}
    onClick={(event) => event.stopPropagation()}
    onChange={(event) => onChange(event.target.value)}
    aria-label="Update listing status"
    className={`max-w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 disabled:cursor-wait disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 ${listingStatusClass(value)}`}
  >
    {options.map((status) => (
      <option key={status} value={status}>{formatListingStatus(status)}</option>
    ))}
  </select>
)
const PropertyCard = ({ p, onSelect }) => (
  <div
    onClick={() => onSelect(p)}
    className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-lg hover:border-emerald-300 dark:hover:border-emerald-600 transition-all duration-200 overflow-hidden group flex flex-col cursor-pointer"
  >
    <div className={`h-1.5 w-full ${p.purpose === 'Buy' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
    <div className="p-4 flex flex-col flex-1">
      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${p.purpose === 'Buy' ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400' : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400'}`}>
          For {p.purpose}
        </span>
        <SentimentBadge sentiment={p.sentiment} />
        {p.category && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400">
            {p.category}
          </span>
        )}
      </div>

      <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm leading-snug mb-0.5 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors line-clamp-1">
        {p.title}
      </h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-2 truncate">
        📍 {p.location}{p.city ? `, ${p.city}` : ''}
      </p>

      {/* Price */}
      <p className="text-base font-extrabold text-emerald-600 dark:text-emerald-400 mb-2">
        {formatPrice(p.price, p.purpose, p.priceFormatted)}
      </p>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {p.type && <span className="text-[10px] font-semibold px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-md">{p.type}</span>}
        {p.area > 0 && <span className="text-[10px] font-semibold px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-md">{p.area} {p.areaUnit}</span>}
        {p.subType && <span className="text-[10px] font-semibold px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-md">{p.subType}</span>}
      </div>

      {/* AI Summary */}
      {p.summary && (
        <div className="mb-2 px-3 py-2 bg-blue-50/70 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900/40">
          <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-0.5">🤖 AI Summary</p>
          <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed line-clamp-2">{p.summary}</p>
        </div>
      )}

      {/* Description */}
      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2 mb-3">{p.description}</p>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-700 mt-auto text-xs">
        <div>
          {p.phone ? (
            <p className="text-[11px] text-slate-600 dark:text-slate-300 font-semibold">📞 {p.phone}</p>
          ) : (
            <p className="text-[11px] text-slate-400 dark:text-slate-500">No contact</p>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onSelect(p)
          }}
          className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 inline-flex items-center gap-1 cursor-pointer"
        >
          View Details →
        </button>
      </div>
    </div>
  </div>
)

// 💀 Table Skeleton Loading Component
const TableSkeleton = () => (
  <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden animate-pulse">
    <table className="w-full table-fixed text-left text-xs">
      <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700">
        <tr>
          <th className="px-4 py-3.5 w-[14%] sm:w-[12%]"><div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-14" /></th>
          <th className="px-4 py-3.5 w-[26%] sm:w-[26%]"><div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-20" /></th>
          <th className="px-4 py-3.5 w-[18%] sm:w-[18%]"><div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-16" /></th>
          <th className="px-4 py-3.5 w-[20%] sm:w-[20%]"><div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-16" /></th>
          <th className="px-4 py-3.5 w-[22%] sm:w-[24%]"><div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-24" /></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-slate-700/70">
        {[...Array(6)].map((_, i) => (
          <tr key={i}>
            <td className="px-4 py-3.5"><div className="h-6 w-16 bg-slate-200 dark:bg-slate-700 rounded-full" /></td>
            <td className="px-4 py-3.5"><div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-24" /></td>
            <td className="px-4 py-3.5"><div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-20" /></td>
            <td className="px-4 py-3.5"><div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-20" /></td>
            <td className="px-4 py-3.5"><div className="h-6 bg-slate-200 dark:bg-slate-700 rounded-lg w-28" /></td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)

// 📊 Table Component for Row View (table-fixed 100% width, No horizontal scroll!)
const PropertyTable = ({ properties, onSelect, statusOptions, updatingStatusId, onStatusChange }) => (
  <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
    <table className="w-full table-fixed text-left text-xs text-slate-600 dark:text-slate-300">
      <thead className="bg-slate-50 dark:bg-slate-900/60 text-[11px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider border-b border-slate-200 dark:border-slate-700">
        <tr>
          <th scope="col" className="w-[5%] px-3 py-3.5 text-center">#</th>
          <th scope="col" className="w-[11%] px-3 py-3.5">Status</th>
          <th scope="col" className="w-[15%] px-3 py-3.5">Property</th>
          <th scope="col" className="w-[28%] px-3 py-3.5">Location</th>
          <th scope="col" className="w-[19%] px-3 py-3.5">Price</th>
          <th scope="col" className="w-[18%] px-3 py-3.5">Contact Number</th>
          <th scope="col" className="w-[4%] px-2 py-3.5"><span className="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-slate-700/70">
        {properties.map((p, index) => (
          <tr
            key={p.id}
            onClick={() => onSelect(p)}
            className="hover:bg-emerald-50/70 dark:hover:bg-emerald-950/30 transition-colors cursor-pointer group"
          >
            <td className="px-3 py-3.5 text-center font-semibold text-slate-500 dark:text-slate-400">{index + 1}</td>
            <td className="px-3 py-3.5 whitespace-nowrap">
              <PropertyStatusSelect
                value={p.status || 'AVAILABLE'}
                options={statusOptions}
                disabled={updatingStatusId === p.id}
                onChange={(nextStatus) => onStatusChange(p.id, nextStatus)}
              />
            </td>

            <td className="px-3 py-3.5 overflow-hidden">
              <div className="space-y-1">
                <span
                  title={p.type || 'Property'}
                  className="font-bold text-slate-900 dark:text-slate-100 text-xs sm:text-sm group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors block truncate"
                >
                  {p.type || 'Property'}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block ${p.purpose === 'Buy' ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'}`}>
                  For {p.purpose}
                </span>
              </div>
            </td>

            {/* Location: Location and City */}
            <td className="px-3 py-3.5 overflow-hidden whitespace-nowrap">
              <div className="flex items-center gap-1 text-slate-800 dark:text-slate-200 font-semibold text-xs truncate">
                <span className="text-emerald-500 shrink-0">📍</span>
                <span className="truncate" title={p.location || p.city || 'Unknown'}>
                  {p.city && p.location && !p.location.toLowerCase().includes(p.city.toLowerCase())
                    ? `${p.location}, ${p.city}`
                    : p.location || p.city || 'Unknown'}
                </span>
              </div>
            </td>

            {/* Price */}
            <td className="px-3 py-3.5 whitespace-nowrap overflow-hidden">
              <span className="font-extrabold text-emerald-600 dark:text-emerald-400 text-xs sm:text-sm block truncate">
                {formatPrice(p.price, p.purpose, p.priceFormatted)}
              </span>
            </td>

            {/* Contact */}
            <td className="px-3 py-3.5 whitespace-nowrap overflow-hidden">
              {p.phone ? (
                <span className="font-mono text-slate-800 dark:text-slate-200 text-[11px] sm:text-xs font-bold bg-slate-100 dark:bg-slate-700/60 px-2 sm:px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-600 inline-flex items-center gap-1 max-w-full truncate">
                  <span className="shrink-0">📞</span>
                  <span className="truncate">{p.phone}</span>
                </span>
              ) : (
                <span className="text-slate-400 text-xs italic">Not provided</span>
              )}
            </td>
            <td className="px-2 py-3.5 text-center">
              <button type="button" onClick={(event) => { event.stopPropagation(); onSelect(p) }} className="rounded-lg p-1 text-base font-black leading-none text-slate-600 hover:bg-slate-100 hover:text-emerald-600 dark:text-slate-300 dark:hover:bg-slate-700" aria-label={`View ${p.type || 'property'} details`}>⋯</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)

// 📄 Pagination Component (Prev, 1, 2, 3, 4 ... Next)
const Pagination = ({ currentPage, totalPages, totalItems, itemsPerPage, onPageChange }) => {
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1
  const endItem = Math.min(currentPage * itemsPerPage, totalItems)

  const getPageNumbers = () => {
    const pages = []
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      if (currentPage <= 4) {
        pages.push(1, 2, 3, 4, 5, '...', totalPages)
      } else if (currentPage >= totalPages - 3) {
        pages.push(1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages)
      } else {
        pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages)
      }
    }
    return pages
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-6 pt-4 border-t border-slate-200 dark:border-slate-800">
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
        Showing <span className="font-bold text-slate-800 dark:text-slate-200">{startItem}</span> to{' '}
        <span className="font-bold text-slate-800 dark:text-slate-200">{endItem}</span> of{' '}
        <span className="font-bold text-slate-800 dark:text-slate-200">{totalItems}</span> properties
      </p>

      <div className="flex items-center gap-1.5 self-center sm:self-auto flex-wrap">
        {/* Prev Button */}
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all inline-flex items-center gap-1 cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          <span>Prev</span>
        </button>

        {/* Page Buttons */}
        {getPageNumbers().map((page, idx) =>
          page === '...' ? (
            <span key={`dots-${idx}`} className="px-1 text-xs font-bold text-slate-400">
              ...
            </span>
          ) : (
            <button
              key={page}
              type="button"
              onClick={() => onPageChange(page)}
              className={`min-w-[34px] h-[34px] rounded-xl text-xs font-bold transition-all cursor-pointer ${
                currentPage === page
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              {page}
            </button>
          )
        )}

        {/* Next Button */}
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all inline-flex items-center gap-1 cursor-pointer"
        >
          <span>Next</span>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  )
}

const DetailIcon = ({ type, className = 'h-5 w-5' }) => {
  const paths = {
    home: <path strokeLinecap="round" strokeLinejoin="round" d="m3 11 9-8 9 8M5.5 9.5V21h13V9.5M9.5 21v-7h5v7" />,
    layers: <><path strokeLinecap="round" strokeLinejoin="round" d="m12 3 9 5-9 5-9-5 9-5Z" /><path strokeLinecap="round" strokeLinejoin="round" d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
    area: <><path strokeLinecap="round" strokeLinejoin="round" d="M5 4H3v5m16-5h2v5M5 20H3v-5m16 5h2v-5M8 8h8v8H8z" /><path strokeLinecap="round" strokeLinejoin="round" d="m8 8-2-2m10 2 2-2m-10 10-2 2m10-2 2 2" /></>,
    city: <path strokeLinecap="round" strokeLinejoin="round" d="M4 21h16M6 21V7h7v14m0-10h5v10M9 10h1m-1 3h1m-1 3h1m6-2h1m-1 3h1" />,
    pin: <><path strokeLinecap="round" strokeLinejoin="round" d="M12 21s7-6.1 7-12A7 7 0 1 0 5 9c0 5.9 7 12 7 12Z" /><circle cx="12" cy="9" r="2" /></>,
    chart: <path strokeLinecap="round" strokeLinejoin="round" d="M4 20V10m5 10V6m5 14v-8m5 8V3M3 20h18m-1-15-6 6-4-3-6 5" />,
    phone: <path strokeLinecap="round" strokeLinejoin="round" d="M5 4h4l2 5-3 2a14 14 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2C9.7 21 3 14.3 3 6a2 2 0 0 1 2-2Z" />,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path strokeLinecap="round" d="M16 3v4M8 3v4M3 10h18" /></>,
    copy: <><rect x="8" y="8" width="11" height="12" rx="2" /><path strokeLinecap="round" strokeLinejoin="round" d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2" /></>,
  }
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">{paths[type]}</svg>
}

const DetailCard = ({ icon, label, value, accent = false, className = '' }) => (
  <div className={`flex min-w-0 items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-800/70 ${className}`}>
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400"><DetailIcon type={icon} /></span>
    <div className="min-w-0">
      <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">{label}</p>
      <p className={`mt-0.5 truncate text-sm font-bold ${accent ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-100'}`} title={value}>{value}</p>
    </div>
  </div>
)

const HighlightChip = ({ icon, children }) => (
  <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
    <span className="text-emerald-500">{icon}</span>{children}
  </span>
)

// 🪟 Ultra-Smooth Framer-Motion Animated Side Drawer (Full Details: Title, Size, SubType, Detailed Area, Full Address)
const PropertyDrawer = ({ property, onClose, statusOptions, updatingStatusId, onStatusChange }) => {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const cleanPhone = property?.phone ? property.phone.replace(/[^0-9]/g, '') : ''
  const waPhone = cleanPhone.startsWith('0') ? '92' + cleanPhone.slice(1) : cleanPhone

  return (
    <AnimatePresence>
      {property && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Smooth Fade Backdrop */}
          <motion.div
            key="drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/55 backdrop-blur-[3px]"
          />

          {/* Smooth Slide-over Panel */}
          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <motion.div
              key="drawer-panel"
              initial={{ x: '100%', opacity: 0.7 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0.7 }}
              transition={{
                type: 'spring',
                damping: 28,
                stiffness: 260,
                mass: 0.85,
              }}
              className="relative z-10 flex w-screen max-w-[720px] flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            >
              {/* Drawer Header */}
              <div className="flex items-start justify-between gap-5 px-6 pb-5 pt-7 dark:bg-slate-900 sm:px-8">
                <div className="min-w-0 flex-1">
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${property.purpose === 'Buy' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'}`}>For {property.purpose}</span>
                    <SentimentBadge sentiment={property.sentiment} />
                    {property.category && <span className="rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-bold uppercase text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">{property.category}</span>}
                  </div>
                  <div className="mb-4 flex flex-wrap items-center gap-3">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Listing Status</span>
                    <PropertyStatusSelect
                      value={property.status || 'AVAILABLE'}
                      options={statusOptions}
                      disabled={updatingStatusId === property.id}
                      onChange={(nextStatus) => onStatusChange(property.id, nextStatus)}
                    />
                  </div>
                  <h2 className="text-xl font-black leading-tight text-slate-950 dark:text-white sm:text-2xl">{property.title}</h2>
                  <p className="mt-2 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                    <span className="text-pink-500"><DetailIcon type="pin" className="h-4 w-4" /></span>
                    <span className="truncate">{property.location}{property.city && !String(property.location || '').toLowerCase().includes(property.city.toLowerCase()) ? `, ${property.city}` : ''}</span>
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-center gap-7">
                  <button type="button" onClick={onClose} className="rounded-xl p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200" aria-label="Close drawer">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" /></svg>
                  </button>
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400" aria-hidden="true">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M6 4h12v17l-6-4-6 4V4Z" /></svg>
                  </span>
                </div>
              </div>

              {/* Drawer Body (Scrollable) */}
              <div className="flex-1 space-y-6 overflow-y-auto px-6 pb-7 sm:px-8">
                {/* Price Highlight Banner */}
                <div className="flex items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 p-5 text-white shadow-lg shadow-emerald-500/15">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-50">Demand Price</p>
                    <p className="mt-1 text-2xl font-black sm:text-3xl">{formatPrice(property.price, property.purpose, property.priceFormatted)}</p>
                  </div>
                  <span className="hidden items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-xs font-bold shadow-inner sm:inline-flex">
                    <DetailIcon type="chart" /> Price Insights
                  </span>
                </div>

                {/* Complete Detailed Specs Grid */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                  <DetailCard icon="home" label="Property Type" value={property.type || 'N/A'} className="sm:col-span-2" />
                  <DetailCard icon="layers" label="Property Sub-Type" value={property.subType || 'Standard'} className="sm:col-span-2" />
                  <DetailCard icon="area" label="Area / Size" value={property.area > 0 ? `${property.area} ${property.areaUnit}` : 'N/A'} accent className="sm:col-span-2" />
                  <DetailCard icon="city" label="City" value={property.city || 'N/A'} className="sm:col-span-3" />
                  <DetailCard icon="pin" label="Area / Sector" value={property.location || 'N/A'} className="sm:col-span-3" />
                </div>

                <div>
                  <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-300">Highlights</p>
                  <div className="flex flex-wrap gap-2.5">
                    <HighlightChip icon="⌖">Mapped Location</HighlightChip>
                    <HighlightChip icon="✓">Standardized Price</HighlightChip>
                    <HighlightChip icon="⌁">AI Parsed</HighlightChip>
                    {property.phone && <HighlightChip icon="☎">Direct Contact</HighlightChip>}
                  </div>
                </div>

                {/* AI Summary Section */}
                {property.summary && (
                  <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-5 dark:border-blue-900/60 dark:bg-blue-950/30">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">🤖</span>
                        <p className="text-xs font-black uppercase tracking-wide text-blue-700 dark:text-blue-300">AI Parsed Summary</p>
                      </div>
                      <span className="rounded-full bg-blue-100 px-3 py-1 text-[10px] font-bold text-blue-600 dark:bg-blue-900/60 dark:text-blue-300">AI Generated</span>
                    </div>
                    <p className="text-sm font-medium leading-7 text-blue-900 dark:text-blue-200">
                      {property.summary}
                    </p>
                    {property.intent && (
                      <div className="mt-3 flex items-center gap-1.5 border-t border-blue-200/70 pt-3 text-xs text-blue-700 dark:border-blue-900/60 dark:text-blue-300">
                        <span className="font-bold">Detected Intent:</span>
                        <span>{property.intent}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Original Scraped WhatsApp Message */}
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-300">
                      💬 Original WhatsApp Message
                    </p>
                    <span className="text-[10px] text-slate-400">Raw text</span>
                  </div>
                  <div className="max-h-72 select-text overflow-y-auto whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 p-5 font-mono text-[12px] leading-6 text-slate-800 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-200">
                    {property.description || 'No raw message available'}
                  </div>
                </div>

                {/* Contact & Meta Info */}
                <div>
                  <p className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-300"><span className="text-pink-500"><DetailIcon type="phone" className="h-4 w-4" /></span>Contact &amp; Source Info</p>
                  <div className="space-y-3.5 text-sm">
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-medium text-slate-400">Phone Number</span>
                      <span className="flex items-center gap-2 font-mono font-bold text-slate-800 dark:text-slate-200">{property.phone || 'Not available'}<span className="text-slate-400"><DetailIcon type="copy" className="h-4 w-4" /></span></span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-medium text-slate-400">Scraped At</span>
                      <span className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300">{formatDate(property.scrapedAt)}<span className="text-slate-400"><DetailIcon type="calendar" className="h-4 w-4" /></span></span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-medium text-slate-400">Message ID</span>
                      <span className="flex items-center gap-2 font-mono text-slate-700 dark:text-slate-300">#{property.id}<span className="text-slate-400"><DetailIcon type="copy" className="h-4 w-4" /></span></span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-medium text-slate-400">Source</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">● &nbsp;WhatsApp</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Drawer Footer with Actions */}
              <div className="border-t border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900 sm:px-8">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {waPhone ? (
                  <a
                    href={`https://wa.me/${waPhone}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 text-sm font-bold text-white shadow-sm transition-colors hover:shadow-md"
                  >
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347Z" /><path d="M12 1a11 11 0 0 0-9.55 16.47L1 23l5.68-1.42A11 11 0 1 0 12 1Zm0 20a8.94 8.94 0 0 1-4.58-1.25l-.32-.19-3.37.84.88-3.28-.21-.34A9 9 0 1 1 12 21Z" /></svg>
                    <span>Chat on WhatsApp</span>
                  </a>
                ) : null}

                {property.phone ? (
                  <a
                    href={`tel:${property.phone}`}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white shadow-sm transition-colors hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700"
                  >
                    <DetailIcon type="phone" className="h-4 w-4" />
                    <span>Call Now</span>
                  </a>
                ) : null}
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className="mt-3 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  )
}

const CATEGORY_MAP = {
  'Commercial': [
    'commercial', 'shop', 'dukan', 'dokan', 'dukaan', 'store', 'showroom', 'retail', 'kiosk',
    'office', 'dafter', 'daftar', 'desk', 'corporate',
    'warehouse', 'godown', 'go-down', 'godam', 'ware house', 'storage',
    'factory', 'karkhana', 'mill', 'plant', 'industrial unit',
    'building', 'plaza', 'tower', 'complex', 'commercial building', 'commercial plot', 'hall', 'space'
  ],
  'House': [
    'house', 'home', 'makan', 'kothi', 'bangla', 'banglow', 'bungalow', 'bunglow',
    'villa', 'villas', 'luxury villa', 'duplex', 'farmhouse', 'farm house', 'farm',
    'single storey', 'single story', 'double storey', 'double story', 'triple storey', 'triple story'
  ],
  'Flat': [
    'flat', 'apartment', 'apartments', 'flats', 'studio', 'penthouse',
    'portion', 'lower portion', 'upper portion', '1 bed', '2 bed', '3 bed', '4 bed'
  ],
  'Plot': [
    'plot', 'plots', 'file', 'files', 'residential plot', 'commercial plot',
    'agricultural land', 'industrial land', 'land', 'acre', 'bigha', 'sq yd'
  ]
}

const SUB_TYPE_KEYWORD_MAP = {
  'standard': ['standard', 'general', 'commercial', 'hall', 'space', 'shop', 'office', 'unit'],
  'shop': ['shop', 'shops', 'dukan', 'dokan', 'dukaan', 'store', 'showroom', 'retail', 'kiosk'],
  'office': ['office', 'dafter', 'daftar', 'desk', 'corporate'],
  'warehouse': ['warehouse', 'godown', 'go-down', 'godam', 'ware house', 'storage'],
  'factory': ['factory', 'karkhana', 'mill', 'plant', 'industrial unit'],
  'building': ['building', 'plaza', 'tower', 'complex', 'commercial building'],
  'bungalow': ['bungalow', 'banglow', 'bangla', 'bunglow', 'independent house'],
  'villa': ['villa', 'villas', 'luxury villa', 'duplex'],
  'farm house': ['farm house', 'farmhouse', 'farm', 'form house'],
  'single storey': ['single storey', 'single story', '1 storey', '1 story'],
  'double storey': ['double storey', 'double story', '2 storey', '2 story', 'g+1'],
  'triple storey': ['triple storey', 'triple story', '3 storey', '3 story', 'g+2'],
  'studio': ['studio', 'studio apartment', 'bachelor'],
  '1 bed': ['1 bed', '1bed', '1-bed', 'one bed', 'single bed'],
  '2 bed': ['2 bed', '2bed', '2-bed', 'two bed'],
  '3 bed': ['3 bed', '3bed', '3-bed', 'three bed'],
  'penthouse': ['penthouse', 'pent house'],
  'lower portion': ['lower portion', 'lower ground', 'ground portion'],
  'upper portion': ['upper portion', 'first floor portion', '1st floor portion'],
  'residential plot': ['residential plot', 'res plot', 'residential'],
  'commercial plot': ['commercial plot', 'comm plot', 'commercial'],
  'agricultural land': ['agricultural', 'agri', 'agriculture', 'zari', 'land'],
  'industrial land': ['industrial plot', 'industrial land', 'factory plot', 'industrial'],
}

const matchesPropertyType = (property, selectedType) => {
  if (!selectedType || selectedType === 'All') return true
  const keywords = CATEGORY_MAP[selectedType]
  if (!keywords) return true

  const textToSearch = [
    property.type,
    property.subType,
    property.title,
    property.category,
    property.summary,
    property.description,
  ].filter(Boolean).join(' ').toLowerCase()

  return keywords.some(kw => textToSearch.includes(kw))
}

const matchesSubType = (property, subType) => {
  if (!subType || subType === 'Any') return true
  const target = subType.toLowerCase()

  if (target === 'standard') {
    if (property.subType && property.subType.toLowerCase().includes('standard')) return true
    return true
  }

  const keywords = SUB_TYPE_KEYWORD_MAP[target] || [target]

  const textToSearch = [
    property.subType,
    property.type,
    property.title,
    property.summary,
    property.description,
    property.category,
  ].filter(Boolean).join(' ').toLowerCase()

  return keywords.some(kw => textToSearch.includes(kw))
}

// 🏠 Main Results Page
const Results = ({ user, onSignOut, theme, setTheme }) => {
  const location = useLocation()
  const navigate = useNavigate()

  const initialFilters = location.state?.filters || DEFAULT_FILTERS

  const [committed, setCommitted] = useState(initialFilters)
  const [viewMode, setViewMode] = useState('list') // Default to 'list' (Table View)
  const [loading, setLoading] = useState(true)
  const [results, setResults] = useState([])
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('') // Live search query state
  const [priceSearchTerm, setPriceSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1) // Pagination state
  const [selectedProperty, setSelectedProperty] = useState(null) // Drawer state
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // 🧠 AI Normalization Status & Reasoning State
  const [normalizeStatus, setNormalizeStatus] = useState(null)
  const [loadingNormalize, setLoadingNormalize] = useState(false)
  const [normalizeLogs, setNormalizeLogs] = useState([])
  const [showNormalizeModal, setShowNormalizeModal] = useState(false)
  const [normalizationReasons, setNormalizationReasons] = useState([])
  const [statusOptions, setStatusOptions] = useState(PROPERTY_STATUS_ENUM)
  const [updatingStatusId, setUpdatingStatusId] = useState(null)

  useEffect(() => {
    let active = true

    propertyApi.getStatuses()
      .then((response) => {
        const statuses = response?.data?.statuses || response?.statuses
        if (active && Array.isArray(statuses) && statuses.length > 0) {
          setStatusOptions([...new Set(statuses.map((status) => String(status).trim().toUpperCase()).filter(Boolean))])
        }
      })
      .catch(() => {
        if (active) setStatusOptions(PROPERTY_STATUS_ENUM)
      })

    return () => { active = false }
  }, [])

  const handlePropertyStatusChange = async (propertyId, nextStatus) => {
    if (!propertyId) return

    const previousStatus = results.find((item) => item.id === propertyId)?.status || 'AVAILABLE'
    setUpdatingStatusId(propertyId)
    setResults((prev) => prev.map((item) => (
      item.id === propertyId ? { ...item, status: nextStatus } : item
    )))
    setSelectedProperty((prev) => (
      prev?.id === propertyId ? { ...prev, status: nextStatus } : prev
    ))

    try {
      await propertyApi.updateStatus(propertyId, nextStatus)
    } catch (err) {
      setResults((prev) => prev.map((item) => (
        item.id === propertyId ? { ...item, status: previousStatus } : item
      )))
      setSelectedProperty((prev) => (
        prev?.id === propertyId ? { ...prev, status: previousStatus } : prev
      ))
      setError(err.message || 'Failed to update property status')
    } finally {
      setUpdatingStatusId(null)
    }
  }

  // 📡 Fetch Normalization Status from /api/normalize/status and analyze reasoning
  const fetchNormalizationStatus = async (currentResults = [], currentFilters = committed) => {
    setLoadingNormalize(true)
    const logTime = new Date().toLocaleTimeString()
    const newLogs = []
    
    newLogs.push(`[${logTime}] 🔍 Querying /api/normalize/status for active user...`)
    console.group(`🤖 [AI Normalization Pipeline - ${logTime}]`)
    console.log('🔍 Active Search Filters:', currentFilters)
    console.log('📡 Calling GET /api/normalize/status...')

    try {
      const statusRes = await normalizeApi.getStatus()
      const rawData = statusRes?.data || statusRes
      console.log('📊 [Normalize API Status Response]:', statusRes)
      newLogs.push(`[${new Date().toLocaleTimeString()}] ✅ Status Received: ${JSON.stringify(rawData?.status || rawData?.message || 'Active')}`)
      
      setNormalizeStatus(statusRes)

      const reasons = analyzeNormalizationReasons(currentResults, currentFilters, rawData)
      setNormalizationReasons(reasons)
      
      console.log('💡 [Why Normalization Occurred - Active Reasoning Categories]:', reasons)
      newLogs.push(`[${new Date().toLocaleTimeString()}] 💡 Computed ${reasons.length} active reasoning categories (Price, Location, Intent, Slang NLP)`)
      console.groupEnd()
    } catch (err) {
      console.warn('⚠️ [Normalize API Warning]:', err.message)
      newLogs.push(`[${new Date().toLocaleTimeString()}] ⚠️ Normalization API Check: ${err.message}`)
      
      const fallbackReasons = analyzeNormalizationReasons(currentResults, currentFilters, { status: 'Offline / Standalone', message: err.message })
      setNormalizationReasons(fallbackReasons)
      setNormalizeStatus({ status: 'offline', message: err.message })
      console.groupEnd()
    } finally {
      setLoadingNormalize(false)
      setNormalizeLogs(prev => [...newLogs, ...prev].slice(0, 60))
    }
  }

  useEffect(() => {
    setLoading(true)
    setError('')
    setCurrentPage(1)
    console.log('🚀 Sending search filters to ML dashboard-search:', committed)

    const runSearch = async () => {
      try {
        const res = await mlSearchApi.dashboardSearch(committed)
        const rawList = parseMLSearchResults(res)
        setResults(rawList.map(normalizeMLResult))
        fetchNormalizationStatus(rawList, committed)
      } catch (mlError) {
        console.warn('ML dashboard-search failed, falling back to property filter API:', mlError.message)
        const res = await propertyApi.filterProperties(committed)
        const properties = res?.data?.properties || res?.properties || []
        const normalized = properties.map(normalizeFilterProperty)
        setResults(normalized)
        fetchNormalizationStatus(properties, committed)
      }
    }

    runSearch()
      .catch((err) => {
        console.error('Search API Error:', err)
        setError(err.message || 'Failed to search properties')
        setResults([])
        fetchNormalizationStatus([], committed)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [committed])

  // Reset to page 1 on live search change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, priceSearchTerm])

  // 🔍 Client-side refine on already-fetched ML results (search bars only)
  const filteredResults = useMemo(() => {
    let list = results

    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase()
      list = list.filter(p => {
        return (
          (p.title && p.title.toLowerCase().includes(q)) ||
          (p.location && p.location.toLowerCase().includes(q)) ||
          (p.city && p.city.toLowerCase().includes(q)) ||
          (p.type && p.type.toLowerCase().includes(q)) ||
          (p.subType && p.subType.toLowerCase().includes(q)) ||
          (p.phone && p.phone.toLowerCase().includes(q)) ||
          (p.summary && p.summary.toLowerCase().includes(q)) ||
          (p.intent && p.intent.toLowerCase().includes(q)) ||
          (p.category && p.category.toLowerCase().includes(q)) ||
          (p.description && p.description.toLowerCase().includes(q)) ||
          (p.priceFormatted && p.priceFormatted.toLowerCase().includes(q))
        )
      })
    }

    if (priceSearchTerm.trim()) {
      const priceQuery = priceSearchTerm.trim().toLowerCase()
      const parsedPriceSearch = parsePriceSearch(priceQuery)

      list = list.filter(p => {
        const textMatch = [
          p.priceFormatted,
          formatPrice(p.price, p.purpose, p.priceFormatted),
        ].filter(Boolean).some(value => String(value).toLowerCase().includes(priceQuery))

        if (textMatch) return true
        if (!parsedPriceSearch) return false

        const bounds = getPropertyPriceBounds(p)
        if (!bounds) return false

        if (parsedPriceSearch.type === 'max') {
          return bounds.min <= parsedPriceSearch.max
        }

        if (parsedPriceSearch.type === 'min') {
          return bounds.max >= parsedPriceSearch.min
        }

        return bounds.max >= parsedPriceSearch.min && bounds.min <= parsedPriceSearch.max
      })
    }

    return list
  }, [results, searchTerm, priceSearchTerm])

  // 📄 Pagination Calculations (20 items per page)
  const totalPages = Math.ceil(filteredResults.length / ITEMS_PER_PAGE) || 1
  const paginatedResults = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE
    return filteredResults.slice(start, start + ITEMS_PER_PAGE)
  }, [filteredResults, currentPage])

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage)
      window.scrollTo({ top: 180, behavior: 'smooth' })
    }
  }

  const openDashboardTab = (tab = 'search') => {
    localStorage.setItem('user_active_tab', tab)
    navigate('/dashboard')
  }

  const searchSummary = [
    committed.purpose === 'Buy' ? 'For Sale' : committed.purpose === 'Rent' ? 'For Rent' : 'Buy & Rent',
    committed.propertyType !== 'All' ? committed.propertyType : 'All Properties',
    committed.city || 'All Cities',
    committed.status ? `Status: ${committed.status.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())}` : null,
    committed.location ? committed.location : null,
    committed.priceMin || committed.priceMax
      ? `${committed.priceMin ? `PKR ${formatPriceRangeLabel(committed.priceMin)}` : 'PKR 0'} – ${committed.priceMax ? formatPriceRangeLabel(committed.priceMax) : 'Any'}`
      : 'Any Price',
    committed.areaMin || committed.areaMax
      ? `${committed.areaMin || '0'} – ${committed.areaMax || 'Any'} ${committed.areaUnit !== 'All' ? committed.areaUnit : ''}`.trim()
      : 'Any Area',
    committed.areaUnit && committed.areaUnit !== 'All' ? committed.areaUnit : 'Any Area Unit',
  ].filter(Boolean)

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50 text-slate-800 transition-colors dark:bg-slate-900 dark:text-slate-100">
      <Sidebar
        user={user}
        activeTab="search"
        setActiveTab={openDashboardTab}
        onSignOut={onSignOut}
        navItems={USER_NAV}
        isAdmin={false}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-slate-50 transition-colors dark:bg-slate-900">
        <Header
          title="AI Search Results"
          onBack={() => openDashboardTab('search')}
          onMenuClick={() => setSidebarOpen(true)}
          theme={theme}
          setTheme={setTheme}
          user={user}
        />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1600px] p-4 sm:p-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-colors dark:border-slate-700 dark:bg-slate-800 sm:p-5">
        {/* Search Summary */}
        <div className="mb-5 flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors dark:border-slate-700 dark:bg-slate-800 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/15">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="m20 20-4-4" /></svg>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Your Search Summary</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                {searchSummary.map((item, index) => <span key={`${item}-${index}`} className="inline-flex items-center gap-2">{index > 0 && <span className="text-slate-300 dark:text-slate-600">•</span>}{item}</span>)}
              </div>
            </div>
          </div>

          <button
            onClick={() => openDashboardTab('search')}
            className="flex items-center justify-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-600 transition-colors hover:border-emerald-300 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-emerald-700 dark:hover:text-emerald-400 md:self-auto"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            Edit Search
          </button>
        </div>

        {/* 🧠 Live AI Normalization Status Card (Human-Friendly, Real-time) */}
        <div className="mb-5 rounded-2xl border border-blue-100 bg-gradient-to-br from-white via-blue-50/40 to-indigo-50/40 p-4 shadow-xs transition-all dark:border-slate-700 dark:from-slate-800 dark:via-slate-800/90 dark:to-indigo-950/20 sm:p-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            
            {/* Left: AI Status & Live Processing Indicator */}
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="relative shrink-0">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-xl text-white shadow-md shadow-emerald-500/20">
                  ✨
                </div>
                <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${loading ? 'bg-amber-400' : 'bg-emerald-400'} opacity-75`} />
                  <span className={`relative inline-flex rounded-full h-3.5 w-3.5 border-2 border-white dark:border-slate-800 ${loading ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                </span>
              </div>

              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-slate-100">
                    <span>AI Normalization Engine</span>
                  </h3>
                  <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full border shadow-2xs ${
                    loading
                      ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900/50 animate-pulse'
                      : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/50'
                  }`}>
                    {loading ? '⚡ Analyzing & Normalizing in Real Time...' : '✅ Data Standardized & Ready'}
                  </span>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                  {loading ? (
                    'Reading raw WhatsApp chats, converting prices (Lac/Crore), and mapping locations...'
                  ) : (
                    <>
                      Standardized <strong className="text-slate-900 dark:text-slate-100 font-bold">{results.length} property listings</strong> from WhatsApp messages with instant price, location & category detection.
                    </>
                  )}
                </p>
              </div>
            </div>

            {/* Right: Learn How AI Works Button */}
            <div className="flex items-center gap-2 shrink-0 self-end md:self-auto flex-wrap">
              {!loading && results.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowNormalizeModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-md shadow-blue-600/20 hover:shadow-lg hover:shadow-blue-600/30 active:scale-[0.98] transition-all cursor-pointer"
                >
                  <span>💡 How AI Processed This</span>
                  <span className="bg-white/20 px-1.5 py-0.5 rounded-md text-[10px]">
                    4 Rules Applied
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Real-time Summary Pills Bar */}
          {!loading && results.length > 0 && (
            <div className="mt-4 pt-3.5 border-t border-slate-200/60 dark:border-slate-700/60 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="flex items-center gap-2 p-2 rounded-xl bg-white dark:bg-slate-750/70 border border-slate-200/70 dark:border-slate-700/80">
                <span className="text-sm">💰</span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Prices Standardized</p>
                  <p className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">
                    {results.filter(r => r.price).length} in PKR (Lac/Cr)
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 p-2 rounded-xl bg-white dark:bg-slate-750/70 border border-slate-200/70 dark:border-slate-700/80">
                <span className="text-sm">📍</span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Locations Mapped</p>
                  <p className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">
                    {committed.city !== 'All Cities' ? committed.city : 'All Pakistan'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 p-2 rounded-xl bg-white dark:bg-slate-750/70 border border-slate-200/70 dark:border-slate-700/80">
                <span className="text-sm">🎯</span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Purpose Classified</p>
                  <p className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">
                    {committed.purpose === 'All' ? 'Buy & Rent' : committed.purpose}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 p-2 rounded-xl bg-white dark:bg-slate-750/70 border border-slate-200/70 dark:border-slate-700/80">
                <span className="text-sm">📞</span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Contacts Extracted</p>
                  <p className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">
                    {results.filter(r => r.phone).length} Direct Numbers
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mb-4 rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 p-4 text-sm text-rose-700 dark:text-rose-300 flex items-center gap-3">
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            {error}
          </div>
        )}

        {/* Results Controls Bar with Live Search & View Toggle */}
        <div className="-mx-4 mb-4 flex flex-col justify-between gap-3 border-t border-slate-100 px-4 pt-3 dark:border-slate-700/70 sm:-mx-5 sm:flex-row sm:items-center sm:px-5">
          
          {/* 🔍 Interactive Live Search Input Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-3 flex-1">
            <div className="relative w-full sm:max-w-md">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Live search by location, property, phone..."
                className="w-full pl-10 pr-9 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition-colors shadow-sm"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  aria-label="Clear search"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            <div className="relative w-full sm:max-w-xs">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-emerald-500 dark:text-emerald-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m3-9.5A3.5 3.5 0 0011.5 5H10a3 3 0 000 6h4a3 3 0 010 6h-1.5A3.5 3.5 0 019 13.5" />
                </svg>
              </span>
              <input
                type="text"
                value={priceSearchTerm}
                onChange={(e) => setPriceSearchTerm(e.target.value)}
                placeholder="Price: 1.5 cr, 80 lac, < 2 cr..."
                className="w-full pl-10 pr-9 py-2.5 text-xs rounded-xl border border-emerald-200 dark:border-emerald-900/70 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition-colors shadow-sm"
              />
              {priceSearchTerm && (
                <button
                  type="button"
                  onClick={() => setPriceSearchTerm('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  aria-label="Clear price search"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap hidden xl:inline">
              {filteredResults.length} {filteredResults.length === 1 ? 'property' : 'properties'} found
              {(searchTerm || priceSearchTerm) && ` (filtered from ${results.length})`}
            </span>
          </div>

          {/* View Mode Toggle: Table (Default) vs Grid */}
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800/90 p-1 rounded-xl border border-slate-200 dark:border-slate-700 self-end sm:self-auto shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
              aria-label="Table View"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M3 6h18M3 18h18" />
              </svg>
              <span>Table</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
              aria-label="Grid View"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              <span>Grid</span>
            </button>
          </div>
        </div>

        {/* Results View: Skeleton / Empty / Table / Grid */}
        {loading ? (
          viewMode === 'list' ? (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden p-6 space-y-4 animate-pulse">
              <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-1/4 mb-4" />
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-10 bg-slate-100 dark:bg-slate-750 rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          )
        ) : filteredResults.length === 0 ? (
          <div className="text-center py-20 transition-colors bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 shadow-sm">
            <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-slate-750 flex items-center justify-center mx-auto mb-4 text-3xl">
              🔍
            </div>
            <p className="font-extrabold text-slate-800 dark:text-slate-100 text-lg">
              {searchTerm || priceSearchTerm ? 'No matching properties found' : 'No properties found for your filters'}
            </p>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
              {searchTerm || priceSearchTerm ? 'Try clearing your live search or price search' : 'Try adjusting your filters and search again'}
            </p>
            {(searchTerm || priceSearchTerm) && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('')
                  setPriceSearchTerm('')
                }}
                className="mt-4 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors cursor-pointer"
              >
                Clear Search
              </button>
            )}
          </div>
        ) : viewMode === 'list' ? (
          <>
            <PropertyTable
              properties={paginatedResults}
              onSelect={setSelectedProperty}
              statusOptions={statusOptions}
              updatingStatusId={updatingStatusId}
              onStatusChange={handlePropertyStatusChange}
            />
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={filteredResults.length}
              itemsPerPage={ITEMS_PER_PAGE}
              onPageChange={handlePageChange}
            />
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {paginatedResults.map((p) => (
                <PropertyCard key={p.id} p={p} onSelect={setSelectedProperty} />
              ))}
            </div>
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={filteredResults.length}
              itemsPerPage={ITEMS_PER_PAGE}
              onPageChange={handlePageChange}
            />
          </>
        )}
            </div>
          </div>
        </main>
      </div>

      {/* ✨ User-Friendly AI Normalization Explanation Modal (ZERO Code, ZERO JSON) */}
      {showNormalizeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-2xl max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-scaleUp">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between gap-3 bg-gradient-to-r from-blue-50/70 to-indigo-50/50 dark:from-slate-800 dark:to-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 text-lg">
                  ✨
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900 dark:text-slate-100">
                    How AI Processed Your Search
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    WhatsApp messages are automatically cleaned, standardized & mapped
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowNormalizeModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="p-5 overflow-y-auto space-y-3.5 flex-1 text-slate-800 dark:text-slate-200">
              
              {/* Card 1: Price Normalization */}
              <div className="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 space-y-1.5">
                <div className="flex items-center gap-2 font-black text-emerald-800 dark:text-emerald-300 text-xs">
                  <span className="text-base">💰</span>
                  <span>1. Pakistani Price Standardization</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Raw WhatsApp messages contain different price formats like <strong className="text-emerald-700 dark:text-emerald-300">1.8 Cr</strong>, <strong className="text-emerald-700 dark:text-emerald-300">85 Lac</strong>, or <strong className="text-emerald-700 dark:text-emerald-300">500k</strong>. The AI automatically converts them into exact PKR numbers so you can filter and compare accurately.
                </p>
              </div>

              {/* Card 2: Location Extraction */}
              <div className="p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 space-y-1.5">
                <div className="flex items-center gap-2 font-black text-blue-800 dark:text-blue-300 text-xs">
                  <span className="text-base">📍</span>
                  <span>2. Smart Locality & Sector Mapping</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Extracts phases, sectors, blocks, and city names from noisy dealer text so you only see listings in your target area.
                </p>
              </div>

              {/* Card 3: Property Type & Intent */}
              <div className="p-4 rounded-2xl bg-purple-50/60 dark:bg-purple-950/30 border border-purple-100 dark:border-purple-900/40 space-y-1.5">
                <div className="flex items-center gap-2 font-black text-purple-800 dark:text-purple-300 text-xs">
                  <span className="text-base">🏠</span>
                  <span>3. Category & Purpose Detection</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Identifies if a message is for <strong className="text-purple-700 dark:text-purple-300">Buying/Selling</strong> or <strong className="text-purple-700 dark:text-purple-300">Rent</strong>, and categorizes whether it is a House, Flat, Portion, or Plot.
                </p>
              </div>

              {/* Card 4: Urdu & Slang Intelligence */}
              <div className="p-4 rounded-2xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40 space-y-1.5">
                <div className="flex items-center gap-2 font-black text-amber-800 dark:text-amber-300 text-xs">
                  <span className="text-base">💬</span>
                  <span>4. Roman Urdu & Real Estate Slang Decoder</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Understands common abbreviations used by Pakistani real estate dealers like <em>&ldquo;dem&rdquo;</em> (demand), <em>&ldquo;bhk&rdquo;</em>, <em>&ldquo;marla&rdquo;</em>, <em>&ldquo;kanal&rdquo;</em>, and <em>&ldquo;sq yd&rdquo;</em>.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">
                ⚡ Automatic Real-time Processing
              </span>
              <button
                type="button"
                onClick={() => setShowNormalizeModal(false)}
                className="px-5 py-2 rounded-xl bg-slate-900 dark:bg-slate-750 hover:bg-slate-800 text-white font-bold text-xs transition-colors cursor-pointer"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ultra-Smooth Animated Side Drawer for Property Details */}
      <PropertyDrawer
        property={selectedProperty}
        onClose={() => setSelectedProperty(null)}
        statusOptions={statusOptions}
        updatingStatusId={updatingStatusId}
        onStatusChange={handlePropertyStatusChange}
      />
    </div>
  )
}

export default Results
