# setup environment variables and PATH
source $__fish_config_dir/environment.fish

if status is-interactive
    # Commands to run in interactive sessions can go here
end


# fzf open to edit in neovim
alias fzfe="fzf --multi --bind 'enter:become(nvim {+})'"

# Launch lazygit with default config
alias lg="lazygit"

# Launch lazygit with config setup to use difftastic
alias lgt="lazygit --use-config-file ~/.config/lazygit/difftastic-config.yml"

# Remove the greeting message.
set -U fish_greeting

# zoxide integration
zoxide init fish | source
alias cd="z"

# fzf shell integration
# fzf cattpuccin colors
set -gx FZF_DEFAULT_OPTS "\
--color=bg+:#313244,bg:#1e1e2e,spinner:#f5e0dc,hl:#f38ba8 \
--color=fg:#cdd6f4,header:#f38ba8,info:#cba6f7,pointer:#f5e0dc \
--color=marker:#b4befe,fg+:#cdd6f4,prompt:#cba6f7,hl+:#f38ba8 \
--color=selected-bg:#45475a \
--color=border:#313244,label:#cdd6f4"
fzf --fish | source

# Color scheme
fish_config theme choose "Catppuccin Mocha"

# neovim for kubectl/k9s
export KUBE_EDITOR=nvim
