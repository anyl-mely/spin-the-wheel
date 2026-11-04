import { COLOR_PRESETS } from '../../utils/colors'

export default function StylesPanel({ onColorsChange, currentColors }) {
  const selectedIdx = COLOR_PRESETS.findIndex(
    (p) => JSON.stringify(p.colors) === JSON.stringify(currentColors)
  )
  const selected = selectedIdx >= 0 ? selectedIdx : 0

  const applyPreset = (preset) => {
    onColorsChange(preset.colors)
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
        Choose a color preset for the wheel segments.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {COLOR_PRESETS.map((preset, idx) => (
          <button
            key={preset.name}
            onClick={() => applyPreset(preset)}
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: `2px solid ${selected === idx ? '#ea4335' : '#e0e0e0'}`,
              background: '#fff',
              cursor: 'pointer',
              transition: 'border-color 0.15s',
            }}
          >
            <div style={{ display: 'flex', gap: 4, marginBottom: 6, justifyContent: 'center' }}>
              {preset.colors.map((c, i) => (
                <span
                  key={i}
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: c,
                    display: 'inline-block',
                  }}
                />
              ))}
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#333' }}>{preset.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

