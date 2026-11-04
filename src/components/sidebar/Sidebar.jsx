import { useState } from 'react'
import EntriesList from './EntriesList'
import StylesPanel from './StylesPanel'
import '../../styles/sidebar.css'

const TABS = ['Entries', 'Styles', 'Rules']

export default function Sidebar({
  participants,
  isAdmin,
  onAdd,
  onDelete,
  onRename,
  onShuffle,
  rules,
  onRuleAdd,
  onRuleDelete,
  onRuleToggle,
  loading,
  spinHistory,
  colors,
  onColorsChange,
}) {
  const [activeTab, setActiveTab] = useState('Entries')

  return (
    <div className="sidebar">
      <div className="sidebar-tabs">
        {TABS.map((tab) => (
          <button
            key={tab}
            className={`sidebar-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="sidebar-content">
        {activeTab === 'Entries' && (
          <EntriesList
            participants={participants}
            isAdmin={isAdmin}
            onAdd={onAdd}
            onDelete={onDelete}
            onRename={onRename}
            onShuffle={onShuffle}
            loading={loading}
            colors={colors}
          />
        )}
        {activeTab === 'Styles' && (
          <StylesPanel onColorsChange={onColorsChange} currentColors={colors} />
        )}
        {activeTab === 'Rules' && isAdmin && (
          <RulesTab
            rules={rules}
            participants={participants}
            onAdd={onRuleAdd}
            onDelete={onRuleDelete}
            onToggle={onRuleToggle}
          />
        )}
        {activeTab === 'Rules' && !isAdmin && (
          <div className="empty-state">
            <p>Rules are only visible to admin.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function RulesTab({ rules, participants, onAdd, onDelete, onToggle }) {
  const [spinNum, setSpinNum] = useState('')
  const [participantId, setParticipantId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleAdd = async () => {
    const num = parseInt(spinNum, 10)
    if (!num || num < 1) { setError('Enter a valid spin number ≥ 1'); return }
    if (!participantId) { setError('Select a winner'); return }
    setSaving(true)
    setError('')
    try {
      await onAdd(num, participantId)
      setSpinNum('')
      setParticipantId('')
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
        Set fixed winners for specific spin numbers.
      </p>

      {/* Add rule form */}
      <div style={{ background: '#f9f9f9', borderRadius: 12, padding: 14, marginBottom: 16 }}>
        <div className="form-group">
          <label className="form-label">Spin number</label>
          <input
            type="number"
            min="1"
            className="form-input"
            placeholder="e.g. 2"
            value={spinNum}
            onChange={(e) => setSpinNum(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Fixed winner</label>
          <select
            className="form-input"
            value={participantId}
            onChange={(e) => setParticipantId(e.target.value)}
          >
            <option value="">Select a participant…</option>
            {participants.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        <button className="btn-primary" onClick={handleAdd} disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
          {saving ? 'Saving…' : '+ Add Rule'}
        </button>
      </div>

      {/* Rule list */}
      {rules.length === 0 ? (
        <p style={{ fontSize: 13, color: '#999', textAlign: 'center' }}>No rules set</p>
      ) : (
        rules.map((rule) => (
          <div key={rule.id} className="rule-item" style={{ opacity: rule.is_active ? 1 : 0.5 }}>
            <span className="rule-spin-num">#{rule.spin_number}</span>
            <span className="rule-name">{rule.participants?.name || '?'}</span>
            <span className="rule-badge">Fixed</span>
            <button
              className="entry-action-btn"
              onClick={() => onToggle(rule.id, !rule.is_active)}
              title={rule.is_active ? 'Disable' : 'Enable'}
              style={{ fontSize: 14 }}
            >
              {rule.is_active ? '✓' : '○'}
            </button>
            <button
              className="entry-action-btn delete"
              onClick={() => onDelete(rule.id)}
              title="Delete rule"
            >
              <span style={{ fontSize: 14 }}>×</span>
            </button>
          </div>
        ))
      )}
    </div>
  )
}

