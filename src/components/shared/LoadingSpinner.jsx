export default function LoadingSpinner({ fullscreen, size = 'md' }) {
  const cls = size === 'sm' ? 'spinner spinner-sm' : 'spinner'

  if (fullscreen) {
    return (
      <div className="loading-fullscreen">
        <div className={cls} />
      </div>
    )
  }
  return <div className={cls} />
}

