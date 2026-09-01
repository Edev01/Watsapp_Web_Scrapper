import { useEffect, useState } from 'react'
import { propertyApi } from '../../api'

const CITIES = ['All Cities', 'Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan', 'Peshawar', 'Quetta', 'Hyderabad', 'Sialkot']

const PROPERTY_TYPES = {
  All: [],
  House: ['Standard', 'Single Storey', 'Double Storey', 'Triple Storey', 'Bungalow', 'Villa', 'Farm House'],
  Flat: ['Standard', 'Studio', '1 Bed', '2 Bed', '3 Bed', 'Penthouse', 'Lower Portion', 'Upper Portion'],
  Plot: ['Standard', 'Residential Plot', 'Commercial Plot', 'Agricultural Land', 'Industrial Land'],
  Commercial: ['Standard', 'Shop', 'Office', 'Warehouse', 'Factory', 'Building'],
}

const AREA_UNITS = ['All', 'Marla', 'Kanal', 'Sq. Ft.', 'Sq. Yd.']
const FALLBACK_STATUSES = ['AVAILABLE', 'SOLD', 'RENTED', 'RESERVED', 'WITHDRAWN', 'ON_HOLD']

export const formatPriceRangeLabel = (val) => {
  if (!val || val === '0' || val === 0) return '0'
  const num = Number(val)
  if (num >= 10000000) return `${(num / 10000000).toFixed(1).replace(/\.0$/, '')} Cr`
  if (num >= 100000) return `${(num / 100000).toFixed(0)} Lac`
  return num.toLocaleString()
}

export const DEFAULT_FILTERS = {
  purpose: 'All', city: 'All Cities', status: 'AVAILABLE', location: '', propertyType: 'All', propertySubType: '',
  priceMin: '', priceMax: '', areaMin: '', areaMax: '', areaUnit: 'All', sortBy: 'Newest First',
}

