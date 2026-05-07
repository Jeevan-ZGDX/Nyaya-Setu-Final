const API_BASE = import.meta.env.VITE_API_URL || ''

export async function analyzeJudgment(file) {
  const formData = new FormData()
  formData.append('file', file)

  let response
  try {
    response = await fetch(`${API_BASE}/api/analyze-judgment`, {
      method: 'POST',
      body: formData,
    })
  } catch (networkError) {
    throw new Error(`Backend unreachable: ${networkError.message}. Ensure the server is running on port 8000.`)
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: null }))
    const detail = errorData.detail
    if (detail) {
      throw new Error(detail)
    }
    throw new Error(`Analysis failed (HTTP ${response.status})`)
  }

  return response.json()
}

export async function healthCheck() {
  const response = await fetch(`${API_BASE}/api/health`)
  if (!response.ok) throw new Error('Backend unreachable')
  return response.json()
}
