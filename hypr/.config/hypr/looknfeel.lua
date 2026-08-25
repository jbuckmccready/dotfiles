hl.config({
  general = {
    gaps_in = 0,
    gaps_out = 0,
  },

  animations = {
    enabled = false,
  },
})

-- Keep normal windows fully opaque.
o.window(
  { tag = "default-opacity" },
  { opacity = "1.0 override 1.0 override" }
)

-- Adjust terminal opacity.
o.window(
  { tag = "terminal" },
  { opacity = "0.97 override 0.9 override" }
)
