import { useState } from 'react'
import Header from './components/Header'
import Searchbar from './components/Searchbar'
import Filter from './components/Filter'
import CourseList from './components/CourseList'
import CourseDetails from './components/CourseDetails'
import HelpDetails from './components/HelpDetails'
import SyncStatus from './components/SyncStatus'
import SyncModePrompt from './components/SyncModePrompt'

function App() {
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState({
    languageId: '',
    levelId: '',
    sourceId: '',
    categoryId: '',
  })

  const [refreshKey, setRefreshKey] = useState(0)

  const [selectedCourse, setSelectedCourse] = useState(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsError, setDetailsError] = useState('')
  const [showHelp, setShowHelp] = useState(false)
  const [syncStatus, setSyncStatus] = useState(null)
  const [showSyncPrompt, setShowSyncPrompt] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)

  const handleViewDetails = (course) => {
    if (!course?.id) return
    setDetailsLoading(true)
    setDetailsError('')
    setSelectedCourse(null)

    fetch(`/api/courses/${course.id}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data) => {
        setSelectedCourse(data)
      })
      .catch((e) => {
        setDetailsError('Failed to load course details')
      })
      .finally(() => setDetailsLoading(false))
  }

  const handleCloseDetails = () => {
    setSelectedCourse(null)
    setDetailsError('')
    setDetailsLoading(false)
  }

  const handleOpenHelp = () => setShowHelp(true)
  const handleCloseHelp = () => setShowHelp(false)
  const runSync = (mode) => {
    const modeLabel = mode === 'demo' ? 'DEMO CSV' : 'REAL API'
    const scriptName = mode === 'demo' ? 'harvester_demo_csv.py' : 'harvester.py'
    console.log(`[Sync] Starting sync in mode="${mode}" using script ${scriptName}`)
    setIsSyncing(true)
    setSyncStatus({ type: 'info', message: `Εκκίνηση συγχρονισμού μαθημάτων (${modeLabel})…` })
    const controller = new AbortController()
    const timeoutMs = 5 * 60 * 1000 // 5 λεπτά
    const timeoutId = setTimeout(() => {
      console.warn('[Sync] Aborting sync due to timeout')
      controller.abort()
    }, timeoutMs)

    fetch(`/api/sync?mode=${encodeURIComponent(mode)}`, { method: 'POST', signal: controller.signal })
      .then(async (r) => {
        const payload = await r.json().catch(() => null)
        if (!r.ok) {
          console.group('Sync failed')
          console.error('HTTP status:', r.status)
          console.error('Error payload:', payload)
          if (payload) {
            if (payload.harvestStdout) console.log('Harvester stdout:\n', payload.harvestStdout)
            if (payload.harvestStderr) console.warn('Harvester stderr:\n', payload.harvestStderr)
            if (payload.clusteringStdout) console.log('Clustering stdout:\n', payload.clusteringStdout)
            if (payload.clusteringStderr) console.warn('Clustering stderr:\n', payload.clusteringStderr)
            if (payload.similarityStdout) console.log('Similarity stdout:\n', payload.similarityStdout)
            if (payload.similarityStderr) console.warn('Similarity stderr:\n', payload.similarityStderr)
          }
          console.groupEnd()
          setSyncStatus({ type: 'error', message: 'Ο συγχρονισμός απέτυχε. Δες τα logs στην κονσόλα.' })
          throw new Error('Sync failed')
        }
        if (payload) {
          console.group('Sync succeeded')
          console.log('Sync message:', payload.message)
          if (payload.mode) console.log('Sync mode:', payload.mode)
          if (payload.harvestStdout) console.log('Harvester stdout:\n', payload.harvestStdout)
          if (payload.harvestStderr) console.warn('Harvester stderr:\n', payload.harvestStderr)
          if (payload.clusteringStdout) console.log('Clustering stdout:\n', payload.clusteringStdout)
          if (payload.clusteringStderr) console.warn('Clustering stderr:\n', payload.clusteringStderr)
          if (payload.similarityStdout) console.log('Similarity stdout:\n', payload.similarityStdout)
          if (payload.similarityStderr) console.warn('Similarity stderr:\n', payload.similarityStderr)
          console.groupEnd()

          const modeLabel = payload.mode === 'demo' ? 'DEMO (CSV)' : 'REAL API'
          setSyncStatus({
            type: 'success',
            message: `Ο συγχρονισμός ολοκληρώθηκε επιτυχώς με λειτουργία ${modeLabel}.`,
          })

          // Reload the page so the latest data and UI state are fully refreshed
          window.location.reload()
        }
      })
      .catch((err) => {
        if (err.name === 'AbortError') {
          console.error('Sync aborted after timeout', err)
          setSyncStatus({ type: 'error', message: 'Ο συγχρονισμός άργησε πολύ και ακυρώθηκε (timeout).' })
        } else {
          console.error('Refresh Courses network or parsing error', err)
          setSyncStatus({ type: 'error', message: 'Ο συγχρονισμός απέτυχε. Δες τα logs στην κονσόλα.' })
        }
      })
      .finally(() => {
        clearTimeout(timeoutId)
        setRefreshKey((k) => k + 1)
        setIsSyncing(false)
      })
  }

  const handleRefreshCourses = () => {
    setShowSyncPrompt(true)
  }

  const handleSelectSyncMode = (mode) => {
    setShowSyncPrompt(false)
    runSync(mode)
  }

  return (
    <>
      <Header onHelp={handleOpenHelp} onRefresh={handleRefreshCourses} isSyncing={isSyncing} />
      <main className="page-content">
        <SyncModePrompt open={showSyncPrompt} onSelect={handleSelectSyncMode} onCancel={() => setShowSyncPrompt(false)} />
        <SyncStatus status={syncStatus} />
        <Searchbar value={query} onChange={setQuery} />
        <Filter onChange={setFilters} />
        <h2 className="course-list-heading" style={{ textAlign: 'center' }}>
          Courses List
        </h2>
        <CourseList query={query} filters={filters} onViewDetails={handleViewDetails} refreshKey={refreshKey} />
        <CourseDetails
          course={selectedCourse}
          loading={detailsLoading}
          error={detailsError}
          onOpenCourse={handleViewDetails}
          onClose={handleCloseDetails}
        />
        <HelpDetails open={showHelp} onClose={handleCloseHelp} />
      </main>
    </>
  )
}

export default App
