import { ListTodo, Table2, Upload } from 'lucide-react'

function CaseInfo({ data, fileName, currentView, onViewChange, onUploadNew }) {
  const caseIdentity = data?.case_identity || {}
  const dates = data?.dates || {}
  const verdict = data?.verdict || {}

  return (
    <div className="case-info-bar">
      <div className="case-info-grid">
        {caseIdentity.case_type?.value && (
          <div className="case-field">
            <span className="case-label">Case Type</span>
            <span className="case-value">{caseIdentity.case_type.value}</span>
          </div>
        )}
        {caseIdentity.case_number?.value && (
          <div className="case-field">
            <span className="case-label">Case Number</span>
            <span className="case-value case-number">{caseIdentity.case_number.value}</span>
          </div>
        )}
        {caseIdentity.year?.value && (
          <div className="case-field">
            <span className="case-label">Year</span>
            <span className="case-value">{caseIdentity.year.value}</span>
          </div>
        )}
        {caseIdentity.bench?.value && (
          <div className="case-field">
            <span className="case-label">Bench</span>
            <span className="case-value">{caseIdentity.bench.value}</span>
          </div>
        )}
        {caseIdentity.judge?.value && (
          <div className="case-field">
            <span className="case-label">Judge</span>
            <span className="case-value">{caseIdentity.judge.value}</span>
          </div>
        )}
        {verdict.value && (
          <div className="case-field">
            <span className="case-label">Verdict</span>
            <span className={`verdict-badge verdict-${verdict.value.toLowerCase().replace(/ /g, '-')}`}>{verdict.value}</span>
          </div>
        )}
        <div className="view-toggle-field">
          <div className="view-toggle-group">
            <button className={`view-toggle-btn ${currentView === 'dashboard' ? 'active' : ''}`} onClick={() => onViewChange('dashboard')}>Dashboard</button>
            <button className={`view-toggle-btn ${currentView === 'split' ? 'active' : ''}`} onClick={() => onViewChange('split')}>
              <ListTodo size={12} style={{ marginRight: 4 }} /> Review
            </button>
            <button className={`view-toggle-btn ${currentView === 'summary' ? 'active' : ''}`} onClick={() => onViewChange('summary')}>
              <Table2 size={12} style={{ marginRight: 4 }} /> Summary
            </button>
            <button className="view-toggle-btn view-toggle-upload" onClick={onUploadNew}>
              <Upload size={12} style={{ marginRight: 4 }} /> Upload
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CaseInfo
