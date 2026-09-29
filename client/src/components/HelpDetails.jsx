import './HelpDetails.css'
import Button from './Button'

function HelpDetails({ open, onClose }) {
  if (!open) return null

  return (
    <div className="help-details-wrap">
      <div className="help-details-card">
        <h3 className="help-details-title">What this project is about</h3>
        <p className="help-details-text">
          This app aggregates online courses from multiple providers (e.g., Udemy, Coursera, edX) into a single catalog so you can search, filter, and inspect details quickly.
        </p>

        <div className="help-details-section">
          <strong>Key functions</strong>
          <ul>
            <li>Search courses by title or description.</li>
            <li>Filter by source, language, level, and category.</li>
            <li>Open course details with full descriptions, categories, keywords, and an external link.</li>
            <li>Fetches data from the backend API (/api) with pagination.</li>
          </ul>
        </div>

        <div className="help-details-section">
          <strong>Tips</strong>
          <ul>
            <li>Use the filters to narrow results, then click "View details" on a course.</li>
            <li>The course page button opens the provider site in a new tab.</li>
            <li>If data looks stale, refresh the page to refetch.</li>
          </ul>
        </div>

        <div className="help-details-actions">
          <Button
            href="https://github.com/AndronikC/ProjectDD"
            target="_blank"
            rel="noreferrer"
          >
            View project Repository on Github
          </Button>
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  )
}

export default HelpDetails
