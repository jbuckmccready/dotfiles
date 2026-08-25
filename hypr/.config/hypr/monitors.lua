-- Keep these names so Omarchy's display-scaling commands can update them.
local omarchy_gdk_scale = 1
local omarchy_monitor_scale = 1

hl.env("GDK_SCALE", tostring(omarchy_gdk_scale))
hl.monitor({
  output = "",
  mode = "3440x1440@160",
  position = "auto",
  scale = omarchy_monitor_scale,
})
