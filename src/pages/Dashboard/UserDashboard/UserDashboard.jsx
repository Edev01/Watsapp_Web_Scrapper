import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../../../components/Sidebar/Sidebar'
import PropertyFilters, { DEFAULT_FILTERS } from '../../../components/PropertyFilters/PropertyFilters'
import QRConnect from '../../../components/QRConnect/QRConnect'

const USER_NAV = [
  { id: 'search', label: 'Search Properties', icon: 'home' },
  { id: 'connect', label: 'WhatsApp Connect', icon: 'qr' },
  { id: 'saved', label: 'Saved Listings', icon: 'heart' },
]

const UserDashboard = ({ user, onSignOut }) => {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('search')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [filters, setFilters] = useState(DEFAULT_FILTERS)

  const handleSearch = (appliedFilters) => {
    navigate('/results', { state: { filters: appliedFilters } })
  }

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden">
      <Sidebar
        user={user}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onSignOut={onSignOut}
        navItems={USER_NAV}
        isAdmin={false}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200 sticky top-0 z-30">
          <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg hover:bg-slate-100 cursor-pointer">
            <svg className="w-5 h-5 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="font-bold text-slate-900 text-sm">{USER_NAV.find(n => n.id === activeTab)?.label}</span>
        </header>
        <main className="flex-1 overflow-y-auto">
          {activeTab === 'search' && (
            <div className="p-4 sm:p-6 max-w-4xl mx-auto">
              <div className="mb-5">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900">Search Properties</h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Set your filters and click Search to view results</p>
              </div>
              <PropertyFilters
                filters={filters}
                setFilters={setFilters}
                resultCount={null}
                onSearch={handleSearch}
              />
            </div>
          )}
          {activeTab === 'connect' && <QRConnect />}
          {activeTab === 'saved' && (
            <div className="p-6 text-center mt-16">
              <svg className="w-12 h-12 mx-auto text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              <p className="font-bold text-slate-600">No saved listings yet</p>
              <p className="text-sm text-slate-400 mt-1">Click the heart icon on any property to save it</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default UserDashboard
