import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import SignIn from './pages/SignIn/SignIn'
import Dashboard from './pages/Dashboard/Dashboard'
import Results from './pages/Results/Results'
import Toast from './components/Toast/Toast'

function App() {
  const [toast, setToast] = useState(null)

  // Auth state — read initial value from localStorage on load
  const [authUser, setAuthUser] = useState(() => {
    const saved = localStorage.getItem('currentUser')
    return saved ? JSON.parse(saved) : null
  })

  // Sync authUser state to localStorage
  useEffect(() => {
    if (authUser) {
      localStorage.setItem('currentUser', JSON.stringify(authUser))
    } else {
      localStorage.removeItem('currentUser')
    }
  }, [authUser])

  // Auto-dismiss toast after 4 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  const handleSignOut = () => {
    setAuthUser(null)
    setToast({ type: 'success', message: 'Logged out successfully' })
  }

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-50 text-slate-800 relative overflow-hidden font-sans">
        <div className="absolute top-[-10%] left-[-10%] w-[45vw] h-[45vw] rounded-full bg-emerald-500/10 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-15%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-teal-500/10 blur-[150px] pointer-events-none" />
        <div className="absolute inset-0 bg-grid-pattern opacity-100 pointer-events-none" />

        <main className="relative z-10 w-full">
          <Routes>
            <Route path="/" element={<Navigate to="/signin" replace />} />

            <Route
              path="/signin"
              element={
                authUser
                  ? <Navigate to="/dashboard" replace />
                  : (
                    <div className="min-h-screen flex items-center justify-center px-4">
                      <div className="w-full max-w-[480px] glass-card rounded-3xl p-6 sm:p-9 shadow-2xl border border-slate-200/80">
                        <SignIn setAuthUser={setAuthUser} setToast={setToast} />
                      </div>
                    </div>
                  )
              }
            />

            <Route path="/signup" element={<Navigate to="/signin" replace />} />

            <Route
              path="/dashboard"
              element={
                authUser
                  ? <Dashboard user={authUser} onSignOut={handleSignOut} setToast={setToast} />
                  : <Navigate to="/signin" replace />
              }
            />

            <Route
              path="/results"
              element={
                authUser
                  ? <Results />
                  : <Navigate to="/signin" replace />
              }
            />

            <Route path="*" element={<Navigate to="/signin" replace />} />
          </Routes>
        </main>

        {/* Global Toast — top right */}
        <Toast toast={toast} onClose={() => setToast(null)} />
      </div>
    </BrowserRouter>
  )
}

export default App
