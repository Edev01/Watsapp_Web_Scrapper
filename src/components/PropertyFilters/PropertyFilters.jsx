import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

// ─── All sub-components OUTSIDE main component (prevent remount on render) ───

const CITIES = ['All Cities', 'Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan', 'Peshawar', 'Quetta', 'Hyderabad', 'Sialkot']

const PROPERTY_TYPES = {
  'All': [],
  'House': ['Single Storey', 'Double Storey', 'Triple Storey', 'Bungalow', 'Villa', 'Farm House'],
  'Flat': ['Studio', '1 Bed', '2 Bed', '3 Bed', 'Penthouse', 'Lower Portion', 'Upper Portion'],
  'Plot': ['Residential Plot', 'Commercial Plot', 'Agricultural Land', 'Industrial Land'],
  'Commercial': ['Office', 'Shop', 'Warehouse', 'Factory', 'Building'],
  'Room': ['Furnished Room', 'Hostel', 'Bed Space'],
}

const AREA_UNITS = ['Marla', 'Kanal', 'Sq. Ft.', 'Sq. Yd.']
const CURRENCIES = ['PKR', 'USD', 'AED']
const SORT_OPTIONS = ['Newest First', 'Price: Low → High', 'Price: High → Low', 'Area: Small → Large', 'Area: Large → Small']
const POSSESSION = ['All', 'Ready', 'Under Construction', 'On Booking']
const FURNISHED = ['All', 'Furnished', 'Semi-Furnished', 'Unfurnished']

export const DEFAULT_FILTERS = {
  purpose: 'Buy',
  city: 'All Cities',
  location: '',
  propertyType: 'All',
  propertySubType: '',
  priceMin: '',
  priceMax: '',
  areaMin: '',
  areaMax: '',
  areaUnit: 'Marla',
  bedrooms: 'Any',
  bathrooms: 'Any',
  currency: 'PKR',
  sortBy: 'Newest First',
  verified: false,
  featured: false,
  possession: 'All',
  furnished: 'All',
}

