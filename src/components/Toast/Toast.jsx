const Toast = ({ toast, onClose }) => {
  if (!toast) return null

  return (
    <div className="fixed top-6 right-6 z-50 animate-slide-in-right max-w-sm pointer-events-auto">
      <div
        className={`p-4 rounded-2xl shadow-xl flex items-start gap-3 border ${
          toast.type === 'success'
            ? 'bg-emerald-50 border-emerald-200/80 text-emerald-900'
            : 'bg-rose-50 border-rose-200/80 text-rose-900'
        }`}
      >
        {toast.type === 'success' ? (
          <svg className="w-5 h-5 shrink-0 text-emerald-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ) : (
          <svg className="w-5 h-5 shrink-0 text-rose-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        )}
        <div className="flex-grow">
          <p className="text-sm font-bold">{toast.type === 'success' ? 'Success' : 'Attention Needed'}</p>
          <p className="text-xs opacity-90 mt-0.5 font-medium">{toast.message}</p>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-slate-200/50 transition-colors cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        .animate-slide-in-right {
          animation: slideInRight 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
    </div>
  )
}

export default Toast
