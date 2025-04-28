autoload -Uz compinit
compinit

# zoxide setup
eval "$(zoxide init zsh)"
alias cd="z"

# Set up fzf key bindings and fuzzy completion
export FZF_DEFAULT_OPTS=" \
--color=bg+:#313244,bg:#1e1e2e,spinner:#f5e0dc,hl:#f38ba8 \
--color=fg:#cdd6f4,header:#f38ba8,info:#cba6f7,pointer:#f5e0dc \
--color=marker:#b4befe,fg+:#cdd6f4,prompt:#cba6f7,hl+:#f38ba8 \
--color=selected-bg:#45475a \
--multi"
source <(fzf --zsh)

# added for ls colors on macos
export CLICOLOR=1

# init oh my posh prompt
if [ "$TERM_PROGRAM" != "Apple_Terminal" ]; then
  eval "$(oh-my-posh init zsh --config ~/.config/ohmyposh/zen.toml)"
fi

# fzf open to edit in neovim
alias fzfe="fzf --multi --bind 'enter:become(nvim {+})'"

# Launch lazygit with default config
alias lg="lazygit"

# Launch lazygit with config setup to use difftastic
alias lgt="lazygit --use-config-file ~/.config/lazygit/difftastic-config.yml"

export PATH="/opt/homebrew/bin:$PATH"

export PATH="$HOME/.cargo/bin:$PATH"

export PATH="$HOME/bin:$PATH"

export GOPATH="$HOME/go"

export PATH="$HOME/go/bin:$PATH"

export PATH="$HOME/bin/clickhouse-server/usr/bin:$PATH"

export PATH="$HOME/bin/clickhouse-server/usr/local/bin:$PATH"

export GOROOT="/opt/homebrew/opt/go@1.20/libexec"

export PATH="/opt/homebrew/opt/go@1.20/libexec/bin:$PATH"

export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
