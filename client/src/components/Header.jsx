import './Header.css'
import Button from './Button'
import helpIcon from '../assets/help.svg'
import analyticsIcon from '../assets/analytics.svg'
import refreshIcon from '../assets/refresh.svg'

function Header({ onHelp, onRefresh, isSyncing }) {
  return (
    <header className="site-header">
      <div className="site-title">
        <img src="/favicon.svg" alt="Logo" className="site-logo" />
        Courses Aggregator
      </div>
      <div className="site-actions">
        <Button onClick={onRefresh} disabled={isSyncing}>
          <img src={refreshIcon} alt="Refresh" className="button-icon" />
          {isSyncing ? 'Refreshing…' : 'Refresh Courses'}
        </Button>
        <Button onClick={onHelp}>
          <img src={helpIcon} alt="Help" className="button-icon" />
          Help
        </Button>
        <Button>
          <img src={analyticsIcon} alt="Analytics" className="button-icon" />
          Analytics
        </Button>
      </div>
    </header>
  )
}

export default Header
