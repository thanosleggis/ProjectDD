import { useEffect, useState } from 'react'
import './CourseDetails.css'
import Button from './Button'

function CourseDetails({ course, loading = false, error = '', onClose, onOpenCourse }) {
  const [similar, setSimilar] = useState([])
  const [similarLoading, setSimilarLoading] = useState(false)
  const [similarError, setSimilarError] = useState('')

  useEffect(() => {
    if (!course?.id) {
      setSimilar([])
      setSimilarLoading(false)
      setSimilarError('')
      return
    }

    const controller = new AbortController()
    setSimilarLoading(true)
    setSimilarError('')

    fetch(`/api/courses/${course.id}/similar`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((rows) => {
        const items = Array.isArray(rows) ? rows : []
        setSimilar(items)
      })
      .catch((e) => {
        if (e?.name === 'AbortError') return
        setSimilarError('Failed to load similar courses')
      })
      .finally(() => setSimilarLoading(false))

    return () => controller.abort()
  }, [course?.id])

  if (!loading && !course && !error) return null

  const clusterLabel = typeof course?.cluster_label === 'string' ? course.cluster_label : ''
  const clusterTags = clusterLabel
    .split(',')
    .map((term) => term.trim())
    .filter(Boolean)
    .slice(0, 5)

  return (
    <div className="course-details-wrap">
      <div className="course-details-card">
        {loading && <p className="course-details-text">Loading course details...</p>}
        {!loading && error && <p className="course-details-text error">{error}</p>}

        {!loading && !error && course && (
          <>
            <h3 className="course-details-title">{course.title}</h3>
            {clusterTags.length > 0 && (
              <div className="cluster-tags" style={{ marginBottom: '8px' }}>
                {clusterTags.map((term, i) => (
                  <span key={`details-cluster-${i}`} className="cluster-tag">
                    {term}
                  </span>
                ))}
              </div>
            )}
            <p className="course-details-text">{course.short_description || course.full_description || course.description}</p>

            <div className="course-details-meta">
              <span><strong>Source:</strong> {course.source_name || course.source || '—'}</span>
              <span><strong>Language:</strong> {course.language_name || '—'}</span>
              <span><strong>Level:</strong> {course.level_name || '—'}</span>
            </div>

            <div className="course-details-list">
              <strong>Similar Courses:</strong>
              {similarLoading && <p className="course-details-text">Loading similar courses...</p>}
              {!similarLoading && similarError && (
                <p className="course-details-text error">{similarError}</p>
              )}
              {!similarLoading && !similarError && similar.length === 0 && (
                <p className="course-details-text">No similar courses found.</p>
              )}
              {!similarLoading && !similarError && similar.length > 0 && (
                <ul>
                  {similar.map((s) => (
                    <li key={s.id}>
                      <div className="course-similar-item">
                        <span
                          className="course-similar-title"
                          onClick={() => onOpenCourse && onOpenCourse(s)}
                        >
                          {s.title}
                        </span>
                        
                        {typeof s.score === 'number' && (
                          <span className="course-similar-score" style={{ marginLeft: '10px', color: '#28a745', fontWeight: 'bold' }}>
                            { (s.score * 100).toFixed(1) }% Match
                          </span>
                        )}
                        
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {(course?.access_url || onClose) && (
          <div className="course-details-actions">
            {course?.access_url && (
              <Button
                href={course.access_url}
                target="_blank"
                rel="noreferrer"
                type="button"
              >
                Visit course page
              </Button>
            )}

            {onClose && (
              <Button onClick={onClose} type="button">
                Close
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default CourseDetails