// Helper components defined at MODULE level — never remounted
const Chip = ({ label, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer whitespace-nowrap ${
      active
        ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm'
        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-400'
    }`}
  >
    {label}
  </button>
)

const Label = ({ children }) => (
  <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">{children}</p>
)

const FieldInput = ({ value, onChange, placeholder, type = 'text' }) => (
  <input
    type={type}
    value={value}
    onChange={e => onChange(e.target.value)}
    placeholder={placeholder}
    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 transition-colors"
  />
)

const FieldSelect = ({ value, onChange, options }) => (
  <select
    value={value}
    onChange={e => onChange(e.target.value)}
    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent text-slate-800 dark:text-slate-100 cursor-pointer transition-colors"
  >
    {options.map(o => (
      <option key={o} value={o} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
        {o}
      </option>
    ))}
  </select>
)

const Toggle = ({ label, checked, onChange }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
      checked 
        ? 'bg-emerald-500 text-white border-emerald-500' 
        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-500'
    }`}
  >
    <span className={`w-3 h-3 rounded-full border-2 flex items-center justify-center shrink-0 ${checked ? 'bg-white border-white' : 'border-slate-300 dark:border-slate-600'}`}>
      {checked && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 block" />}
    </span>
    {label}
  </button>
)

// ─── Main Component ───────────────────────────────────────────────────────────

const PropertyFilters = ({ filters, setFilters, resultCount, onSearch }) => {
  const [showMore, setShowMore] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const set = (key, val) => setFilters(prev => ({ ...prev, [key]: val }))
  const reset = () => setFilters(DEFAULT_FILTERS)

  const subTypes = PROPERTY_TYPES[filters.propertyType] || []

  const activeFilterCount = Object.entries(filters).filter(([k, v]) => {
    return v !== DEFAULT_FILTERS[k] && v !== '' && v !== false
  }).length

  const handleSearch = () => {
    setMobileOpen(false)
    onSearch?.(filters)
  }

  const renderFilterBody = () => (
    <div className="space-y-5">
      {/* Main Search Bar Row */}
      <div className="flex gap-2 w-full">
        <div className="relative flex-1">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <svg className="w-5 h-5 text-slate-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </span>
          <input
            type="text"
            value={filters.location}
            onChange={e => set('location', e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                handleSearch()
              }
            }}
            placeholder="Search by Location / Area (e.g. Scheme 33, DHA Phase 6)..."
            className="w-full pl-11 pr-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 shadow-sm transition-all"
          />
        </div>
        <button
          type="button"
          onClick={handleSearch}
          className="px-6 sm:px-8 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-2xl font-bold text-sm hover:shadow-lg hover:shadow-emerald-500/20 active:scale-[0.98] transition-all cursor-pointer flex items-center gap-2 shrink-0"
        >
          <span>Find</span>
        </button>
      </div>

      {/* Row 1: Purpose + City + Sort By */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
        <div>
          <Label>Purpose</Label>
          <div className="flex rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 w-full transition-colors">
            {['Buy', 'Rent'].map(p => (
              <button
                type="button"
                key={p}
                onClick={() => set('purpose', p)}
                className={`flex-1 py-2 text-sm font-bold transition-all cursor-pointer ${
                  filters.purpose === p 
                    ? 'bg-emerald-500 text-white' 
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label>City</Label>
          <FieldSelect value={filters.city} onChange={v => set('city', v)} options={CITIES} />
        </div>
        <div>
          <Label>Sort By</Label>
          <FieldSelect value={filters.sortBy} onChange={v => set('sortBy', v)} options={SORT_OPTIONS} />
        </div>
      </div>

      {/* Property Type */}
      <div>
        <Label>Property Type</Label>
        <div className="flex flex-wrap gap-2">
          {Object.keys(PROPERTY_TYPES).map(t => (
            <Chip
              key={t}
              label={t}
              active={filters.propertyType === t}
              onClick={() => { set('propertyType', t); set('propertySubType', '') }}
            />
          ))}
        </div>
      </div>

      {/* Sub Type */}
      {subTypes.length > 0 && (
        <div>
          <Label>Property Sub Type</Label>
          <div className="flex flex-wrap gap-2">
            <Chip label="Any" active={!filters.propertySubType} onClick={() => set('propertySubType', '')} />
            {subTypes.map(s => (
              <Chip key={s} label={s} active={filters.propertySubType === s} onClick={() => set('propertySubType', s)} />
            ))}
          </div>
        </div>
      )}

      {/* Price */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <Label>Currency</Label>
          <FieldSelect value={filters.currency} onChange={v => set('currency', v)} options={CURRENCIES} />
        </div>
        <div>
          <Label>Price Min ({filters.currency})</Label>
          <FieldInput value={filters.priceMin} onChange={v => set('priceMin', v)} placeholder="Min price" type="number" />
        </div>
        <div>
          <Label>Price Max ({filters.currency})</Label>
          <FieldInput value={filters.priceMax} onChange={v => set('priceMax', v)} placeholder="Max price" type="number" />
        </div>
      </div>

      {/* Area */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <Label>Area Unit</Label>
          <FieldSelect value={filters.areaUnit} onChange={v => set('areaUnit', v)} options={AREA_UNITS} />
        </div>
        <div>
          <Label>Area Min ({filters.areaUnit})</Label>
          <FieldInput value={filters.areaMin} onChange={v => set('areaMin', v)} placeholder="Min area" type="number" />
        </div>
        <div>
          <Label>Area Max ({filters.areaUnit})</Label>
          <FieldInput value={filters.areaMax} onChange={v => set('areaMax', v)} placeholder="Max area" type="number" />
        </div>
      </div>

      {/* Beds + Baths */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Bedrooms</Label>
          <div className="flex flex-wrap gap-2">
            {['Any', '1', '2', '3', '4', '5', '6+'].map(b => (
              <Chip key={b} label={b} active={filters.bedrooms === b} onClick={() => set('bedrooms', b)} />
            ))}
          </div>
        </div>
        <div>
          <Label>Bathrooms</Label>
          <div className="flex flex-wrap gap-2">
            {['Any', '1', '2', '3', '4+'].map(b => (
              <Chip key={b} label={b} active={filters.bathrooms === b} onClick={() => set('bathrooms', b)} />
            ))}
          </div>
        </div>
      </div>

      {/* Toggles */}
      <div>
        <Label>Listing Status</Label>
        <div className="flex flex-wrap gap-2">
          <Toggle label="✓ Verified Only" checked={filters.verified} onChange={v => set('verified', v)} />
          <Toggle label="⭐ Featured / Premium" checked={filters.featured} onChange={v => set('featured', v)} />
        </div>
      </div>

      {/* More Options */}
      <button
        type="button"
        onClick={() => setShowMore(p => !p)}
        className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 hover:text-emerald-500 cursor-pointer"
      >
        <svg className={`w-4 h-4 transition-transform ${showMore ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
        {showMore ? 'Hide' : 'More'} Options
      </button>

      {showMore && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-700/60">
          <div>
            <Label>Possession Status</Label>
            <div className="flex flex-wrap gap-2">
              {POSSESSION.map(p => (
                <Chip key={p} label={p} active={filters.possession === p} onClick={() => set('possession', p)} />
              ))}
            </div>
          </div>
          <div>
            <Label>Furnishing</Label>
            <div className="flex flex-wrap gap-2">
              {FURNISHED.map(f => (
                <Chip key={f} label={f} active={filters.furnished === f} onClick={() => set('furnished', f)} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Footer: Reset + Search */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-700/60">
        <button
          type="button"
          onClick={reset}
          className="text-xs text-rose-500 font-bold hover:text-rose-600 cursor-pointer"
        >
          ✕ Clear Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
        </button>

        <button
          type="button"
          onClick={handleSearch}
          className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-bold text-sm hover:shadow-lg hover:shadow-emerald-500/20 active:scale-[0.98] transition-all cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          Search Properties
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop */}
      <div className="hidden md:block bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm mb-5 transition-colors">
        {renderFilterBody()}
      </div>

      {/* Mobile Filter Button */}
      <div className="md:hidden mb-4">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="w-full flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm cursor-pointer transition-colors"
        >
          <span className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Filters
            {activeFilterCount > 0 && (
              <span className="bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{activeFilterCount}</span>
            )}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">{resultCount} results</span>
        </button>
      </div>

      {/* Mobile Sheet */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex items-end">
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="relative z-50 w-full bg-white dark:bg-slate-800 rounded-t-2xl max-h-[92vh] overflow-y-auto p-5 shadow-xl transition-colors">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-black text-slate-900 dark:text-slate-100 text-base">Filter Properties</h3>
              <button type="button" onClick={() => setMobileOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer">
                <svg className="w-5 h-5 text-slate-500 dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {renderFilterBody()}
          </div>
        </div>
      )}
    </>
  )
}

export default PropertyFilters
