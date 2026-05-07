import { useState } from 'react'
import { Lock, Mail, AlertCircle } from 'lucide-react'

function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailError, setEmailError] = useState('')
  const [loginError, setLoginError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const validateEmail = (value) => {
    if (!value) {
      setEmailError('Email address is required')
      return false
    }
    if (!value.endsWith('@kagov.net')) {
      setEmailError('Only @kagov.net domain is allowed')
      return false
    }
    setEmailError('')
    return true
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setLoginError('')

    if (!validateEmail(email)) return

    if (password !== 'aiforbharat') {
      setLoginError('Invalid credentials')
      return
    }

    setIsLoading(true)
    setTimeout(() => {
      setIsLoading(false)
      onLogin(email)
    }, 400)
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="tricolor-bar" />
        <div className="login-header">
          <div className="login-emblem">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          </div>
          <h1>CCMS-AI</h1>
          <p>Centre for e-Governance — Judgment Analyzer</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="login-email">Government Email</label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                id="login-email"
                type="email"
                className={`form-input ${emailError ? 'error' : ''}`}
                placeholder="your.name@kagov.net"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (emailError) validateEmail(e.target.value)
                }}
                onBlur={() => { if (email) validateEmail(email) }}
                autoComplete="email"
                style={{ paddingLeft: 32 }}
              />
            </div>
            <span className="form-error">{emailError || '\u00A0'}</span>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="login-password">Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                id="login-password"
                type="password"
                className={`form-input ${loginError ? 'error' : ''}`}
                placeholder="Enter password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setLoginError('') }}
                autoComplete="current-password"
                style={{ paddingLeft: 32 }}
              />
            </div>
          </div>

          {loginError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--danger)', fontSize: 12 }}>
              <AlertCircle size={14} />
              <span>{loginError}</span>
            </div>
          )}

          <button type="submit" className="login-btn" disabled={isLoading}>
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="login-footer">
          Authorized personnel only — Government of India
        </div>
      </div>
    </div>
  )
}

export default LoginPage
