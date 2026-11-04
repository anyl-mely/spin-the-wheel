import { useState } from 'react'
import { Shuffle, Plus, Trash2, Edit2, Check, X } from 'lucide-react'
import { getSegmentColor } from '../../utils/colors'

export default function EntriesList({
  participants,
  isAdmin,
  onAdd,
  onDelete,
  onRename,
  onShuffle,
  loading,
  colors,
}) {
  const [inputText, setInputText] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')

  const handleAdd = () => {
    const names = inputText
      .split('\n')
      .map((n) => n.trim())
      .filter((n) => n.length > 0)
    if (names.length === 0) return
    onAdd(names)
    setInputText('')
  }

  const startEdit = (p) => {
    setEditingId(p.id)
    setEditName(p.name)
  }

  const confirmEdit = () => {
    if (editName.trim()) onRename(editingId, editName.trim())
    setEditingId(null)
  }

  return (
    <div>
      <div className="entries-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Entries</span>
          <span className="entries-count">{participants.length}</span>
        </div>
        {isAdmin && (
          <button className="btn-shuffle" onClick={onShuffle} disabled={loading}>
            <Shuffle size={14} />
            Shuffle
          </button>
        )}
      </div>

      <ul className="entries-list">
        {participants.map((p, i) => (
          <li key={p.id} className="entry-item">
            <span
              className="entry-dot"
              style={{ background: getSegmentColor(i, colors) }}
            />
            {editingId === p.id ? (
              <>
                <input
                  className="form-input"
                  style={{ padding: '4px 8px', height: 30, fontSize: 13 }}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') confirmEdit() }}
                  autoFocus
                />
                <button className="entry-action-btn" onClick={confirmEdit} title="Save">
                  <Check size={14} />
                </button>
                <button className="entry-action-btn" onClick={() => setEditingId(null)} title="Cancel">
                  <X size={14} />
                </button>
              </>
            ) : (
              <>
                <span className="entry-name">{p.name}</span>
                {isAdmin && (
                  <span className="entry-actions">
                    <button className="entry-action-btn" onClick={() => startEdit(p)} title="Edit">
                      <Edit2 size={13} />
                    </button>
                    <button
                      className="entry-action-btn delete"
                      onClick={() => onDelete(p.id)}
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  </span>
                )}
              </>
            )}
          </li>
        ))}
        {participants.length === 0 && (
          <li style={{ padding: '12px 0', color: '#999', fontSize: 13, textAlign: 'center' }}>
            No entries yet
          </li>
        )}
      </ul>

      {isAdmin && (
        <div className="add-name-form">
          <textarea
            className="add-name-textarea"
            placeholder="Add names (one per line)&#10;Emma&#10;Daniel&#10;Maria"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
          <p className="add-name-hint">One name per line. Duplicates allowed.</p>
          <button
            className="btn-add-names"
            onClick={handleAdd}
            disabled={!inputText.trim() || loading}
          >
            <Plus size={15} style={{ display: 'inline', marginRight: 6 }} />
            Add Names
          </button>
        </div>
      )}
    </div>
  )
}

