import { useState, useEffect, useRef } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { CheckCircle, XCircle, AlertCircle, ListTodo, Calendar, AlertTriangle, FileText, Clock, Sparkles, Gavel, X, Copy } from 'lucide-react'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

const LEGAL_SUGGESTIONS = [
  { trigger: 'task', phrases: ['Task T001 is verified against the judgment text.', 'Task T002 matches the direction in Para X.', 'Task description does not accurately reflect the court\'s direction.'] },
  { trigger: 'para', phrases: ['Operative paragraph correctly identified.', 'Para X is not an operative direction, it is merely an observation.'] },
  { trigger: 'date', phrases: ['Order date correctly extracted from the cause title.', 'Deadline calculation appears correct based on T=0.'] },
  { trigger: 'appeal', phrases: ['Appeal review deadline is correct for this forum.', 'Limitation period should be 90 days for SLP to Supreme Court.'] },
  { trigger: 'verdict', phrases: ['Verdict correctly classified.', 'The petition was disposed with directions, not dismissed.'] },
  { trigger: 'compliance', phrases: ['Compliance affidavit deadline is within the period granted by the Court.', 'The State must file a compliance affidavit before the next listing.'] },
  { trigger: 'verified', phrases: ['Verified against the PDF — extraction is accurate.', 'All fields verified. No corrections needed.'] },
]

function getLegalSuggestions(input, tasks) {
  if (!input || input.trim().length < 2) return []
  const lower = input.toLowerCase()
  const suggestions = []
  for (const category of LEGAL_SUGGESTIONS) {
    if (lower.includes(category.trigger)) {
      for (const phrase of category.phrases) {
        if (!input.endsWith(phrase)) suggestions.push(phrase)
      }
    }
  }
  if (suggestions.length === 0 && tasks.length > 0) {
    suggestions.push(`Verified all ${tasks.length} compliance tasks against the judgment.`)
  }
  return suggestions.slice(0, 4)
}

