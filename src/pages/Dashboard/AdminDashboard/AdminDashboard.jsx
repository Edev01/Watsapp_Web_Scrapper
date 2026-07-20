import { useState, useEffect, useRef } from 'react'
import Sidebar from '../../../components/Sidebar/Sidebar'
import QRConnect from '../../../components/QRConnect/QRConnect'
import PropertyListings from '../../../components/PropertyListings/PropertyListings'

// Admin nav items
const ADMIN_NAV = [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'connect', label: 'WhatsApp Connect', icon: 'qr' },
  { id: 'listings', label: 'All Listings', icon: 'home' },
  { id: 'users', label: 'Users', icon: 'users' },
  { id: 'createUser', label: 'Create User', icon: 'userPlus' },
]

const StatCard = ({ label, value, sub, color }) => (
  <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
    <p className={`text-2xl font-extrabold ${color || 'text-slate-900'}`}>{value}</p>
    {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
  </div>
)

const getRelativeTime = (isoString) => {
  if (!isoString) return 'N/A'
  const joined = new Date(isoString)
  const now = new Date()
  const diffMs = now - joined
  const diffMins = Math.floor(diffMs / 60000)
  const diffHrs = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHrs / 24)

  if (diffMins < 60) {
    return `${diffMins || 1} min ago`
  } else if (diffHrs < 24) {
    return `${diffHrs} hr ago`
  } else {
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
  }
}

const getGraphData = (users, timeframe) => {
  const now = new Date()
  let data = []

  if (timeframe === 'week') {
    // Last 7 days, ending today
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(now.getDate() - i)
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' })
      const dateString = d.toDateString()
      
      const count = users.filter(u => {
        if (!u.joinedAt) return false
        const joinedDate = new Date(u.joinedAt)
        return joinedDate.toDateString() === dateString
      }).length

      data.push({ 
        label: dayName, 
        value: count, 
        fullLabel: d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) 
      })
    }
  } else if (timeframe === 'month') {
    // Last 30 days, grouped into 6 intervals of 5 days each
    for (let i = 5; i >= 0; i--) {
      const start = new Date()
      start.setDate(now.getDate() - (i * 5 + 4))
      const end = new Date()
      end.setDate(now.getDate() - (i * 5))
      
      const label = `${start.toLocaleDateString('en-US', { day: 'numeric' })}-${end.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`
      
      start.setHours(0,0,0,0)
      end.setHours(23,59,59,999)
      
      const count = users.filter(u => {
        if (!u.joinedAt) return false
        const joinedDate = new Date(u.joinedAt)
        return joinedDate >= start && joinedDate <= end
      }).length

      const startStr = start.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
      const endStr = end.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })

      data.push({ 
        label: label, 
        value: count, 
        fullLabel: `${startStr} - ${endStr}` 
      })
    }
  } else if (timeframe === 'sixMonths') {
    // Last 6 months
    for (let i = 5; i >= 0; i--) {
      const d = new Date()
      d.setMonth(now.getMonth() - i)
      const monthName = d.toLocaleDateString('en-US', { month: 'short' })
      const year = d.getFullYear()
      const monthIndex = d.getMonth()

      const count = users.filter(u => {
        if (!u.joinedAt) return false
        const joinedDate = new Date(u.joinedAt)
        return joinedDate.getMonth() === monthIndex && joinedDate.getFullYear() === year
      }).length

      data.push({ 
        label: monthName, 
        value: count, 
        fullLabel: `${d.toLocaleDateString('en-US', { month: 'long' })} ${year}` 
      })
    }
  }

  return data
}

