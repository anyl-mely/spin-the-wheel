import { Trash2 } from 'lucide-react'

export default function SpinHistory({ history, isAdmin, onDeleteAll, loading }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>Spin History</span>
        {isAdmin && history.length > 0 && (
          <button
            className="entry-action-btn delete"
            onClick={onDeleteAll}
            disabled={loading}
            title="Clear history"
            style={{ width: 'auto', padding: '5px 10px', gap: 4, display: 'flex', alignItems: 'center' }}
          >
            <Trash2 size={13} />
            <span style={{ fontSize: 12, fontWeight: 600 }}>Clear</span>
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <p style={{ fontSize: 13, color: '#999', textAlign: 'center', padding: '16px 0' }}>
          No spins yet
        </p>
      ) : (
        <table className="history-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Winner</th>
              <th>Type</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.id}>
                <td style={{ fontWeight: 700, color: '#ea4335' }}>{h.spin_number}</td>
                <td style={{ fontWeight: 600 }}>{h.participants?.name || '?'}</td>
                <td>
                  <span
                    className={`spin-type-badge ${h.result_type === 'fixed' ? 'badge-fixed' : 'badge-random'}`}
                    style={{ padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700 }}
                  >
                    {h.result_type === 'fixed' ? 'Fixed' : 'Random'}
                  </span>
                </td>
                <td style={{ color: '#999', fontSize: 12 }}>
                  {new Date(h.created_at).toLocaleTimeString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

