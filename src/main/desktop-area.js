'use strict';

// Pure geometry so Dock/taskbar and mixed-display layouts can be checked without a GUI.
function desktopArea({ workArea, bounds }, rest, platform) {
  const resting = rest === 'taskbar'; // retain the existing configuration value
  const area = platform === 'darwin'
    // Menu bar and side Dock stay clear; extend below a bottom Dock's top only for resting.
    ? { ...workArea, ...(resting && { height: bounds.y + bounds.height - workArea.y }) }
    : resting ? { ...bounds, y: bounds.y + 1, height: bounds.height - 1 } : workArea;
  return { area, gap: area.y + area.height - (workArea.y + workArea.height) };
}

module.exports = { desktopArea };
