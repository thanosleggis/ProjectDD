import './Searchbar.css'
import searchIcon from '../assets/search.svg'

function Searchbar({ value = '', onChange }) {
  return (
    <div className="searchbar-wrap">
      <div className="searchbar-inner">
        <img src={searchIcon} alt="Search" className="search-icon" />
        <input
          className="searchbar-input"
          type="text"
          placeholder="Search courses..."
          aria-label="Search courses"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
        />
      </div>
    </div>
  )
}

export default Searchbar
