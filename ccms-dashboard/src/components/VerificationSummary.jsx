import { CheckCircle, XCircle, AlertCircle, FileText } from 'lucide-react'

function VerificationSummary({ actionPlan, verifications, progressPercent, notes }) {
  const fields = getAllFields(actionPlan)
  const verifiedCount = fields.filter(f => verifications[f.id]?.status === 'verified').length
  const rejectedCount = fields.filter(f => verifications[f.id]?.status === 'rejected').length
  const flaggedCount = fields.filter(f => verifications[f.id]?.status === 'flagged').length
  const pendingCount = fields.length - verifiedCount - rejectedCount - flaggedCount

  return (
    <div className="summary-view">
      <div className="summary-header">
        <h2>Verification Summary</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="progress-bar-track" style={{ width: 160, height: 6 }}>
            <div className="progress-bar-fill" style={{ width: `${progressPercent}%`, background: progressPercent === 100 ? 'var(--india-green)' : 'var(--saffron)' }} />
          </div>
          <span className="progress-text">{progressPercent}%</span>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card stat-verified">
          <CheckCircle size={18} />
          <div>
            <span className="stat-number">{verifiedCount}</span>
            <span className="stat-label">Verified</span>
          </div>
        </div>
        <div className="stat-card stat-pending">
          <FileText size={18} />
          <div>
            <span className="stat-number">{pendingCount}</span>
            <span className="stat-label">Pending</span>
          </div>
        </div>
        <div className="stat-card stat-rejected">
          <XCircle size={18} />
          <div>
            <span className="stat-number">{rejectedCount}</span>
            <span className="stat-label">Rejected</span>
          </div>
        </div>
        <div className="stat-card stat-flagged">
          <AlertCircle size={18} />
          <div>
            <span className="stat-number">{flaggedCount}</span>
            <span className="stat-label">Flagged</span>
          </div>
        </div>
      </div>

      <div className="fields-table-container">
        <table className="fields-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Category</th>
              <th>Value</th>
              <th>Status</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {fields.map(field => {
              const verification = verifications[field.id]
              return (
                <tr key={field.id}>
                  <td style={{ fontWeight: 600, color: 'var(--navy)' }}>{field.id}</td>
                  <td>{field.category}</td>
                  <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{field.value}</td>
                  <td>
                    {verification ? (
                      <span className={`status-badge-light status-${verification.status}`}>
                        {verification.status === 'verified' && <CheckCircle size={10} />}
                        {verification.status === 'rejected' && <XCircle size={10} />}
                        {verification.status === 'flagged' && <AlertCircle size={10} />}
                        {verification.status}
                      </span>
                    ) : (
                      <span className="status-badge-light status-pending">pending</span>
                    )}
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {verification?.timestamp ? new Date(verification.timestamp).toLocaleTimeString() : '--'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {notes && (
        <div style={{ background: 'var(--bg-white)', borderRadius: 'var(--radius-md)', padding: 14, border: '1px solid var(--border)', marginBottom: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', marginBottom: 6 }}>Notes</h3>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{notes}</p>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button style={{ padding: '8px 20px', borderRadius: 'var(--radius)', fontSize: 13, fontWeight: 600, border: '1px solid var(--border)', background: 'var(--bg-white)', color: 'var(--text-primary)', cursor: 'pointer' }}>Export</button>
        <button style={{ padding: '8px 20px', borderRadius: 'var(--radius)', fontSize: 13, fontWeight: 600, border: 'none', background: 'var(--navy)', color: 'white', cursor: 'pointer' }}>Finalize</button>
      </div>
    </div>
  )
}

function getAllFields(actionPlan) {
  const fields = []
  if (!actionPlan) return fields
  Object.entries(actionPlan.case_identity || {}).forEach(([key, data]) => {
    fields.push({ id: `case_${key}`, category: 'Identity', value: data.value })
  })
  Object.entries(actionPlan.dates || {}).forEach(([key, data]) => {
    fields.push({ id: `date_${key}`, category: 'Dates', value: data.value })
  })
  if (actionPlan.verdict) {
    fields.push({ id: 'verdict', category: 'Verdict', value: actionPlan.verdict.value })
  }
  (actionPlan.operative_paragraphs || []).forEach((para, i) => {
    fields.push({ id: `op-${i}`, category: 'Operative', value: para.direction?.substring(0, 60) + '...' })
  })
  (actionPlan.action_plan?.compliance_tasks || []).forEach(task => {
    fields.push({ id: task.task_id, category: 'Compliance', value: task.description?.substring(0, 60) + '...' })
  })
  if (actionPlan.action_plan?.appeal_review) {
    fields.push({ id: 'appeal', category: 'Appeal', value: actionPlan.action_plan.appeal_review.limitation_period })
  }
  return fields
}

export default VerificationSummary