function NotesAutocomplete({ value, onChange, tasks }) {
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const textareaRef = useRef(null)

  const handleInputChange = (e) => {
    const newValue = e.target.value
    onChange(newValue)
    const newSuggestions = getLegalSuggestions(newValue, tasks)
    if (newSuggestions.length > 0) {
      setSuggestions(newSuggestions)
      setShowSuggestions(true)
      setActiveIndex(-1)
    } else {
      setShowSuggestions(false)
    }
  }

  const handleKeyDown = (e) => {
    if (!showSuggestions || suggestions.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(prev => Math.min(prev + 1, suggestions.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(prev => Math.max(prev - 1, 0)) }
    else if (e.key === 'Enter' || e.key === 'Tab') {
      if (activeIndex >= 0 && activeIndex < suggestions.length) {
        e.preventDefault()
        const textarea = textareaRef.current
        if (textarea) {
          const cursorPos = textarea.selectionStart
          const textBefore = value.substring(0, cursorPos)
          const lastLine = textBefore.split('\n').pop()
          const prefix = textBefore.substring(0, textBefore.length - lastLine.length)
          const newVal = prefix + suggestions[activeIndex] + '\n' + value.substring(cursorPos)
          onChange(newVal)
          setShowSuggestions(false)
          setActiveIndex(-1)
          setTimeout(() => {
            const newPos = prefix.length + suggestions[activeIndex].length + 1
            textarea.focus()
            textarea.setSelectionRange(newPos, newPos)
          }, 0)
        }
      }
    } else if (e.key === 'Escape') { setShowSuggestions(false) }
  }

  return (
    <div className="notes-autocomplete-wrapper">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        placeholder="Add reviewer notes... Try keywords: task, para, date, appeal, verdict, verified"
        rows={2}
        className="notes-autocomplete-input"
      />
      {showSuggestions && suggestions.length > 0 && (
        <div className="notes-suggestions-dropdown">
          <div className="suggestions-header">
            <Sparkles size={10} />
            <span>AI Suggested</span>
          </div>
          {suggestions.map((s, i) => (
            <button key={i} className={`suggestion-item ${i === activeIndex ? 'active' : ''}`} onMouseDown={() => {
              const textarea = textareaRef.current
              if (!textarea) return
              const cursorPos = textarea.selectionStart
              const textBefore = value.substring(0, cursorPos)
              const lastLine = textBefore.split('\n').pop()
              const prefix = textBefore.substring(0, textBefore.length - lastLine.length)
              onChange(prefix + s + '\n' + value.substring(cursorPos))
              setShowSuggestions(false)
            }}>{s}</button>
          ))}
        </div>
      )}
    </div>
  )
}

function getDeadlineStatus(deadlineDate) {
  if (!deadlineDate) return { status: 'normal', label: '', daysLeft: null }
  const deadline = new Date(deadlineDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  deadline.setHours(0, 0, 0, 0)
  const diffTime = deadline - today
  const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  if (daysLeft < 0) return { status: 'overdue', label: 'OVERDUE', daysLeft }
  if (daysLeft === 0) return { status: 'due-today', label: 'DUE TODAY', daysLeft }
  if (daysLeft <= 7) return { status: 'critical', label: `${daysLeft}d left`, daysLeft }
  if (daysLeft <= 14) return { status: 'warning', label: `${daysLeft}d left`, daysLeft }
  return { status: 'normal', label: `${daysLeft}d left`, daysLeft }
}

function ComplianceTasks({ tasks, verifications, onVerify, completedTasks, onToggleTask }) {
  const [expandedSources, setExpandedSources] = useState({})

  const toggleSource = (taskId) => setExpandedSources(prev => ({ ...prev, [taskId]: !prev[taskId] }))

  const copyTask = async (task) => {
    const text = `[${task.task_id}] ${task.description}\nDeadline: ${task.deadline}\nDept: ${task.department || 'N/A'}`
    try { await navigator.clipboard.writeText(text) } catch {}
  }

  const isCompleted = (task) => completedTasks[task.task_id]
  const isVerified = (task) => verifications[task.task_id]?.status === 'verified'

  const overdueCount = tasks.filter(t => getDeadlineStatus(t.deadline_date).status === 'overdue').length
  const pendingCount = tasks.filter(t => !isCompleted(t)).length
  const completedCount = tasks.filter(t => isCompleted(t)).length

  const sorted = [...tasks].sort((a, b) => {
    const aDone = isCompleted(a) ? 1 : 0
    const bDone = isCompleted(b) ? 1 : 0
    return aDone - bDone
  })

  if (tasks.length === 0) {
    return (
      <div className="empty-state-compact">
        <ListTodo size={32} />
        <p>No compliance tasks extracted</p>
      </div>
    )
  }

  return (
    <div className="compliance-tab">
      <div className="summary-bar">
        {overdueCount > 0 && (
          <span className="summary-item overdue">
            <AlertTriangle size={12} />
            <span className="summary-count">{overdueCount}</span> Overdue
          </span>
        )}
        <span className="summary-item pending">
          <Clock size={12} />
          <span className="summary-count">{pendingCount}</span> Pending
        </span>
        <span className="summary-item completed">
          <CheckCircle size={12} />
          <span className="summary-count">{completedCount}</span> Completed
        </span>
      </div>

      <div className="task-grid-light">
        {sorted.map((task) => {
          const completed = isCompleted(task)
          const verified = isVerified(task)
          const expanded = expandedSources[task.task_id]
          const status = getDeadlineStatus(task.deadline_date)
          const showRisk = task.contempt_risk || (status.status === 'overdue' && Math.abs(status.daysLeft || 0) > 7)
          const priorityLevel = task.priority?.toLowerCase() || 'medium'
          const statusClass = priorityLevel === 'critical' ? 'critical' : priorityLevel === 'high' ? 'high' : 'medium'

          return (
            <div key={task.task_id} className={`task-card-light ${completed ? 'completed' : ''} ${!completed ? 'needs-review' : ''}`}>
              <div className="task-card-header">
                <div className="task-card-left">
                  <span className="task-id-badge">{task.task_id}</span>
                  {task.department && task.department !== 'Not Specified' && (
                    <span className="task-dept-badge">{task.department}</span>
                  )}
                  {task.operative_para && <span className="task-dept-badge">Para {task.operative_para}</span>}
                </div>
                <div className="task-card-right">
                  {!completed && showRisk && (
                    <span className="task-status-badge critical">
                      <Gavel size={9} /> Risk
                    </span>
                  )}
                  <button style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', borderRadius: 3 }} onClick={() => copyTask(task)} title="Copy">
                    <Copy size={11} />
                  </button>
                  <span className={`task-status-badge ${completed ? 'completed' : statusClass}`}>
                    {completed ? 'Completed' : priorityLevel === 'critical' ? 'Critical' : priorityLevel === 'high' ? 'High' : 'Medium'}
                  </span>
                </div>
              </div>

              <p className={`task-description ${completed ? 'completed-text' : ''}`}>{task.description}</p>

              <div className="task-meta-row">
                <Clock size={11} />
                <span>{task.deadline}</span>
                {status.status === 'overdue' && (
                  <span className="overdue-badge">{Math.abs(status.daysLeft || 0)}d overdue</span>
                )}
              </div>

              {task.source_text && (
                <div className="task-source-block">
                  <p style={{ maxHeight: expanded ? 'none' : '3.6em', overflow: 'hidden' }}>{task.source_text}</p>
                  <button style={{ marginTop: 4, fontSize: 10, fontWeight: 600, color: 'var(--saffron-dark)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }} onClick={() => toggleSource(task.task_id)}>
                    {expanded ? 'Show less' : 'Show more'}
                  </button>
                </div>
              )}

              <button
                className={`task-complete-btn ${completed ? 'completed' : ''}`}
                onClick={() => onToggleTask(task.task_id)}
              >
                {completed ? <><CheckCircle size={14} /> Completed</> : <><Check size={14} /> Mark as Completed</>}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AppealCard({ appeal, verifications, onVerify }) {
  const hasData = appeal.limitation_period || appeal.review_deadline || appeal.filing_deadline
  const isFinality = appeal.appeal_status === 'FINALITY_REACHED'
  const reviewUrgency = getDeadlineStatus(appeal.review_deadline_date)
  const filingUrgency = getDeadlineStatus(appeal.filing_deadline_date)

  if (!hasData) {
    return (
      <div className="empty-state-compact">
        <AlertTriangle size={32} />
        <p>No appeal information found</p>
      </div>
    )
  }

  return (
    <div className="appeal-card-light">
      {isFinality && (
        <div className="finality-banner-light">
          <Gavel size={16} />
          <div>
            <span className="finality-title">Finality Reached</span>
            <span className="finality-desc">{appeal.notes || appeal.finality_notes || 'No further appeal possible due to dismissed condonation of delay.'}</span>
          </div>
        </div>
      )}
      {!isFinality && (
        <>
          {appeal.limitation_period && (
            <div className="appeal-field">
              <span className="appeal-field-label">Limitation Period</span>
              <span className="appeal-field-value">{appeal.limitation_period}</span>
            </div>
          )}
          {appeal.review_deadline && (
            <div className="appeal-field">
              <span className="appeal-field-label">{appeal.review_deadline_label || 'Review Deadline'}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="appeal-field-value highlight">{appeal.review_deadline}</span>
                {reviewUrgency.status === 'critical' && <span className="urgency-badge-light critical">{reviewUrgency.label}</span>}
                {reviewUrgency.status === 'overdue' && <span className="urgency-badge-light overdue"><AlertTriangle size={10} /> Overdue</span>}
              </div>
            </div>
          )}
          {appeal.filing_deadline && (
            <div className="appeal-field">
              <span className="appeal-field-label">{appeal.filing_deadline_label || 'Filing Deadline'}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="appeal-field-value">{appeal.filing_deadline}</span>
                {filingUrgency.status === 'critical' && <span className="urgency-badge-light critical">{filingUrgency.label}</span>}
                {filingUrgency.status === 'overdue' && <span className="urgency-badge-light overdue"><AlertTriangle size={10} /> Overdue</span>}
              </div>
            </div>
          )}
          {appeal.notes && <p style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4, marginTop: 8 }}>{appeal.notes}</p>}
          {appeal.source_text && (
            <div className="operative-source-light">
              <p>{appeal.source_text}</p>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, paddingTop: 10, borderTop: '1px solid var(--border-light)', marginTop: 10 }}>
            <button className={`task-complete-btn ${verifications['appeal']?.status === 'verified' ? 'completed' : ''}`} style={{ width: 'auto', padding: '6px 14px', fontSize: 11 }} onClick={() => onVerify('appeal', 'verified')}>
              <CheckCircle size={12} /> Verified
            </button>
            <button className={`task-complete-btn ${verifications['appeal']?.status === 'rejected' ? 'completed' : ''}`} style={{ width: 'auto', padding: '6px 14px', fontSize: 11, borderColor: 'var(--danger-border)', color: verifications['appeal']?.status === 'rejected' ? 'white' : 'var(--danger)', background: verifications['appeal']?.status === 'rejected' ? 'var(--danger)' : 'var(--bg-white)' }} onClick={() => onVerify('appeal', 'rejected')}>
              <XCircle size={12} /> Incorrect
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function MilestoneTimeline({ tracking, completedTasks, orderDate }) {
  const milestones = tracking.milestones || []
  if (milestones.length === 0) {
    return (
      <div className="empty-state-compact">
        <Calendar size={32} />
        <p>No milestones generated</p>
      </div>
    )
  }

  return (
    <div className="milestone-timeline-light">
      {milestones.map((milestone, index) => {
        const milestoneKey = `milestone-${milestone.label}`
        const isCompleted = completedTasks[milestoneKey]
        return (
          <div key={milestone.label} className="milestone-item-light">
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div className={`milestone-dot-light ${isCompleted ? 'completed' : ''}`} />
              {index < milestones.length - 1 && <div className="milestone-line-light" />}
            </div>
            <div className="milestone-content-light">
              <div className="milestone-header-light">
                <span className="milestone-label-light">{milestone.label}</span>
                <span className="milestone-date-light">{milestone.date}</span>
              </div>
              <p className="milestone-desc-light">{milestone.description}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function OperativeParagraphs({ paragraphs, verifications, onVerify }) {
  if (paragraphs.length === 0) {
    return (
      <div className="empty-state-compact">
        <FileText size={32} />
        <p>No operative paragraphs found</p>
      </div>
    )
  }

  return (
    <div>
      {paragraphs.map((para, index) => (
        <div key={index} className="operative-card-light">
          <div className="operative-header-light">
            <span className="para-number-light">Para {para.para_number}</span>
            <span className="para-direction-light">{para.direction}</span>
          </div>
          {para.source_text && (
            <div className="operative-source-light">
              <p>{para.source_text}</p>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, paddingTop: 8, borderTop: '1px solid var(--border-light)', marginTop: 8 }}>
            <button className={`task-complete-btn ${verifications[`op-${index}`]?.status === 'verified' ? 'completed' : ''}`} style={{ width: 'auto', padding: '5px 12px', fontSize: 11 }} onClick={() => onVerify(`op-${index}`, 'verified')}>
              <CheckCircle size={12} /> Verified
            </button>
            <button className={`task-complete-btn ${verifications[`op-${index}`]?.status === 'rejected' ? 'completed' : ''}`} style={{ width: 'auto', padding: '5px 12px', fontSize: 11, borderColor: 'var(--danger-border)', color: verifications[`op-${index}`]?.status === 'rejected' ? 'white' : 'var(--danger)', background: verifications[`op-${index}`]?.status === 'rejected' ? 'var(--danger)' : 'var(--bg-white)' }} onClick={() => onVerify(`op-${index}`, 'rejected')}>
              <XCircle size={12} /> Incorrect
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function ActionPlanView({ actionPlan, pdfFile, verifications, onVerify, notes, onNotesChange, completedTasks, onToggleTask }) {
  const [activeTab, setActiveTab] = useState('compliance')
  const [progressAnim, setProgressAnim] = useState(0)

  useEffect(() => {
    const tasks = actionPlan.action_plan?.compliance_tasks || []
    const completedCount = Object.values(completedTasks).filter(Boolean).length
    const totalCount = tasks.length
    const targetPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0
    let start = progressAnim
    const diff = targetPercent - start
    if (diff === 0) return
    const duration = 600
    const startTime = performance.now()
    const animate = (currentTime) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      setProgressAnim(Math.round(start + diff * (1 - Math.pow(1 - progress, 3))))
      if (progress < 1) requestAnimationFrame(animate)
    }
    requestAnimationFrame(animate)
  }, [completedTasks])

  const tasks = actionPlan.action_plan?.compliance_tasks || []
  const pendingCount = tasks.filter(t => !completedTasks[t.task_id]).length

  const tabs = [
    { id: 'compliance', label: 'Compliance Tasks', badge: pendingCount },
    { id: 'appeal', label: 'Appeal Review' },
    { id: 'tracking', label: 'Milestones' },
    { id: 'operative', label: 'Operative Paragraphs' },
  ]

  return (
    <div className="action-plan-layout">
      <div className="layout-header">
        <div className="dashboard-title">
          <ListTodo size={16} />
          <h2>Action Plan</h2>
        </div>
        <div className="dashboard-progress">
          <span className="progress-text">{progressAnim}%</span>
          <div className="progress-bar-track">
            <div className="progress-bar-fill" style={{ width: `${progressAnim}%` }} />
          </div>
        </div>
      </div>

      <div className="tab-navigation">
        <div className="tab-list">
          {tabs.map(tab => (
            <button key={tab.id} className={`tab-button ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && <span className="tab-badge">{tab.badge}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="tab-content-scrollable">
        <div className="tab-panel">
          {activeTab === 'compliance' && (
            <ComplianceTasks tasks={tasks} verifications={verifications} onVerify={onVerify} completedTasks={completedTasks} onToggleTask={onToggleTask} />
          )}
          {activeTab === 'appeal' && (
            <AppealCard appeal={actionPlan.action_plan?.appeal_review || {}} verifications={verifications} onVerify={onVerify} />
          )}
          {activeTab === 'tracking' && (
            <MilestoneTimeline tracking={actionPlan.action_plan?.tracking || {}} completedTasks={completedTasks} orderDate={actionPlan.dates?.order_date?.value} />
          )}
          {activeTab === 'operative' && (
            <OperativeParagraphs paragraphs={actionPlan.operative_paragraphs || []} verifications={verifications} onVerify={onVerify} />
          )}
        </div>
      </div>

      <div className="notes-section-fixed">
        <label>Reviewer Notes</label>
        <NotesAutocomplete value={notes} onChange={onNotesChange} tasks={tasks} />
      </div>
    </div>
  )
}

function PDFViewerModal({ pdfFile, onClose }) {
  const [loadedPages, setLoadedPages] = useState(null)

  function onDocumentLoadSuccess({ numPages }) {
    setLoadedPages(numPages)
  }

  const pdfUrl = pdfFile ? URL.createObjectURL(pdfFile) : null

  return (
    <div className="pdf-modal-overlay" onClick={onClose}>
      <div className="pdf-modal" onClick={e => e.stopPropagation()}>
        <div className="pdf-modal-header">
          <h3>Source Document</h3>
          <div className="pdf-modal-controls">
            <span className="pdf-page-indicator">{loadedPages ? `${loadedPages} pages` : '--'}</span>
            <button className="pdf-close-btn" onClick={onClose}><X size={16} /></button>
          </div>
        </div>
        <div className="pdf-modal-content">
          {pdfUrl ? (
            <Document file={pdfUrl} onLoadSuccess={onDocumentLoadSuccess} loading={<div className="pdf-loading">Loading document...</div>}>
              {loadedPages && Array.from(new Array(loadedPages), (el, index) => (
                <Page key={`page_${index + 1}`} pageNumber={index + 1} width={800} renderTextLayer renderAnnotationLayer />
              ))}
            </Document>
          ) : (
            <div className="pdf-loading">No PDF loaded</div>
          )}
        </div>
      </div>
    </div>
  )
}

export { ActionPlanView, PDFViewerModal }
export default ActionPlanView
