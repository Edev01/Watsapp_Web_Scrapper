import { useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import PropertyFilters, { DEFAULT_FILTERS } from '../../components/PropertyFilters/PropertyFilters'
import { CardSkeleton } from '../../components/Skeleton/Skeleton'
import { mlSearchApi } from '../../api'

// Map ML API response item to normalized property object
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
    location: location || 'Unknown',
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

const formatDate = iso => new Date(iso).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

const SentimentBadge = ({ sentiment }) => {
  if (!sentiment) return null
  const s = sentiment.toUpperCase()
  const styles = {
    POSITIVE: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400',
    NEUTRAL: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
    NEGATIVE: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400',
  }
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${styles[s] || styles.NEUTRAL}`}>
      {s === 'POSITIVE' ? '\u{1F60A}' : s === 'NEGATIVE' ? '\u{1F61F}' : '\u{1F610}'} {s.charAt(0) + s.slice(1).toLowerCase()}
    </span>
  )
}

const PropertyCard = ({ p, viewMode }) => (
  <div className={`bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md hover:border-emerald-200 dark:hover:border-emerald-700 transition-all duration-200 overflow-hidden group ${
    viewMode === 'list' ? 'flex items-stretch' : 'flex flex-col'
  }`}>
    <div className={`${viewMode === 'grid' ? 'h-1.5 w-full' : 'w-1.5 shrink-0'} ${p.purpose === 'Buy' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
    <div className="p-4 flex flex-col flex-1">
      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${p.purpose === 'Buy' ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400' : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400'}`}>For {p.purpose}</span>
        <SentimentBadge sentiment={p.sentiment} />
        {p.category && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400">
            {p.category}
          </span>
        )}
      </div>
      <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm leading-snug mb-0.5 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">{p.title}</h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">{'\u{1F4CD}'} {p.location}{p.city ? `, ${p.city}` : ''}</p>

      <p className="text-base font-extrabold text-emerald-600 dark:text-emerald-400 mb-2">{formatPrice(p.price, p.purpose, p.priceFormatted)}</p>

      <div className="flex flex-wrap gap-1.5 mb-2">
        {p.type && <span className="text-[10px] font-semibold px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-md">{p.type}</span>}
        {p.area > 0 && <span className="text-[10px] font-semibold px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-md">{p.area} {p.areaUnit}</span>}
        {p.subType && <span className="text-[10px] font-semibold px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-md">{p.subType}</span>}
      </div>

      {p.summary && (
        <div className="mb-2 px-3 py-2 bg-blue-50/70 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900/40">
          <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-0.5">{'\u{1F916}'} AI Summary</p>
          <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed line-clamp-2">{p.summary}</p>
        </div>
      )}

      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2 mb-3">{p.description}</p>

      <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-750 mt-auto">
        <div>
          {p.phone && <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">{'\u{1F4DE}'} {p.phone}</p>}
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{p.scrapedFrom}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-slate-400 dark:text-slate-550">{formatDate(p.scrapedAt)}</p>
          {p.intent && <p className="text-[10px] text-purple-500 dark:text-purple-400 mt-0.5 truncate max-w-[150px]">{'\u{1F3AF}'} {p.intent}</p>}
        </div>
      </div>
    </div>
  </div>
)

const Results = () => {
  const location = useLocation()
  const navigate = useNavigate()

  const initialFilters = location.state?.filters || DEFAULT_FILTERS

  const [filters, setFilters] = useState(initialFilters)
  const [committed, setCommitted] = useState(initialFilters)
  const [viewMode, setViewMode] = useState('grid')
  const [loading, setLoading] = useState(true)
  const [results, setResults] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
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

  const handleSearch = (newFilters) => {
    setCommitted(newFilters)
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 transition-colors">
      <header className="sticky top-0 z-30 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-750 cursor-pointer transition-colors shrink-0"
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
            {committed.city !== 'All Cities' && ` > ${committed.city}`}
            {committed.location && ` > ${committed.location}`}
          </h1>
          <span className="ml-auto text-[10px] font-bold px-2.5 py-1 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 rounded-lg border border-blue-100 dark:border-blue-900/50 shrink-0">
            {'\u{1F916}'} AI Powered
          </span>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 sm:p-5 shadow-sm mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 transition-colors">
          <div className="flex-1">
            <p className="text-[11px] font-bold text-slate-405 dark:text-slate-500 uppercase tracking-wide mb-1">Active Search Filters</p>
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-xs font-bold px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 rounded-lg border border-emerald-100 dark:border-emerald-900/50">
                For {committed.purpose}
              </span>
              <span className="text-xs font-bold px-2.5 py-1 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg border border-slate-200 dark:border-slate-600">
                {committed.city}
              </span>
              {committed.location && (
                <span className="text-xs font-bold px-2.5 py-1 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 rounded-lg border border-blue-100 dark:border-blue-900/50">
                  "{committed.location}"
                </span>
              )}
              {committed.propertyType !== 'All' && (
                <span className="text-xs font-bold px-2.5 py-1 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 rounded-lg border border-purple-100 dark:border-purple-900/50">
                  {committed.propertyType} {committed.propertySubType ? `(${committed.propertySubType})` : ''}
                </span>
              )}
              {(committed.priceMin || committed.priceMax) && (
                <span className="text-xs font-bold px-2.5 py-1 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 rounded-lg border border-amber-100 dark:border-amber-900/50">
                  {committed.priceMin || '0'} to {committed.priceMax || 'Max'}
                </span>
              )}
              {(committed.areaMin || committed.areaMax) && (
                <span className="text-xs font-bold px-2.5 py-1 bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-400 rounded-lg border border-cyan-100 dark:border-cyan-900/50">
                  {committed.areaMin || '0'} - {committed.areaMax || 'Max'} {committed.areaUnit}
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

        {error && (
          <div className="mb-4 rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 p-4 text-sm text-rose-700 dark:text-rose-300 flex items-center gap-3">
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            {error}
          </div>
        )}

        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-slate-600 dark:text-slate-350">
            Showing <span className="font-bold text-slate-900 dark:text-slate-100">{results.length}</span> properties
            {committed.city !== 'All Cities' && <span className="text-slate-500 dark:text-slate-400"> in {committed.city}</span>}
            {committed.location && <span className="text-slate-500 dark:text-slate-400"> near "{committed.location}"</span>}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={() => setViewMode('grid')} className={`p-2 rounded-lg border cursor-pointer transition-all ${viewMode === 'grid' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white dark:bg-slate-800 text-slate-450 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500'}`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
            </button>
            <button onClick={() => setViewMode('list')} className={`p-2 rounded-lg border cursor-pointer transition-all ${viewMode === 'list' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white dark:bg-slate-800 text-slate-450 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500'}`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : results.length === 0 ? (
          <div className="text-center py-20 transition-colors">
            <svg className="w-14 h-14 mx-auto text-slate-300 dark:text-slate-650 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p className="font-bold text-slate-600 dark:text-slate-350 text-base">No properties found</p>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">Try adjusting your filters and search again</p>
          </div>
        ) : (
          <div className={
            viewMode === 'grid'
              ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4'
              : 'flex flex-col gap-3'
          }>
            {results.map(p => (
              <PropertyCard key={p.id} p={p} viewMode={viewMode} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Results