const UsersOnboardingChart = ({ users = [] }) => {
  const [timeframe, setTimeframe] = useState('week')
  const [hoveredIdx, setHoveredIdx] = useState(null)
  const [width, setWidth] = useState(500)
  const containerRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current) return

    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        if (entry.contentRect.width) {
          setWidth(entry.contentRect.width)
        }
      }
    })

    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  const data = getGraphData(users, timeframe)
  
  const height = 220
  const paddingLeft = 40
  const paddingRight = 20
  const paddingTop = 20
  const paddingBottom = 30

  const maxVal = Math.max(...data.map(d => d.value), 4)
  const gridLinesCount = 4

  // Map data to SVG points
  const points = data.map((d, i) => {
    const x = paddingLeft + (i / (data.length - 1 || 1)) * (width - paddingLeft - paddingRight)
    const y = height - paddingBottom - (d.value / maxVal) * (height - paddingTop - paddingBottom)
    return { x, y, label: d.label, value: d.value, fullLabel: d.fullLabel }
  })

  // Generate line path d attribute
  const linePath = points.length > 0 
    ? `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')
    : ''

  // Generate gradient area path d attribute
  const yBottom = height - paddingBottom
  const areaPath = points.length > 0
    ? `${linePath} L ${points[points.length - 1].x} ${yBottom} L ${points[0].x} ${yBottom} Z`
    : ''

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-extrabold text-slate-900 text-sm">Users Onboarding</h3>
          <p className="text-[10px] text-slate-400 mt-0.5">Registration trends over time</p>
        </div>
        <div className="relative">
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value)}
            className="appearance-none pl-3 pr-8 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-100 rounded-xl outline-none cursor-pointer transition-colors"
          >
            <option value="week">Last Week</option>
            <option value="month">Last Month</option>
            <option value="sixMonths">Last 6 Months</option>
          </select>
          <span className="absolute inset-y-0 right-0 flex items-center pr-2.5 pointer-events-none text-emerald-600">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </div>
      </div>

      <div ref={containerRef} className="relative w-full h-[220px]">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
          <defs>
            <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.00" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {Array.from({ length: gridLinesCount }).map((_, idx) => {
            const val = (maxVal / (gridLinesCount - 1)) * idx
            const y = height - paddingBottom - (val / maxVal) * (height - paddingTop - paddingBottom)
            return (
              <g key={idx}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeWidth={1}
                  strokeDasharray="4 4"
                />
                <text
                  x={paddingLeft - 10}
                  y={y + 3}
                  textAnchor="end"
                  className="text-[9px] fill-slate-400 font-bold"
                >
                  {Math.round(val)}
                </text>
              </g>
            )
          })}

          {/* Gradient area */}
          {areaPath && (
            <path d={areaPath} fill="url(#chartGrad)" />
          )}

          {/* Path line */}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke="#10b981"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Vertical dashed line and active dot on hover */}
          {hoveredIdx !== null && points[hoveredIdx] && (
            <g>
              <line
                x1={points[hoveredIdx].x}
                y1={paddingTop}
                x2={points[hoveredIdx].x}
                y2={height - paddingBottom}
                stroke="#10b981"
                strokeWidth={1.5}
                strokeDasharray="3 3"
              />
              <circle
                cx={points[hoveredIdx].x}
                cy={points[hoveredIdx].y}
                r={4.5}
                fill="#ffffff"
                stroke="#10b981"
                strokeWidth={2.5}
              />
            </g>
          )}

          {/* Invisible interactive vertical columns for full-area hover */}
          {points.map((p, i) => {
            const columnWidth = (width - paddingLeft - paddingRight) / (points.length - 1 || 1)
            const xStart = p.x - columnWidth / 2
            return (
              <rect
                key={`hover-${i}`}
                x={xStart}
                y={paddingTop}
                width={columnWidth}
                height={height - paddingTop - paddingBottom}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              />
            )
          })}

          {/* X-axis labels */}
          {points.map((p, i) => (
            <text
              key={i}
              x={p.x}
              y={height - 8}
              textAnchor="middle"
              className="text-[9px] fill-slate-400 font-bold"
            >
              {p.label}
            </text>
          ))}
        </svg>

        {/* Custom Tooltip */}
        {hoveredIdx !== null && points[hoveredIdx] && (
          <div
            className="absolute bg-slate-900 text-white text-[10px] rounded-lg p-2 shadow-lg pointer-events-none transition-all duration-75 z-20 border border-slate-800 whitespace-nowrap"
            style={{
              left: `${(points[hoveredIdx].x / width) * 100}%`,
              top: `${(points[hoveredIdx].y / height) * 100 - 10}%`,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <p className="font-bold border-b border-slate-700 pb-0.5 mb-0.5">{points[hoveredIdx].fullLabel}</p>
            <p className="text-emerald-400 font-extrabold text-[10px] leading-tight">users: {points[hoveredIdx].value}</p>
          </div>
        )}
      </div>
    </div>
  )
}

const AdminOverview = ({ users = [] }) => {
  const totalUsers = users.length
  const recentUsers = [...users]
    .sort((a, b) => new Date(b.joinedAt) - new Date(a.joinedAt))
    .slice(0, 4)

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-slate-900">Admin Overview</h1>
        <p className="text-sm text-slate-500 mt-0.5">Platform statistics and management</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Listings" value="1,284" sub="+48 today" color="text-emerald-600" />
        <StatCard label="Total Users" value={totalUsers} sub="Registered users" color="text-blue-600" />
        <StatCard label="Scraped Today" value="892" sub="From 12 groups" color="text-purple-600" />
        <StatCard label="WhatsApp Groups" value="12" sub="All connected" color="text-amber-600" />
      </div>

      {/* Users Onboarding Chart */}
      <div className="mb-6">
        <UsersOnboardingChart users={users} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Activity */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h3 className="font-bold text-slate-900 mb-4 text-sm">Recent Scrape Activity</h3>
          <div className="space-y-3">
            {[
              { group: 'Scheme 33 Properties', count: 48, time: '5 min ago', status: 'success' },
              { group: 'Karachi Real Estate', count: 126, time: '22 min ago', status: 'success' },
              { group: 'DHA Karachi Deals', count: 34, time: '1 hr ago', status: 'success' },
              { group: 'Gulshan Property Hub', count: 71, time: '2 hr ago', status: 'warning' },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                <div>
                  <p className="text-xs font-semibold text-slate-800">{item.group}</p>
                  <p className="text-[10px] text-slate-400">{item.count} listings · {item.time}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  item.status === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                }`}>
                  {item.status === 'success' ? 'OK' : 'Slow'}
                </span>
              </div>
            ))}
          </div>
        </div>
        {/* Recent Users */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h3 className="font-bold text-slate-900 mb-4 text-sm">Recent Users</h3>
          <div className="space-y-3">
            {recentUsers.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <p className="text-xs font-medium">No recent users</p>
              </div>
            ) : (
              recentUsers.map((u, i) => (
                <div key={i} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                  <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center shrink-0">
                    {u.fullName?.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800 truncate">{u.fullName}</p>
                    <p className="text-[10px] text-slate-400 truncate">{u.email}</p>
                  </div>
                  <p className="text-[10px] text-slate-400 shrink-0">{getRelativeTime(u.joinedAt)}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const AdminUsersPanel = ({ users = [] }) => {
  const [searchTerm, setSearchTerm] = useState('')

  const filteredUsers = users.filter(u => 
    u.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const formatJoinDate = (iso) => {
    if (!iso) return 'N/A'
    return new Date(iso).toLocaleDateString('en-PK', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Users Management</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Total Registered Users: <span className="font-bold text-slate-800">{users.length}</span>
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </span>
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search users by name/email..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent text-slate-800 placeholder-slate-400"
          />
        </div>
      </div>

      {filteredUsers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 shadow-sm">
          <svg className="w-10 h-10 mx-auto text-slate-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          <p className="font-semibold text-sm">No registered users found</p>
          <p className="text-xs mt-1">Users will appear here once they sign up.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">User</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Email Address</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Joined Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((u, i) => (
                  <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-700 text-xs font-bold flex items-center justify-center">
                          {u.fullName.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-xs font-bold text-slate-800">{u.fullName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-600 font-mono">{u.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                        {u.role || 'user'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-400">{formatJoinDate(u.joinedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

const AdminCreateUserPanel = ({ setToast }) => {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    role: 'user'
  })
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState({})
  const [isLoading, setIsLoading] = useState(false)

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }))
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const newErrors = {}

    if (!formData.fullName.trim()) {
      newErrors.fullName = 'Full name is required'
    }

    if (!formData.email) {
      newErrors.email = 'Email is required'
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Invalid email address'
    }

    if (!formData.password) {
      newErrors.password = 'Password is required'
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      if (setToast) {
        setToast({ type: 'error', message: 'Please fix the errors in the form' })
      }
      return
    }

    setIsLoading(true)

    setTimeout(() => {
      // Read existing users
      const stored = localStorage.getItem('registeredUsers')
      const users = stored ? JSON.parse(stored) : []

      // Check if email already exists
      const emailExists = users.some(u => u.email.toLowerCase() === formData.email.toLowerCase())
      const isAdminEmail = formData.email.toLowerCase() === 'se.zeeshanhaider@gmail.com'

      if (emailExists || isAdminEmail) {
        setIsLoading(false)
        setErrors({ email: 'A user with this email already exists' })
        if (setToast) {
          setToast({ type: 'error', message: 'Email address already registered' })
        }
        return
      }

      // Add new user
      const newUser = {
        fullName: formData.fullName,
        email: formData.email,
        password: formData.password,
        role: formData.role,
        joinedAt: new Date().toISOString()
      }

      users.push(newUser)
      localStorage.setItem('registeredUsers', JSON.stringify(users))

      setIsLoading(false)
      if (setToast) {
        setToast({ type: 'success', message: `User ${formData.fullName} created successfully! 🎉` })
      }

      // Reset form
      setFormData({
        fullName: '',
        email: '',
        password: '',
        role: 'user'
      })
    }, 1000)
  }

  return (
    <div className="p-6 max-w-xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-slate-900">Create User</h1>
        <p className="text-sm text-slate-500 mt-0.5">Register a new user or administrator on the platform</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-5 text-left">
          {/* Full Name */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Full Name</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </span>
              <input
                type="text"
                name="fullName"
                value={formData.fullName}
                onChange={handleChange}
                className={`w-full pl-11 pr-4 py-2.5 rounded-xl border focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm transition-all text-slate-900 bg-white ${
                  errors.fullName ? 'border-rose-500 ring-rose-500/20' : 'border-slate-200'
                }`}
                placeholder="Enter full name"
              />
            </div>
            {errors.fullName && (
              <p className="text-xs text-rose-500 font-medium mt-1.5 flex items-center gap-1">
                <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {errors.fullName}
              </p>
            )}
          </div>

          {/* Email Address */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Email Address</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.206" />
                </svg>
              </span>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className={`w-full pl-11 pr-4 py-2.5 rounded-xl border focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm transition-all text-slate-900 bg-white ${
                  errors.email ? 'border-rose-500 ring-rose-500/20' : 'border-slate-200'
                }`}
                placeholder="Enter email address"
              />
            </div>
            {errors.email && (
              <p className="text-xs text-rose-500 font-medium mt-1.5 flex items-center gap-1">
                <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {errors.email}
              </p>
            )}
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Password</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </span>
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={formData.password}
                onChange={handleChange}
                className={`w-full pl-11 pr-11 py-2.5 rounded-xl border focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm transition-all text-slate-900 bg-white ${
                  errors.password ? 'border-rose-500 ring-rose-500/20' : 'border-slate-200'
                }`}
                placeholder="Enter password (min 6 chars)"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 01-1.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
            {errors.password && (
              <p className="text-xs text-rose-500 font-medium mt-1.5 flex items-center gap-1">
                <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {errors.password}
              </p>
            )}
          </div>

          {/* User Role */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2.5">User Role</label>
            <div className="grid grid-cols-2 gap-3">
              {/* User Option */}
              <label className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                formData.role === 'user' 
                  ? 'border-emerald-500 bg-emerald-50/30 ring-1 ring-emerald-500' 
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}>
                <input
                  type="radio"
                  name="role"
                  value="user"
                  checked={formData.role === 'user'}
                  onChange={handleChange}
                  className="w-4 h-4 text-emerald-600 border-slate-300 focus:ring-emerald-500 focus:ring-2"
                />
                <div>
                  <p className="text-xs font-bold text-slate-900">Standard User</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Access user dashboard & scrape data</p>
                </div>
              </label>

              {/* Admin Option */}
              <label className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                formData.role === 'admin' 
                  ? 'border-emerald-500 bg-emerald-50/30 ring-1 ring-emerald-500' 
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}>
                <input
                  type="radio"
                  name="role"
                  value="admin"
                  checked={formData.role === 'admin'}
                  onChange={handleChange}
                  className="w-4 h-4 text-emerald-600 border-slate-300 focus:ring-emerald-500 focus:ring-2"
                />
                <div>
                  <p className="text-xs font-bold text-slate-900">Administrator</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Full access to manage users & platform</p>
                </div>
              </label>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-4 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold hover:shadow-lg hover:shadow-emerald-500/20 active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-md"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Creating User...
              </>
            ) : (
              <>
                Create Account
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

const AdminDashboard = ({ user, onSignOut, setToast }) => {
  const [activeTab, setActiveTab] = useState('overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [users, setUsers] = useState([])

  useEffect(() => {
    // Seed mock users if empty
    const stored = localStorage.getItem('registeredUsers')
    let usersList = stored ? JSON.parse(stored) : []

    if (usersList.length === 0) {
      const now = new Date()
      usersList = [
        {
          fullName: 'Ahmed Khan',
          email: 'ahmed@example.com',
          password: 'password123',
          role: 'user',
          joinedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString() // 2 hr ago
        },
        {
          fullName: 'Sara Ali',
          email: 'sara@example.com',
          password: 'password123',
          role: 'user',
          joinedAt: new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString() // 5 hr ago
        },
        {
          fullName: 'Bilal Siddiqui',
          email: 'bilal@example.com',
          password: 'password123',
          role: 'user',
          joinedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString() // 1 day ago
        },
        {
          fullName: 'Nadia Rehman',
          email: 'nadia@example.com',
          password: 'password123',
          role: 'user',
          joinedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString() // 2 days ago
        },
        {
          fullName: 'Kamran Akmal',
          email: 'kamran@example.com',
          password: 'password123',
          role: 'user',
          joinedAt: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString() // 6 days ago
        },
        {
          fullName: 'Zainab Bibi',
          email: 'zainab@example.com',
          password: 'password123',
          role: 'user',
          joinedAt: new Date(now.getTime() - 12 * 24 * 60 * 60 * 1000).toISOString() // 12 days ago
        },
        {
          fullName: 'Faisal Iqbal',
          email: 'faisal@example.com',
          password: 'password123',
          role: 'user',
          joinedAt: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString() // 20 days ago
        },
        {
          fullName: 'Yasir Shah',
          email: 'yasir@example.com',
          password: 'password123',
          role: 'user',
          joinedAt: new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString() // 1.5 months ago
        },
        {
          fullName: 'Sana Mir',
          email: 'sana@example.com',
          password: 'password123',
          role: 'user',
          joinedAt: new Date(now.getTime() - 95 * 24 * 60 * 60 * 1000).toISOString() // ~3 months ago
        },
        {
          fullName: 'Babar Azam',
          email: 'babar@example.com',
          password: 'password123',
          role: 'admin',
          joinedAt: new Date(now.getTime() - 150 * 24 * 60 * 60 * 1000).toISOString() // ~5 months ago
        }
      ]
      localStorage.setItem('registeredUsers', JSON.stringify(usersList))
    }

    setUsers(usersList)
  }, [activeTab])

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden">
      <Sidebar
        user={user}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onSignOut={onSignOut}
        navItems={ADMIN_NAV}
        isAdmin
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
          <span className="font-bold text-slate-900 text-sm">Admin — {ADMIN_NAV.find(n => n.id === activeTab)?.label}</span>
        </header>
        <main className="flex-1 overflow-y-auto">
          {activeTab === 'overview' && <AdminOverview users={users} />}
          {activeTab === 'connect' && <QRConnect />}
          {activeTab === 'listings' && <PropertyListings isAdmin />}
          {activeTab === 'users' && <AdminUsersPanel users={users} />}
          {activeTab === 'createUser' && <AdminCreateUserPanel setToast={setToast} />}
        </main>
      </div>
    </div>
  )
}

export default AdminDashboard
