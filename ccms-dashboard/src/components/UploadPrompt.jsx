import { useState, useRef } from 'react'
import { Upload, FileText, AlertCircle, Shield } from 'lucide-react'

function UploadPrompt({ onUpload, error }) {
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef(null)

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true) }
  const handleDragLeave = () => { setIsDragging(false) }
  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))) onUpload(file)
  }
  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (file) onUpload(file)
    e.target.value = ''
  }
  const handleClick = () => { fileInputRef.current?.click() }

  return (
    <div className="upload-container">
      <div className="upload-card">
        <div className="upload-tricolor-bar" />

        <div className="upload-card-header">
          <div className="upload-emblem-badge">
            <Shield size={22} />
          </div>
          <h1>Upload Court Judgment</h1>
          <p>Drop a PDF judgment to extract case details, operative orders, and generate a compliance action plan.</p>
        </div>

        <div className={`upload-zone ${isDragging ? 'dragging' : ''}`} onClick={handleClick} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
          <Upload size={32} strokeWidth={1.5} />
          <h3>Drop PDF here or click to upload</h3>
          <p>Supports court judgments in PDF format</p>
          <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" onChange={handleFileSelect} className="hidden-input" />
        </div>

        {error && (
          <div className="error-banner">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="upload-features">
          <div className="feature">
            <FileText size={16} />
            <span>Extracts case identity, verdict, and operative paragraphs</span>
          </div>
          <div className="feature">
            <FileText size={16} />
            <span>Generates compliance tasks with deadline tracking</span>
          </div>
          <div className="feature">
            <FileText size={16} />
            <span>Calculates appeal review timelines automatically</span>
          </div>
        </div>

        <div className="upload-tricolor-bar" />
      </div>
    </div>
  )
}

export default UploadPrompt
