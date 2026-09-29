import './Button.css'

function Button({ children, type = 'button', onClick, className = '', href, target, rel, disabled }) {
  const cls = ['ui-button', className].filter(Boolean).join(' ')
  const relValue = rel ?? (target === '_blank' ? 'noreferrer' : undefined)

  if (href) {
    return (
      <a href={href} target={target} rel={relValue} className={cls} onClick={onClick}>
        {children}
      </a>
    )
  }

  return (
    <button type={type} className={cls} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

export default Button
