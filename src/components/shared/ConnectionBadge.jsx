export default function ConnectionBadge({ status }) {
  const map = {
    connected:    { label: 'Live',         cls: 'conn-connected' },
    connecting:   { label: 'Connecting…',  cls: 'conn-connecting' },
    disconnected: { label: 'Offline',      cls: 'conn-disconnected' },
  }
  const { label, cls } = map[status] || map.disconnected

  return (
    <span className={`conn-badge ${cls}`}>
      <span className="conn-dot" />
      {label}
    </span>
  )
}

