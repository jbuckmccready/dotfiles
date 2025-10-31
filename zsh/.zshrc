## Fzf color scheme
export FZF_DEFAULT_OPTS=" \
--color=bg+:#313244,bg:#1e1e2e,spinner:#f5e0dc,hl:#f38ba8 \
--color=fg:#cdd6f4,header:#f38ba8,info:#cba6f7,pointer:#f5e0dc \
--color=marker:#b4befe,fg+:#cdd6f4,prompt:#cba6f7,hl+:#f38ba8 \
--color=selected-bg:#45475a \
--multi"

export EDITOR=nvim
# neovim for kubectl/k9s
export KUBE_EDITOR=nvim

export PATH="$HOME/.claude/skills/shortcut:$PATH"

export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"

export PATH="$HOME/.cargo/bin:$PATH"

export PATH="$HOME/bin:$PATH"

export GOPATH="$HOME/go"

export PATH="$HOME/go/bin:$PATH"

export PATH="$HOME/bin/clickhouse-server/usr/bin:$PATH"

export PATH="$HOME/bin/clickhouse-server/usr/local/bin:$PATH"

export PATH="/opt/homebrew/opt/node@22/bin:$PATH"

export GOROOT="/opt/homebrew/opt/go@1.24/libexec"

export PATH="/opt/homebrew/opt/go@1.24/libexec/bin:$PATH"

export PATH="/opt/homebrew/bin:$PATH"

. "$HOME/.local/bin/env"

# Execute fish if it's not the parent process.
if ! ps -p $PPID | grep -q fish; then
  fish
  # automatically exit zsh once fish exits
  exit
fi
