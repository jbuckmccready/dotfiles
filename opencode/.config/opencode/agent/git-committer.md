---
description: Performs git commits (allows git permissions)
mode: primary
permission:
  edit: deny
  bash:
    "git commit *": allow
    "git add *": allow
  webfetch: deny
---