const SearchIcon = ({ className = 'h-5 w-5' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" />
  </svg>
)

const LocationIcon = () => (
  <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s7-6.1 7-12A7 7 0 1 0 5 9c0 5.9 7 12 7 12Z" />
    <circle cx="12" cy="9" r="2.2" />
  </svg>
)

const SectionIcon = ({ type }) => {
  const paths = {
    purpose: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /></>,
    city: <><path strokeLinecap="round" strokeLinejoin="round" d="M4 21h16M6 21V6h7v15m0-11h5v11M9 9h1m-1 3h1m-1 3h1m6-2h1m-1 3h1" /></>,
    status: <><path strokeLinecap="round" strokeLinejoin="round" d="M12 3 5 6v5c0 4.6 2.8 8.7 7 10 4.2-1.3 7-5.4 7-10V6l-7-3Z" /><path strokeLinecap="round" strokeLinejoin="round" d="m9 12 2 2 4-5" /></>,
    price: <><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" strokeLinejoin="round" d="M15.5 8.5h-7m0 3h5.2m-5.2-3c4.8 0 4.8 6.5 0 6.5l5 3" /></>,
    property: <><path strokeLinecap="round" strokeLinejoin="round" d="M4 21h16M6 21V7l7-3v17m0-11h5v11M9 9h1m-1 3h1m-1 3h1m6-1h1m-1 3h1" /></>,
    subtype: <><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v5m-6 4v-2h12v2M6 13v3m6-3v3m6-3v3" /><rect x="3" y="16" width="6" height="4" rx="1" /><rect x="9" y="16" width="6" height="4" rx="1" /><rect x="15" y="16" width="6" height="4" rx="1" /></>,
    area: <><path strokeLinecap="round" strokeLinejoin="round" d="M5 4H3v5m16-5h2v5M5 20H3v-5m16 5h2v-5M8 8h8v8H8z" /><path strokeLinecap="round" strokeLinejoin="round" d="m8 8-2-2m10 2 2-2m-10 10-2 2m10-2 2 2" /></>,
  }
  return <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">{paths[type]}</svg>
}

const SectionTitle = ({ icon, children, accessory }) => (
  <div className="mb-4 flex items-center justify-between gap-3">
    <div className="flex items-center gap-3 text-slate-900 dark:text-slate-100">
      <span className="text-slate-700 dark:text-slate-300"><SectionIcon type={icon} /></span>
      <h2 className="text-sm font-bold sm:text-base">{children}</h2>
    </div>
    {accessory}
  </div>
)

const Panel = ({ children, className = '' }) => (
  <section className={`rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_2px_10px_rgba(15,23,42,0.035)] dark:border-slate-700 dark:bg-slate-800 sm:p-5 ${className}`}>
    {children}
  </section>
)

const Chip = ({ label, active, onClick, className = '' }) => (
  <button type="button" onClick={onClick} aria-pressed={active} className={`min-h-9 whitespace-nowrap rounded-xl border px-4 py-2 text-xs font-semibold transition-all sm:text-sm ${active ? 'border-emerald-500 bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-sm shadow-emerald-500/15' : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-emerald-600 dark:hover:text-emerald-400'} ${className}`}>
    {label}
  </button>
)

const FieldSelect = ({ value, onChange, options, ariaLabel, disabled = false, formatOption = (option) => option }) => (
  <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={ariaLabel} disabled={disabled} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
    {options.map((option) => <option key={option} value={option}>{formatOption(option)}</option>)}
  </select>
)

const AreaInput = ({ value, onChange, placeholder, suffix }) => (
  <div className="relative">
    <input type="number" min="0" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 pr-16 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500" />
    <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-xs font-bold text-slate-700 dark:text-slate-300">{suffix}</span>
  </div>
)

const PropertyFilters = ({ filters, setFilters, resultCount, onSearch }) => {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [statusOptions, setStatusOptions] = useState(FALLBACK_STATUSES)
  const [statusesLoading, setStatusesLoading] = useState(true)
  const set = (key, value) => setFilters((previous) => ({ ...previous, [key]: value }))
  const setMany = (values) => setFilters((previous) => ({ ...previous, ...values }))
  const reset = () => setFilters({ ...DEFAULT_FILTERS })
  const subTypes = PROPERTY_TYPES[filters.propertyType] || []
  const activeFilterCount = Object.entries(filters).filter(([key, value]) => value !== DEFAULT_FILTERS[key] && value !== '' && value !== false).length

  useEffect(() => {
    let active = true

    propertyApi.getStatuses()
      .then((response) => {
        const statuses = response?.data?.statuses || response?.statuses
        if (active && Array.isArray(statuses) && statuses.length > 0) {
          setStatusOptions([...new Set(statuses.map((status) => String(status).trim().toUpperCase()).filter(Boolean))])
        }
      })
      .catch((error) => {
        console.warn('Unable to load property statuses; using fallback options.', error.message)
      })
      .finally(() => {
        if (active) setStatusesLoading(false)
      })

    return () => { active = false }
  }, [])

  const handleSearch = () => {
    setMobileOpen(false)
    onSearch?.(filters)
  }

  const renderFilterBody = () => {
    const maxLimit = 500000000
    const isAboveLimit = Number(filters.priceMin) === maxLimit && !filters.priceMax
    const isAllPrice = !filters.priceMax && !filters.priceMin
    const currentPrice = filters.priceMax ? Number(filters.priceMax) : maxLimit
    const pricePercentage = Math.min(100, Math.max(0, (currentPrice / maxLimit) * 100))
    const pricePresets = [
      { label: 'All', priceMin: '', priceMax: '' },
      { label: '< 50 Lac', priceMin: '', priceMax: '5000000' },
      { label: '< 1 Cr', priceMin: '', priceMax: '10000000' },
      { label: '< 5 Cr', priceMin: '', priceMax: '50000000' },
      { label: '< 10 Cr', priceMin: '', priceMax: '100000000' },
      { label: '< 25 Cr', priceMin: '', priceMax: '250000000' },
      { label: '< 50 Cr', priceMin: '', priceMax: '500000000' },
      { label: '> 50 Cr', priceMin: '500000000', priceMax: '' },
    ]
    const priceBadge = isAllPrice ? 'All (Any Price)' : isAboveLimit ? 'PKR 50 Cr+' : filters.priceMin && filters.priceMax ? `PKR ${formatPriceRangeLabel(filters.priceMin)} — ${formatPriceRangeLabel(filters.priceMax)}` : `PKR 0 — ${formatPriceRangeLabel(currentPrice)}`

    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row">
          <label className="flex min-h-[72px] flex-1 items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 shadow-sm transition focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-400/15 dark:border-slate-700 dark:bg-slate-800">
            <span className="shrink-0 text-slate-700 dark:text-slate-300"><LocationIcon /></span>
            <span className="min-w-0 flex-1">
              <span className="mb-0.5 block text-xs font-semibold text-slate-700 dark:text-slate-200 sm:text-sm">Search by Location / Area</span>
              <input type="text" value={filters.location} onChange={(event) => set('location', event.target.value)} onKeyDown={(event) => event.key === 'Enter' && handleSearch()} placeholder="e.g. Scheme 33, DHA Phase 6, Bahria Town Karachi" className="block w-full border-0 bg-transparent p-0 text-xs text-slate-500 outline-none placeholder:text-slate-400 dark:text-slate-400 dark:placeholder:text-slate-500 sm:text-sm" />
            </span>
          </label>
          <button type="button" onClick={handleSearch} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-9 text-sm font-bold text-white shadow-md shadow-emerald-500/15 transition hover:shadow-lg hover:shadow-emerald-500/20 active:scale-[0.98] lg:min-h-[54px] lg:self-center">
            <SearchIcon /> Search
          </button>
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-xs leading-5 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
          <span className="text-base" aria-hidden="true">✨</span>
          <p className="flex-1"><strong>AI Smart Engine:</strong> Automatically parses Pakistani property prices (Lac &amp; Crore), detects locations, and categorizes listings from WhatsApp messages.</p>
          <span className="hidden text-base sm:block" aria-hidden="true">✨</span>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[0.9fr_1fr_0.8fr]">
          <Panel>
            <SectionTitle icon="purpose">Purpose</SectionTitle>
            <div className="grid grid-cols-3 gap-3">
              {['All', 'Buy', 'Rent'].map((purpose) => <Chip key={purpose} label={purpose} active={filters.purpose === purpose} onClick={() => set('purpose', purpose)} className="w-full" />)}
            </div>
          </Panel>
          <Panel>
            <SectionTitle icon="city">City</SectionTitle>
            <FieldSelect value={filters.city} onChange={(value) => set('city', value)} options={CITIES} ariaLabel="City" />
          </Panel>
          <Panel>
            <SectionTitle icon="status" accessory={statusesLoading ? <span className="text-[10px] font-semibold text-slate-400">Loading…</span> : null}>Listing Status</SectionTitle>
            <FieldSelect
              value={filters.status || 'AVAILABLE'}
              onChange={(value) => set('status', value)}
              options={statusOptions}
              ariaLabel="Listing status"
              disabled={statusesLoading}
              formatOption={(status) => status.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())}
            />
          </Panel>
        </div>

        <Panel>
          <SectionTitle icon="price" accessory={<span className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300 sm:text-xs">{priceBadge}</span>}>Price Range (PKR)</SectionTitle>
          <div className="relative mb-5 flex h-5 items-center px-1">
            <div className="absolute left-1 right-1 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500" style={{ width: isAboveLimit ? '100%' : `${pricePercentage}%` }} />
            </div>
            <input type="range" min="0" max={maxLimit} step="1000000" value={currentPrice} aria-label="Maximum property price" onChange={(event) => { const value = Number(event.target.value); setMany({ priceMin: '', priceMax: value >= maxLimit ? '' : String(value) }) }} className="absolute inset-x-0 z-20 h-5 w-full cursor-pointer opacity-0" />
            <span className="pointer-events-none absolute top-1/2 z-10 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[3px] border-emerald-500 bg-white shadow-sm dark:bg-slate-800" style={{ left: isAllPrice || isAboveLimit ? '100%' : `${pricePercentage}%` }}><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /></span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
            {pricePresets.map((preset) => <Chip key={preset.label} label={preset.label} active={filters.priceMin === preset.priceMin && filters.priceMax === preset.priceMax} onClick={() => setMany({ priceMin: preset.priceMin, priceMax: preset.priceMax })} className="w-full px-2" />)}
          </div>
        </Panel>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.82fr_1.18fr]">
          <Panel>
            <SectionTitle icon="property">Property Type</SectionTitle>
            <div className="flex flex-wrap gap-2.5">
              {Object.keys(PROPERTY_TYPES).map((type) => <Chip key={type} label={type} active={filters.propertyType === type} onClick={() => setMany({ propertyType: type, propertySubType: '' })} />)}
            </div>
          </Panel>
          <Panel>
            <SectionTitle icon="subtype">Property Sub Type</SectionTitle>
            <div className="flex flex-wrap gap-2.5">
              <Chip label="Any" active={!filters.propertySubType} onClick={() => set('propertySubType', '')} />
              {subTypes.slice(0, 5).map((subType) => <Chip key={subType} label={subType} active={filters.propertySubType === subType} onClick={() => set('propertySubType', subType)} />)}
              {subTypes.length > 5 && (
                <select value={subTypes.slice(5).includes(filters.propertySubType) ? filters.propertySubType : ''} onChange={(event) => set('propertySubType', event.target.value)} aria-label="More property sub types" className="min-h-9 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 outline-none hover:border-emerald-300 focus:border-emerald-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 sm:text-sm">
                  <option value="">More</option>
                  {subTypes.slice(5).map((subType) => <option key={subType} value={subType}>{subType}</option>)}
                </select>
              )}
            </div>
          </Panel>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Panel><SectionTitle icon="area">Area Unit</SectionTitle><FieldSelect value={filters.areaUnit || 'All'} onChange={(value) => set('areaUnit', value)} options={AREA_UNITS} ariaLabel="Area unit" /></Panel>
          <Panel><SectionTitle icon="area">Area Min ({filters.areaUnit && filters.areaUnit !== 'All' ? filters.areaUnit : 'All'})</SectionTitle><AreaInput value={filters.areaMin} onChange={(value) => set('areaMin', value)} placeholder="Min area" suffix={filters.areaUnit === 'All' ? 'sq ft' : filters.areaUnit} /></Panel>
          <Panel><SectionTitle icon="area">Area Max ({filters.areaUnit && filters.areaUnit !== 'All' ? filters.areaUnit : 'All'})</SectionTitle><AreaInput value={filters.areaMax} onChange={(value) => set('areaMax', value)} placeholder="Max area" suffix={filters.areaUnit === 'All' ? 'sq ft' : filters.areaUnit} /></Panel>
        </div>

        <div className="flex flex-col-reverse items-stretch justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-700/70 sm:flex-row sm:items-center">
          <button type="button" onClick={reset} className="inline-flex items-center justify-center gap-2 px-2 py-2 text-xs font-bold text-rose-500 transition hover:text-rose-600 sm:justify-start">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16m-10 4v6m4-6v6M9 7l1-3h4l1 3m-9 0 1 14h10l1-14" /></svg>
            Clear All Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
          </button>
          <button type="button" onClick={handleSearch} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-10 text-sm font-bold text-white shadow-md shadow-emerald-500/15 transition hover:shadow-lg hover:shadow-emerald-500/20 active:scale-[0.98] sm:min-w-64"><SearchIcon /> Search Properties</button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="mb-5 hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-colors dark:border-slate-700 dark:bg-slate-800 md:block">{renderFilterBody()}</div>
      <div className="mb-4 md:hidden">
        <button type="button" onClick={() => setMobileOpen(true)} className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <span className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200"><svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18l-7 8v6l-4 2v-8L3 4Z" /></svg>Search Filters{activeFilterCount > 0 && <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] text-white">{activeFilterCount}</span>}</span>
          {resultCount !== null && resultCount !== undefined && <span className="text-xs text-slate-500 dark:text-slate-400">{resultCount} results</span>}
        </button>
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex items-end md:hidden">
          <button type="button" aria-label="Close filters" className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="relative z-10 max-h-[94vh] w-full overflow-y-auto rounded-t-3xl bg-slate-50 p-4 shadow-2xl dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between px-1"><h2 className="text-base font-black text-slate-900 dark:text-white">Search Properties</h2><button type="button" onClick={() => setMobileOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800" aria-label="Close filters"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" /></svg></button></div>
            {renderFilterBody()}
          </div>
        </div>
      )}
    </>
  )
}

export default PropertyFilters
