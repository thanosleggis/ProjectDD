import Button from './Button'
import './SyncModePrompt.css'

function SyncModePrompt({ open, onSelect, onCancel }) {
  if (!open) return null

  return (
    <div className="sync-mode-backdrop">
      <div className="sync-mode-prompt">
        <div className="sync-mode-text">Επίλεξε τρόπο συγχρονισμού μαθημάτων:</div>
        <div className="sync-mode-actions">
          <Button className="sync-mode-button" onClick={() => onSelect('demo')}>
            DEMO CSV
          </Button>
          <Button className="sync-mode-button" onClick={() => onSelect('real')}>
            REAL API
          </Button>
          {onCancel && (
            <Button className="sync-mode-button sync-mode-cancel" onClick={onCancel}>
              Άκυρο
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export default SyncModePrompt
