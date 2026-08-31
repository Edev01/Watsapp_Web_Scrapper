import React from 'react'

const SkeletonLoading = ({ tab }) => {
  // Render different skeletons based on active tab
  if (tab === 'overview') {
    return (
      <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6 animate-pulse">
        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2].map(i => (
            <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 space-y-3">
              <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-16" />
              <div className="h-7 bg-slate-300 dark:bg-slate-650 rounded w-24" />
              <div className="h-3.5 bg-slate-200 dark:bg-slate-700 rounded w-20" />
            </div>
          ))}
        </div>

        {/* Chart Skeleton */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-6">
          <div className="flex justify-between items-center">
            <div className="space-y-2">
              <div className="h-5 bg-slate-350 dark:bg-slate-600 rounded w-32" />
              <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-48" />
            </div>
            <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-24" />
          </div>
          <div className="h-64 bg-slate-100 dark:bg-slate-900/60 rounded-xl flex items-end p-4 space-x-4">
            {[30, 45, 20, 60, 40, 80, 50, 90, 70, 85].map((h, i) => (
              <div
                key={i}
                className="flex-1 bg-slate-200 dark:bg-slate-700 rounded-t"
                style={{ height: `${h}%`, opacity: 0.5 }}
              />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (tab === 'connect') {
    return (
      <div className="p-4 sm:p-8 max-w-xl mx-auto text-center animate-pulse">
        {/* Header Skeleton */}
        <div className="mb-6 space-y-2">
          <div className="h-7 bg-slate-300 dark:bg-slate-600 rounded-xl w-56 mx-auto" />
          <div className="h-3.5 bg-slate-200 dark:bg-slate-700 rounded-lg w-80 max-w-full mx-auto" />
        </div>

        {/* QR Code Container Skeleton */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 sm:p-8 shadow-sm flex flex-col items-center justify-center min-h-[380px]">
          <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded-full w-36 mb-4" />
          <div className="w-[240px] h-[240px] p-4 bg-slate-100 dark:bg-slate-700/50 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center relative">
            <div className="w-12 h-12 rounded-xl bg-slate-200 dark:bg-slate-600 mb-2" />
            <div className="h-3 bg-slate-200 dark:bg-slate-600 rounded w-28 mb-1.5" />
            <div className="h-2 bg-slate-200 dark:bg-slate-600 rounded w-20" />
          </div>
          <div className="h-3.5 bg-slate-200 dark:bg-slate-700 rounded w-56 mt-4" />
          <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-36 mt-2" />
        </div>
      </div>
    )
  }

  if (tab === 'listings' || tab === 'search') {
    return (
      <div className="p-4 sm:p-6 max-w-7xl w-full mx-auto space-y-6 animate-pulse">
        {/* Title */}
        <div className="space-y-2">
          <div className="h-6 bg-slate-300 dark:bg-slate-600 rounded w-44" />
          <div className="h-3.5 bg-slate-200 dark:bg-slate-700 rounded w-64" />
        </div>

        {/* Filter Box skeleton */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 space-y-6">
          <div className="flex gap-4">
            <div className="flex-1 h-10 bg-slate-200 dark:bg-slate-700 rounded-xl" />
            <div className="w-24 h-10 bg-slate-300 dark:bg-slate-650 rounded-xl" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="space-y-2">
                <div className="h-3 bg-slate-250 dark:bg-slate-750 rounded w-16" />
                <div className="h-9 bg-slate-150 dark:bg-slate-700/60 rounded-xl" />
              </div>
            ))}
          </div>
        </div>

        {/* Listings Grid */}
        {tab === 'listings' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden space-y-4">
                <div className="h-48 bg-slate-200 dark:bg-slate-700" />
                <div className="p-5 space-y-3">
                  <div className="h-4.5 bg-slate-300 dark:bg-slate-600 rounded w-5/6" />
                  <div className="h-3.5 bg-slate-250 dark:bg-slate-650 rounded w-1/3" />
                  <div className="flex gap-4 pt-2">
                    <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-12" />
                    <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-12" />
                    <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-12" />
                  </div>
                  <div className="flex justify-between items-center pt-4 border-t border-slate-100 dark:border-slate-700/50">
                    <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-16" />
                    <div className="h-8 bg-slate-300 dark:bg-slate-650 rounded-lg w-20" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (tab === 'users') {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-6 animate-pulse">
        {/* Title */}
        <div className="flex justify-between items-center">
          <div className="space-y-2">
            <div className="h-6 bg-slate-300 dark:bg-slate-600 rounded w-36" />
            <div className="h-3.5 bg-slate-200 dark:bg-slate-700 rounded w-24" />
          </div>
          <div className="h-9 bg-slate-200 dark:bg-slate-700 rounded-xl w-60" />
        </div>

        {/* Table skeleton */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
          <div className="h-10 bg-slate-100 dark:bg-slate-700/55 border-b border-slate-200 dark:border-slate-700" />
          <div className="divide-y divide-slate-100 dark:divide-slate-700/60 p-4 space-y-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3 w-1/4">
                  <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 shrink-0" />
                  <div className="h-3.5 bg-slate-250 dark:bg-slate-650 rounded w-24" />
                </div>
                <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/4" />
                <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded-full w-12" />
                <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-20" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (tab === 'createUser' || tab === 'resetPassword') {
    return (
      <div className="p-6 max-w-lg mx-auto animate-pulse">
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 sm:p-8 space-y-6">
          <div className="space-y-2 text-center">
            <div className="h-6 bg-slate-300 dark:bg-slate-600 rounded w-36 mx-auto" />
            <div className="h-3.5 bg-slate-200 dark:bg-slate-700 rounded w-52 mx-auto" />
          </div>

          <div className="space-y-5">
            {[1, 2, 3].map(i => (
              <div key={i} className="space-y-2">
                <div className="h-3 bg-slate-250 dark:bg-slate-650 rounded w-20" />
                <div className="h-10 bg-slate-150 dark:bg-slate-700/60 rounded-xl" />
              </div>
            ))}

            <div className="space-y-3">
              <div className="h-3 bg-slate-250 dark:bg-slate-650 rounded w-20" />
              <div className="grid grid-cols-2 gap-3">
                <div className="h-14 bg-slate-150 dark:bg-slate-700/40 rounded-xl" />
                <div className="h-14 bg-slate-150 dark:bg-slate-700/40 rounded-xl" />
              </div>
            </div>

            <div className="h-11 bg-slate-300 dark:bg-slate-600 rounded-xl w-full pt-2" />
          </div>
        </div>
      </div>
    )
  }

  if (tab === 'scrapedChats') {
    return (
      <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5 animate-pulse">
        {/* Header Skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-2">
            <div className="h-6 bg-slate-300 dark:bg-slate-600 rounded w-40" />
            <div className="h-3.5 bg-slate-200 dark:bg-slate-700 rounded w-64" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 bg-slate-200 dark:bg-slate-700 rounded-xl w-32" />
            <div className="h-9 bg-slate-300 dark:bg-slate-650 rounded-xl w-28" />
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-2">
              <div className="h-2.5 bg-slate-200 dark:bg-slate-700 rounded w-16" />
              <div className="h-6 bg-slate-300 dark:bg-slate-600 rounded w-12" />
              <div className="h-2.5 bg-slate-150 dark:bg-slate-750 rounded w-24" />
            </div>
          ))}
        </div>

        {/* Main Grid: Chats list & Messages */}
        <div className="grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] gap-5">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-4 h-[600px]">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-700">
              <div className="h-4 bg-slate-300 dark:bg-slate-600 rounded w-20" />
              <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded-lg w-24" />
            </div>
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex items-center gap-3 pt-2">
                <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-700 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-slate-300 dark:bg-slate-600 rounded w-28" />
                  <div className="h-2.5 bg-slate-200 dark:bg-slate-700 rounded w-40" />
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-4 h-[600px] flex flex-col justify-between">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-3">
              <div className="h-4 bg-slate-300 dark:bg-slate-600 rounded w-32" />
              <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded-xl w-28" />
            </div>
            <div className="flex-1 space-y-3 pt-4">
              {[1, 2, 3].map(i => (
                <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
                  <div className="w-64 h-16 bg-slate-100 dark:bg-slate-700/60 rounded-2xl p-3 space-y-2" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (tab === 'saved') {
    return (
      <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6 animate-pulse">
        <div className="space-y-2">
          <div className="h-6 bg-slate-300 dark:bg-slate-600 rounded w-44" />
          <div className="h-3.5 bg-slate-200 dark:bg-slate-700 rounded w-64" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden space-y-4 p-4">
              <div className="h-44 bg-slate-200 dark:bg-slate-700 rounded-xl" />
              <div className="space-y-2">
                <div className="h-4 bg-slate-300 dark:bg-slate-600 rounded w-3/4" />
                <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Default fallback skeleton (no circular spinner)
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 animate-pulse">
      <div className="h-6 bg-slate-300 dark:bg-slate-600 rounded w-40" />
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-4">
        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
        <div className="h-24 bg-slate-100 dark:bg-slate-700/50 rounded-xl" />
      </div>
    </div>
  )
}

export default SkeletonLoading
