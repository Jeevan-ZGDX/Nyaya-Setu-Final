import { Shield, LogOut, Wifi } from 'lucide-react'

function Header({ onLogout, userName, lastSynced }) {
  return (
    <header className="header">
      <div className="tricolor-bar-header" />
      <div className="header-content">
        <div className="header-left">
          <div className="emblem-container">
            <Shield size={20} />
          </div>
          <div className="header-text">
            <span className="ministry-line">Centre for e-Governance</span>
            <span className="app-title">CCMS-AI — Judgment Analyzer</span>
          </div>
        </div>

        <div className="header-right">
          <div className="sync-indicator">
            <div className="sync-dot" />
            <span className="sync-text">Last Synced with HCIS</span>
            <span className="sync-time">{lastSynced}</span>
          </div>

          {userName && (
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
              {userName.split('@')[0]}
            </span>
          )}

          <button className="logout-btn" onClick={onLogout}>
            <LogOut size={14} />
            Sign Out
          </button>
        </div>
      </div>
    </header>
  )
}

export default Header
