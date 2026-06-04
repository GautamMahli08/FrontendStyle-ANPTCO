'use client';

/**
 * Clean iOS-style enable/disable switch.
 *
 * `enabled` is the "on" (active) state — track turns green.
 * When off, the track is gray. Optional text label sits to the right.
 */
export default function ToggleSwitch({
  enabled,
  onChange,
  disabled = false,
  size = 'md',
  label,
  className = '',
}: {
  enabled: boolean;
  onChange: () => void;
  /** Locks the control (cannot be toggled) and dims it. */
  disabled?: boolean;
  size?: 'sm' | 'md';
  /** Optional text shown beside the switch. */
  label?: string;
  className?: string;
}) {
  const dims =
    size === 'sm'
      ? { track: 'h-5 w-9', knob: 'h-3.5 w-3.5', on: 'translate-x-4', off: 'translate-x-1' }
      : { track: 'h-6 w-11', knob: 'h-4 w-4', on: 'translate-x-6', off: 'translate-x-1' };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onChange();
      }}
      className={`group inline-flex items-center gap-2 ${
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      } ${className}`}
    >
      <span
        className={`relative inline-flex ${dims.track} flex-shrink-0 items-center rounded-full transition-colors duration-200 ${
          enabled ? 'bg-emerald-500' : 'bg-gray-300'
        }`}
      >
        <span
          className={`inline-block ${dims.knob} transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
            enabled ? dims.on : dims.off
          }`}
        />
      </span>
      {label && (
        <span
          className={`text-sm font-medium ${
            enabled ? 'text-gray-700' : 'text-gray-400'
          }`}
        >
          {label}
        </span>
      )}
    </button>
  );
}
