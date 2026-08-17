import { useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import PropertyFilters, { DEFAULT_FILTERS } from '../../components/PropertyFilters/PropertyFilters'
import { CardSkeleton } from '../../components/Skeleton/Skeleton'
import { mlSearchApi } from '../../api'

const ITEMS_PER_PAGE = 20

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

  return {
    id: item.message_id || index,
    title: `${item.size || ''} ${item.property_sub_type || propertyType}`.trim() || 'Property Listing',
    price: item.price_value || 0,
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
    similarityScore: item.similarity_score,
  }
}

const formatPrice = (price, purpose, priceFormatted) => {
  if (priceFormatted) return priceFormatted
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

// 🗂️ Grid Property Card Component
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
const PropertyTable = ({ properties, onSelect }) => (
  <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
    <table className="w-full table-fixed text-left text-xs text-slate-600 dark:text-slate-300">
      <thead className="bg-slate-50 dark:bg-slate-900/60 text-[11px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider border-b border-slate-200 dark:border-slate-700">
        <tr>
          <th scope="col" className="px-4 py-3.5 w-[14%] sm:w-[12%]">Status</th>
          <th scope="col" className="px-4 py-3.5 w-[26%] sm:w-[26%]">Property</th>
          <th scope="col" className="px-4 py-3.5 w-[18%] sm:w-[18%]">Location</th>
          <th scope="col" className="px-4 py-3.5 w-[20%] sm:w-[20%]">Price</th>
          <th scope="col" className="px-4 py-3.5 w-[22%] sm:w-[24%]">Contact Number</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-slate-700/70">
        {properties.map((p) => (
          <tr
            key={p.id}
            onClick={() => onSelect(p)}
            className="hover:bg-emerald-50/70 dark:hover:bg-emerald-950/30 transition-colors cursor-pointer group"
          >
            {/* Rent / Sale */}
            <td className="px-4 py-3.5 whitespace-nowrap">
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full inline-block ${p.purpose === 'Buy' ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300' : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'}`}>
                For {p.purpose}
              </span>
            </td>

            {/* Property: ONLY Property Type (Line clamped & truncated) */}
            <td className="px-4 py-3.5 overflow-hidden">
              <span
                title={p.type || 'Property'}
                className="font-bold text-slate-900 dark:text-slate-100 text-xs sm:text-sm group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors block truncate"
              >
                {p.type || 'Property'}
              </span>
            </td>

            {/* Location: ONLY City */}
            <td className="px-4 py-3.5 overflow-hidden whitespace-nowrap">
              <div className="flex items-center gap-1 text-slate-800 dark:text-slate-200 font-semibold text-xs truncate">
                <span className="text-emerald-500 shrink-0">📍</span>
                <span className="truncate" title={p.city || 'Unknown'}>{p.city || 'Unknown'}</span>
              </div>
            </td>

            {/* Price */}
            <td className="px-4 py-3.5 whitespace-nowrap overflow-hidden">
              <span className="font-extrabold text-emerald-600 dark:text-emerald-400 text-xs sm:text-sm block truncate">
                {formatPrice(p.price, p.purpose, p.priceFormatted)}
              </span>
            </td>

            {/* Contact */}
            <td className="px-4 py-3.5 whitespace-nowrap overflow-hidden">
              {p.phone ? (
                <span className="font-mono text-slate-800 dark:text-slate-200 text-[11px] sm:text-xs font-bold bg-slate-100 dark:bg-slate-700/60 px-2 sm:px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-600 inline-flex items-center gap-1 max-w-full truncate">
                  <span className="shrink-0">📞</span>
                  <span className="truncate">{p.phone}</span>
                </span>
              ) : (
                <span className="text-slate-400 text-xs italic">Not provided</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)

// 📄 Pagination Component (Prev, 1, 2, 3, 4 ... Next)
const Pagination = ({ currentPage, totalPages, totalItems, itemsPerPage, onPageChange }) => {
  if (totalPages <= 1) return null

  const startItem = (currentPage - 1) * itemsPerPage + 1
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

// 🪟 Ultra-Smooth Framer-Motion Animated Side Drawer (Full Details: Title, Size, SubType, Detailed Area, Full Address)
const PropertyDrawer = ({ property, onClose }) => {
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
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
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
              className="w-screen max-w-lg md:max-w-xl bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-slate-700 flex flex-col relative z-10"
            >
              {/* Drawer Header */}
              <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4 bg-slate-50/70 dark:bg-slate-800/60">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${property.purpose === 'Buy' ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300' : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'}`}>
                      For {property.purpose}
                    </span>
                    <SentimentBadge sentiment={property.sentiment} />
                    {property.category && (
                      <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300">
                        {property.category}
                      </span>
                    )}
                  </div>
                  {/* Detailed Title / Size & Subtype */}
                  <h2 className="text-lg font-black text-slate-900 dark:text-slate-100 leading-snug">
                    {property.title}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    📍 {property.location}{property.city ? `, ${property.city}` : ''}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
                  aria-label="Close drawer"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Drawer Body (Scrollable) */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {/* Price Highlight Banner */}
                <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl p-4 text-white shadow-md">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-100">Demand / Price</p>
                  <p className="text-2xl font-black mt-0.5">
                    {formatPrice(property.price, property.purpose, property.priceFormatted)}
                  </p>
                </div>

                {/* Complete Detailed Specs Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/70 rounded-xl border border-slate-100 dark:border-slate-700">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Property Type</p>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5">{property.type || 'N/A'}</p>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/70 rounded-xl border border-slate-100 dark:border-slate-700">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Property Sub-Type</p>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5">{property.subType || 'Standard'}</p>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/70 rounded-xl border border-slate-100 dark:border-slate-700">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Area / Size</p>
                    <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                      {property.area > 0 ? `${property.area} ${property.areaUnit}` : 'N/A'}
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/70 rounded-xl border border-slate-100 dark:border-slate-700">
                    <p className="text-[10px] font-bold uppercase text-slate-400">City</p>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5">{property.city || 'N/A'}</p>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/70 rounded-xl border border-slate-100 dark:border-slate-700 col-span-2">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Area / Sector / Vicinity</p>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5 truncate">{property.location || 'N/A'}</p>
                  </div>
                </div>

                {/* AI Summary Section */}
                {property.summary && (
                  <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-sm">🤖</span>
                      <p className="text-xs font-black text-blue-700 dark:text-blue-300 uppercase tracking-wide">
                        AI Parsed Summary
                      </p>
                    </div>
                    <p className="text-xs text-blue-900 dark:text-blue-200 leading-relaxed font-medium">
                      {property.summary}
                    </p>
                    {property.intent && (
                      <div className="mt-2.5 pt-2.5 border-t border-blue-200/60 dark:border-blue-900/60 flex items-center gap-1.5 text-[11px] text-blue-700 dark:text-blue-300">
                        <span className="font-bold">Detected Intent:</span>
                        <span>{property.intent}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Original Scraped WhatsApp Message */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-300">
                      💬 Original WhatsApp Message
                    </p>
                    <span className="text-[10px] text-slate-400">Raw text</span>
                  </div>
                  <div className="p-4 bg-slate-100 dark:bg-slate-800/90 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap select-text max-h-72 overflow-y-auto">
                    {property.description || 'No raw message available'}
                  </div>
                </div>

                {/* Contact & Meta Info */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-100 dark:border-slate-700 space-y-3">
                  <p className="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-300">
                    📞 Contact & Source Info
                  </p>
                  
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-medium">Phone Number:</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                      {property.phone || 'Not available'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-medium">Scraped At:</span>
                    <span className="text-slate-700 dark:text-slate-300 font-medium">
                      {formatDate(property.scrapedAt)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-medium">Message ID:</span>
                    <span className="text-slate-700 dark:text-slate-300 font-mono">
                      #{property.id}
                    </span>
                  </div>
                </div>
              </div>

              {/* Drawer Footer with Actions */}
              <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/80 flex items-center gap-2.5">
                {waPhone ? (
                  <a
                    href={`https://wa.me/${waPhone}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm transition-colors"
                  >
                    <span>💬 WhatsApp</span>
                  </a>
                ) : null}

                {property.phone ? (
                  <a
                    href={`tel:${property.phone}`}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 text-white font-bold text-xs shadow-sm transition-colors"
                  >
                    <span>📞 Call</span>
                  </a>
                ) : null}

                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 font-bold text-xs transition-colors cursor-pointer"
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
const Results = () => {
  const location = useLocation()
  const navigate = useNavigate()

  const initialFilters = location.state?.filters || DEFAULT_FILTERS

  const [committed, setCommitted] = useState(initialFilters)
  const [viewMode, setViewMode] = useState('list') // Default to 'list' (Table View)
  const [loading, setLoading] = useState(true)
  const [results, setResults] = useState([])
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('') // Live search query state
  const [currentPage, setCurrentPage] = useState(1) // Pagination state
  const [selectedProperty, setSelectedProperty] = useState(null) // Drawer state

  useEffect(() => {
    setLoading(true)
    setError('')
    setCurrentPage(1)
    console.log('Sending filters to ML API:', committed)
    mlSearchApi.dashboardSearch(committed)
      .then(res => {
        console.log('ML API Response:', res)
        if (res?.success && Array.isArray(res.results)) {
          setResults(res.results.map(normalizeMLResult))
        } else {
          setResults([])
        }
      })
      .catch(err => {
        console.error('ML API Error:', err)
        setError(err.message || 'Failed to search properties')
        setResults([])
      })
      .finally(() => {
        setLoading(false)
      })
  }, [committed])

  // Reset to page 1 on live search change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm])

  // 🔍 Real-time Live Filter on Results
  const filteredResults = useMemo(() => {
    let list = results

    // 1. Filter by Property Type (Category)
    if (committed.propertyType && committed.propertyType !== 'All') {
      list = list.filter(p => matchesPropertyType(p, committed.propertyType))
    }

    // 2. Filter by Property Sub Type
    if (committed.propertySubType && committed.propertySubType !== 'Any') {
      list = list.filter(p => matchesSubType(p, committed.propertySubType))
    }

    // 3. Filter by live search bar term
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

    return list
  }, [results, committed.propertyType, committed.propertySubType, searchTerm])

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

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 transition-colors pb-12">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-750 cursor-pointer transition-colors shrink-0"
            aria-label="Back"
          >
            <svg className="w-5 h-5 text-slate-600 dark:text-slate-350" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shrink-0">
              <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              </svg>
            </div>
            <span className="font-extrabold text-slate-900 dark:text-slate-100 text-sm">WhatsScrape</span>
          </div>
          <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />
          <h1 className="text-sm font-bold text-slate-700 dark:text-slate-300 truncate">
            AI Search Results
            {committed.city !== 'All Cities' && ` › ${committed.city}`}
            {committed.location && ` › ${committed.location}`}
          </h1>
          <span className="ml-auto text-[10px] font-bold px-2.5 py-1 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 rounded-lg border border-blue-100 dark:border-blue-900/50 shrink-0">
            🤖 AI Powered
          </span>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Active Filters Summary Bar */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 sm:p-5 shadow-sm mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 transition-colors">
          <div className="flex-1">
            <p className="text-[11px] font-bold text-slate-405 dark:text-slate-500 uppercase tracking-wide mb-1">Active Search Filters</p>
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-xs font-bold px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 rounded-lg border border-emerald-100 dark:border-emerald-900/50">
                For {committed.purpose}
              </span>
              <span className="text-xs font-bold px-2.5 py-1 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg border border-slate-200 dark:border-slate-600">
                📍 {committed.city}
              </span>
              {committed.location && (
                <span className="text-xs font-bold px-2.5 py-1 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 rounded-lg border border-blue-100 dark:border-blue-900/50">
                  📍 "${committed.location}"
                </span>
              )}
              {committed.propertyType !== 'All' && (
                <span className="text-xs font-bold px-2.5 py-1 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 rounded-lg border border-purple-100 dark:border-purple-900/50">
                  🏠 {committed.propertyType} {committed.propertySubType ? `(${committed.propertySubType})` : ''}
                </span>
              )}
              {(committed.priceMin || committed.priceMax) && (
                <span className="text-xs font-bold px-2.5 py-1 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 rounded-lg border border-amber-100 dark:border-amber-900/50">
                  💰 {committed.priceMin || '0'} to {committed.priceMax || 'Max'}
                </span>
              )}
              {(committed.areaMin || committed.areaMax) && (
                <span className="text-xs font-bold px-2.5 py-1 bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-400 rounded-lg border border-cyan-100 dark:border-cyan-900/50">
                  📐 {committed.areaMin || '0'} - {committed.areaMax || 'Max'} {committed.areaUnit}
                </span>
              )}
            </div>
          </div>

          <button
            onClick={() => navigate(-1)}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-900 dark:bg-slate-750 text-white rounded-xl font-bold text-xs hover:bg-slate-800 dark:hover:bg-slate-650 transition-colors cursor-pointer self-start md:self-auto"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            Modify Search
          </button>
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          
          {/* 🔍 Interactive Live Search Input Bar */}
          <div className="flex items-center gap-3 flex-1">
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
                placeholder="Live search by location, property, phone, price..."
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

            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap hidden md:inline">
              {filteredResults.length} {filteredResults.length === 1 ? 'property' : 'properties'}
              {searchTerm && ` (filtered from ${results.length})`}
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
            <TableSkeleton />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          )
        ) : filteredResults.length === 0 ? (
          <div className="text-center py-20 transition-colors bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-8">
            <svg className="w-14 h-14 mx-auto text-slate-300 dark:text-slate-650 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p className="font-bold text-slate-700 dark:text-slate-300 text-base">
              {searchTerm ? 'No matching properties found' : 'No properties found'}
            </p>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
              {searchTerm ? 'Try clearing your live search or searching another keyword' : 'Try adjusting your filters and search again'}
            </p>
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="mt-4 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors cursor-pointer"
              >
                Clear Search
              </button>
            )}
          </div>
        ) : viewMode === 'list' ? (
          <>
            <PropertyTable properties={paginatedResults} onSelect={setSelectedProperty} />
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

      {/* Ultra-Smooth Animated Side Drawer for Property Details */}
      <PropertyDrawer
        property={selectedProperty}
        onClose={() => setSelectedProperty(null)}
      />
    </div>
  )
}

export default Results
