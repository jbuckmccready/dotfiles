-- Launch or connect to a sesh session for the active terminal directory.
o.bind(
  "SUPER + ALT + RETURN",
  "Tmux",
  [[omarchy-launch-terminal fish -lic "sesh connect (pwd)"]]
)

-- Disable the default workspace layout toggle.
hl.unbind("SUPER + L")

-- Toggle dictation.
o.bind("F8", "Toggle dictation", "voxtype record toggle")
