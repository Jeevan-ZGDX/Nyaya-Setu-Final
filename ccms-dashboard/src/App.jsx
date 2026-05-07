import { useState, useCallback, useEffect, useRef } from 'react'
import './App.css'
import Header from './components/Header'
import LoginPage from './components/LoginPage'
import CaseInfo from './components/CaseInfo'
import { ActionPlanView, PDFViewerModal } from './components/SplitScreenView'
import VerificationSummary from './components/VerificationSummary'
import UploadPrompt from './components/UploadPrompt'
import { analyzeJudgment } from './services/api'
import { Check, AlertTriangle, ListTodo, Upload, X, Clock } from 'lucide-react'

const DEPARTMENTS = ['All', 'Revenue', 'Police', 'Municipal', 'Education', 'Health', 'PWD']
const URGENCIES = ['All', 'Critical', 'High', 'Medium', 'Low']
const ACTIONS = ['All', 'File Appeal', 'Issue Notice', 'Conduct Survey', 'Pay Compensation', 'Compliance Report']

function getTaskStatus(task) {
  if (task.contempt_risk) return { level: 'critical', label: 'Critical', className: 'critical' }
  if (task.priority === 'Critical') return { level: 'critical', label: 'Critical', className: 'critical' }
  if (task.priority === 'High') return { level: 'high', label: 'High', className: 'high' }
  if (task.priority === 'Medium') return { level: 'medium', label: 'Medium', className: 'medium' }
  return { level: 'low', label: 'Pending', className: '' }
}

function getCountdown(deadlineDate) {
  if (!deadlineDate) return ''
  const deadline = new Date(deadlineDate)
  const now = new Date()
  const diff = deadline - now
  if (diff < 0) {
    const days = Math.floor(Math.abs(diff) / (1000 * 60 * 60 * 24))
    return `${days}d overdue`
  }
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  if (days > 0) return `${days}d ${hours}h`
  return `${hours}h remaining`
}

function matchesAction(task, actionFilter) {
  if (actionFilter === 'All') return true
  const desc = (task.description || '').toLowerCase()
  switch (actionFilter) {
    case 'File Appeal':
      return desc.includes('appeal') || desc.includes('review') || desc.includes('challenge')
    case 'Issue Notice':
      return desc.includes('notice') || desc.includes('show cause') || desc.includes('summons')
    case 'Conduct Survey':
      return desc.includes('survey') || desc.includes('inspection') || desc.includes('measurement')
    case 'Pay Compensation':
      return desc.includes('pay') || desc.includes('compensat') || desc.includes('disburse') || desc.includes('release')
    case 'Compliance Report':
      return desc.includes('compliance') || desc.includes('report') || desc.includes('affidavit') || desc.includes('submit')
    default:
      return true
  }
}

function DecisionSkeleton() {
  return (
    <div className="skeleton-card-decision">
      <div className="card-top-row">
        <div className="card-id-section">
          <div className="skeleton" style={{ width: '70px', height: '12px' }} />
          <div className="skeleton" style={{ width: '50px', height: '10px' }} />
        </div>
      </div>
      <div className="skeleton" style={{ width: '100%', height: '14px', marginBottom: 4 }} />
      <div className="skeleton" style={{ width: '65%', height: '14px', marginBottom: 8 }} />
      <div className="skeleton" style={{ width: '80px', height: '10px' }} />
      <div className="card-footer">
        <div className="skeleton" style={{ width: '60px', height: '18px' }} />
        <div className="skeleton" style={{ width: '45px', height: '12px' }} />
      </div>
    </div>
  )
}

