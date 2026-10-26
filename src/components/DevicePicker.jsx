import { deviceName } from '../lib/media.js';

// Row of buttons to pick which speaker / mic to use. Hidden when there's only one.
export default function DevicePicker({ label, devices, value, onChange }) {
  if (devices.length < 2) return null;
  return (
    <div className="picker">
      <span className="eyebrow">{label}</span>
      <div className="picker-row">
        <button type="button" className={'btn' + (!value ? ' light' : '')} onClick={() => onChange('')}>System default</button>
        {devices.map((d, i) => (
          <button key={d.deviceId} type="button" className={'btn' + (value === d.deviceId ? ' light' : '')} onClick={() => onChange(d.deviceId)} title={d.label}>
            {deviceName(d, i).slice(0, 34)}
          </button>
        ))}
      </div>
    </div>
  );
}
