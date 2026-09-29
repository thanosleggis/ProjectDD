import { useEffect, useState } from 'react'
import './CourseList.css'
import Button from './Button'
import detailsIcon from '../assets/details.svg'

function CourseList({ courses, onViewDetails, query = '', filters, refreshKey = 0 }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const limit = 10

  useEffect(() => {
    setPage(1)
  }, [query, filters])

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages))
  }, [totalPages])

  useEffect(() => {
    if (Array.isArray(courses)) {
      setItems(courses)
      return
    }

    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    })

    const q = (query ?? '').toString().trim()
    if (q) params.set('q', q)

    const languageId = filters?.languageId
    const levelId = filters?.levelId
    const sourceId = filters?.sourceId
    const categoryId = filters?.categoryId

    if (languageId) params.set('languageId', String(languageId))
    if (levelId) params.set('levelId', String(levelId))
    if (sourceId) params.set('sourceId', String(sourceId))
    if (categoryId) params.set('categoryId', String(categoryId))

    const controller = new AbortController()
    setLoading(true)
    setError('')

    fetch(`/api/courses?${params.toString()}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((payload) => {
        const nextTotalPages = Number(payload?.pagination?.totalPages ?? 1)
        setTotalPages(Number.isFinite(nextTotalPages) && nextTotalPages > 0 ? nextTotalPages : 1)

        const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : []
        setItems(
          rows.map((c) => ({
            id: c.id,
            title: c.title,
            description: c.short_description || c.description || 'No description available',
            source: c.source_name || c.source || '—',
            cluster_label: c.cluster_label,
            access_url: c.access_url
          }))
        )
      })
      .catch((e) => {
        if (e?.name === 'AbortError') return
        setError('Failed to load courses')
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [courses, query, filters, page, refreshKey])

  const handleView = (course) => {
    if (onViewDetails) onViewDetails(course)
  }

  return (
    <div className="course-list-wrap">
      <div className="course-list">
        {loading && <p className="course-desc">Loading...</p>}
        {!loading && error && <p className="course-desc">{error}</p>}
        {!loading && !error && items.length === 0 && <p className="course-desc">No courses found.</p>}

        {!loading && !error && items.map((c) => {
          const tagTerms = typeof c.cluster_label === 'string'
            ? c.cluster_label
                .split(',')
                .map((term) => term.trim())
                .filter(Boolean)
                .slice(0, 5)
            : [];

          return (
            <div key={c.id} className="course-card">
              <h3 className="course-title">{c.title}</h3>

              {tagTerms.length > 0 && (
                <div className="cluster-tags">
                  {tagTerms.map((term, i) => (
                    <span key={`${c.id}-cluster-${i}`} className="cluster-tag">
                      {term}
                    </span>
                  ))}
                </div>
              )}

              <p className="course-desc">{c.description}</p>
              <p className="course-source">Source: {c.source ?? '—'}</p>
              <div className="course-actions">
                <Button onClick={() => handleView(c)}>
                  <img src={detailsIcon} alt="Details" className="button-icon" />
                  View details
                </Button>
              </div>
            </div>
          );
        })}

        {!loading && !error && totalPages > 1 && (
          <div className="course-pagination">
            <Button onClick={() => setPage((p) => Math.max(1, p - 1))} type="button">
              Previous
            </Button>
            <span className="course-page-indicator">
              Page {page} / {totalPages}
            </span>
            <Button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} type="button">
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

export default CourseList