function DecisionCard({ task, onComplete, isCompleted }) {
  const status = getTaskStatus(task)
  const countdown = getCountdown(task.deadline_date)

  return (
    <div className={`decision-card ${status.level} ${isCompleted ? 'completed' : ''}`}>
      <div className="card-top-row">
        <div className="card-id-section">
          <span className="case-id-label">{task.task_id}</span>
          {task.department && task.department !== 'Not Specified' && (
            <span className="card-department">{task.department}</span>
          )}
        </div>
      </div>

      <h3 className="card-action-title">
        {isCompleted ? task.description.split('.')[0] : task.description.split('.')[0]}
      </h3>

      <div className="card-parties">
        {task.operative_para && <span>Para {task.operative_para}</span>}
        {task.source_text && (
          <span>
            {task.source_text.substring(0, 50)}...
          </span>
        )}
      </div>

      <div className="card-footer">
        <span className={`card-status-badge ${isCompleted ? 'completed' : status.className}`}>
          {isCompleted ? 'Completed' : status.label}
        </span>
        {!isCompleted && (
          <span className="card-countdown">{countdown}</span>
        )}
        <button
          className={`mark-complete-btn ${isCompleted ? 'completed' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            onComplete(task.task_id)
          }}
        >
          {isCompleted ? (
            <><Check size={13} /> Done</>
          ) : (
            <>Mark as Completed</>
          )}
        </button>
      </div>
    </div>
  )
}

function DashboardView({ actionPlan, completedTasks, onComplete, filters, setFilters, onViewChange, onUploadNew }) {
  const allTasks = actionPlan?.action_plan?.compliance_tasks || []

  const filtered = allTasks.filter(task => {
    if (filters.urgency !== 'All') {
      const s = getTaskStatus(task)
      const map = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' }
      if (map[s.level] !== filters.urgency) return false
    }
    if (filters.department !== 'All' && task.department !== filters.department) return false
    if (!matchesAction(task, filters.action)) return false
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    const aDone = completedTasks[a.task_id] ? 1 : 0
    const bDone = completedTasks[b.task_id] ? 1 : 0
    if (aDone !== bDone) return aDone - bDone
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
    return (priorityOrder[getTaskStatus(a).level] || 3) - (priorityOrder[getTaskStatus(b).level] || 3)
  })

  const pendingCount = allTasks.filter(t => !completedTasks[t.task_id]).length
  const completedCount = allTasks.filter(t => completedTasks[t.task_id]).length

  return (
    <>
      <div className="case-info-bar">
        <div className="case-info-grid">
          <div className="case-field">
            <span className="case-label">Case Number</span>
            <span className="case-value case-number">{actionPlan?.case_identity?.case_number?.value || 'N/A'}</span>
          </div>
          <div className="case-field">
            <span className="case-label">Bench</span>
            <span className="case-value">{actionPlan?.case_identity?.bench?.value || 'N/A'}</span>
          </div>
          <div className="case-field">
            <span className="case-label">Verdict</span>
            <span className={`verdict-badge verdict-${(actionPlan?.verdict?.value || '').toLowerCase().replace(/ /g, '-')}`}>
              {actionPlan?.verdict?.value || 'N/A'}
            </span>
          </div>
          <div className="case-field">
            <span className="case-label">Status</span>
            <span className="case-value">{completedCount}/{allTasks.length} Completed</span>
          </div>
          <div className="view-toggle-field">
            <div className="view-toggle-group">
              <button className="view-toggle-btn active">Dashboard</button>
              <button className="view-toggle-btn" onClick={() => onViewChange('split')}>
                <ListTodo size={12} style={{ marginRight: 4 }} /> Review
              </button>
              <button className="view-toggle-btn view-toggle-upload" onClick={onUploadNew}>
                <Upload size={12} style={{ marginRight: 4 }} /> Upload
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="decision-dashboard-header">
        <div className="dashboard-title-row">
          <div className="dashboard-title-section">
            <h1>Decision Dashboard</h1>
            <span className="case-count-label">{sorted.length} actions — {pendingCount} pending, {completedCount} completed</span>
          </div>
        </div>
      </div>

      <div className="global-filter-bar">
        <div className="filter-bar-inner">
          <div className="filter-group">
            <span className="filter-group-label">Department</span>
            <div className="filter-pills">
              {DEPARTMENTS.map(d => (
                <button key={d} className={`filter-pill ${filters.department === d ? 'active' : ''}`} onClick={() => setFilters(p => ({ ...p, department: d }))}>{d}</button>
              ))}
            </div>
          </div>
          <div className="filter-group">
            <span className="filter-group-label">Urgency</span>
            <div className="filter-pills">
              {URGENCIES.map(u => (
                <button key={u} className={`filter-pill urgency-${u.toLowerCase()} ${filters.urgency === u ? 'active' : ''}`} onClick={() => setFilters(p => ({ ...p, urgency: u }))}>{u}</button>
              ))}
            </div>
          </div>
          <div className="filter-group">
            <span className="filter-group-label">Action</span>
            <div className="filter-pills">
              {ACTIONS.map(a => (
                <button key={a} className={`filter-pill ${filters.action === a ? 'active' : ''}`} onClick={() => setFilters(p => ({ ...p, action: a }))}>{a}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="decision-grid-main">
        <div className="decision-grid">
          {sorted.length === 0 ? (
            <div className="decision-empty-state">
              <AlertTriangle size={36} />
              <p>No tasks match the selected filters</p>
              <span>Try adjusting your Department, Urgency, or Action criteria</span>
              <button className="reset-filters-btn" onClick={() => setFilters({ department: 'All', urgency: 'All', action: 'All' })}>
                Reset Filters
              </button>
            </div>
          ) : (
            sorted.map(task => (
              <DecisionCard
                key={task.task_id}
                task={task}
                onComplete={onComplete}
                isCompleted={!!completedTasks[task.task_id]}
              />
            ))
          )}
        </div>
      </div>
    </>
  )
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return sessionStorage.getItem('ccms_auth') === 'true'
  })
  const [userName, setUserName] = useState(() => {
    return sessionStorage.getItem('ccms_user') || ''
  })
  const [currentView, setCurrentView] = useState('dashboard')
  const [actionPlan, setActionPlan] = useState(null)
  const [verifications, setVerifications] = useState({})
  const [notes, setNotes] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [fileName, setFileName] = useState('')
  const [pdfFile, setPdfFile] = useState(null)
  const [showPdfModal, setShowPdfModal] = useState(false)
  const [filters, setFilters] = useState({ department: 'All', urgency: 'All', action: 'All' })
  const [completedTasks, setCompletedTasks] = useState({})
  const [lastSynced, setLastSynced] = useState(() => {
    const now = new Date()
    return now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  })

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date()
      setLastSynced(now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }))
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  const handleLogin = (email) => {
    setIsAuthenticated(true)
    setUserName(email)
    sessionStorage.setItem('ccms_auth', 'true')
    sessionStorage.setItem('ccms_user', email)
  }

  const handleLogout = () => {
    setIsAuthenticated(false)
    setUserName('')
    sessionStorage.removeItem('ccms_auth')
    sessionStorage.removeItem('ccms_user')
  }

  const handleUpload = useCallback(async (file) => {
    setIsLoading(true)
    setError(null)
    setFileName(file.name)
    setPdfFile(file)
    setVerifications({})
    setNotes('')
    setCompletedTasks({})
    setFilters({ department: 'All', urgency: 'All', action: 'All' })

    try {
      const result = await analyzeJudgment(file)
      if (!result || !result.action_plan) {
        throw new Error('Invalid response from server: missing action plan')
      }
      setActionPlan(result)
      setCurrentView('dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleComplete = (taskId) => {
    setCompletedTasks(prev => ({
      ...prev,
      [taskId]: !prev[taskId]
    }))
  }

  const handleVerify = (fieldId, status) => {
    setVerifications(prev => ({
      ...prev,
      [fieldId]: { status, timestamp: new Date().toISOString() }
    }))
  }

  const handleViewChange = (view) => {
    if (view === 'split') {
      setCurrentView('split')
      setShowPdfModal(true)
    }
  }

  const handleUploadNew = () => {
    setActionPlan(null)
    setFileName('')
    setPdfFile(null)
    setShowPdfModal(false)
    setVerifications({})
    setCompletedTasks({})
    setCurrentView('dashboard')
  }

  const totalFields = actionPlan
    ? Object.keys(actionPlan.case_identity || {}).length +
      Object.keys(actionPlan.dates || {}).length +
      1 +
      (actionPlan.operative_paragraphs || []).length +
      (actionPlan.action_plan?.compliance_tasks || []).length
    : 0

  const verifiedCount = Object.values(verifications).filter(v => v.status === 'verified').length
  const progressPercent = totalFields > 0 ? Math.round((verifiedCount / totalFields) * 100) : 0

  if (!isAuthenticated) {
    return <LoginPage onLogin={handleLogin} />
  }

  if (!actionPlan && !isLoading) {
    return (
      <div className="app">
        <Header onLogout={handleLogout} userName={userName} lastSynced={lastSynced} />
        <UploadPrompt onUpload={handleUpload} error={error} />
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="app">
        <Header onLogout={handleLogout} userName={userName} lastSynced={lastSynced} />
        <div className="loading-screen">
          <div className="loading-spinner" />
          <h2>Analyzing Judgment</h2>
          <p>Extracting text, identifying case details, and generating action plan...</p>
          {fileName && <span className="file-name">{fileName}</span>}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="app">
        <Header onLogout={handleLogout} userName={userName} lastSynced={lastSynced} />
        <UploadPrompt onUpload={handleUpload} error={error} />
      </div>
    )
  }

  return (
    <div className="app">
      <Header onLogout={handleLogout} userName={userName} lastSynced={lastSynced} />

      {currentView === 'dashboard' && (
        <DashboardView
          actionPlan={actionPlan}
          completedTasks={completedTasks}
          onComplete={handleComplete}
          filters={filters}
          setFilters={setFilters}
          onViewChange={handleViewChange}
          onUploadNew={handleUploadNew}
        />
      )}

      {currentView === 'split' && (
        <>
          <CaseInfo
            data={actionPlan}
            fileName={fileName}
            currentView={currentView}
            onViewChange={setCurrentView}
            onUploadNew={handleUploadNew}
          />

          <main className="main-content">
            <ActionPlanView
              actionPlan={actionPlan}
              pdfFile={pdfFile}
              verifications={verifications}
              onVerify={handleVerify}
              notes={notes}
              onNotesChange={setNotes}
              completedTasks={completedTasks}
              onToggleTask={handleComplete}
            />
          </main>
        </>
      )}

      {currentView === 'summary' && (
        <>
          <CaseInfo
            data={actionPlan}
            fileName={fileName}
            currentView={currentView}
            onViewChange={setCurrentView}
            onUploadNew={handleUploadNew}
          />
          <main className="main-content">
            <VerificationSummary
              actionPlan={actionPlan}
              verifications={verifications}
              progressPercent={progressPercent}
              notes={notes}
            />
          </main>
        </>
      )}

      {showPdfModal && pdfFile && (
        <PDFViewerModal
          pdfFile={pdfFile}
          onClose={() => setShowPdfModal(false)}
        />
      )}
    </div>
  )
}

export default App
