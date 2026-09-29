function SyncStatus({ status }) {
  if (!status || !status.message) return null

  const baseStyle = {
    marginTop: '8px',
    padding: '8px 12px',
    borderRadius: '6px',
    fontSize: '0.9rem',
    maxWidth: '960px',
    width: '100%',
  }

  const variants = {
    info: {
      backgroundColor: '#e7f1ff',
      color: '#1a3a6b',
      border: '1px solid #b3c8ff',
    },
    success: {
      backgroundColor: '#e6f4ea',
      color: '#1e4620',
      border: '1px solid #9fd8a5',
    },
    error: {
      backgroundColor: '#fdecea',
      color: '#611a15',
      border: '1px solid #f5b5ac',
    },
  }

  const variant = variants[status.type] || variants.info
  const style = { ...baseStyle, ...variant }

  return <div style={style}>{status.message}</div>
}

export default SyncStatus
