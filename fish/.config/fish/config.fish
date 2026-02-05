
# Nothing to do if not running interactively
if not status is-interactive
	return 0
end

# Ghostty's shell integration
if test -n "$GHOSTTY_RESOURCES_DIR"
    source $GHOSTTY_RESOURCES_DIR/shell-integration/fish/vendor_conf.d/ghostty-shell-integration.fish
end

# Color scheme
fish_config theme choose "Catppuccin Mocha"

# Hydro prompt settings
set -g hydro_symbol_start \n
set -g hydro_color_pwd $fish_color_cwd
set -g hydro_color_prompt b4befe # catppuccin lavender
set -g hydro_color_git $fish_color_comment
set -g hydro_color_duration $fish_color_gray
set -g hydro_symbol_git_dirty "*"
set -g hydro_multiline true


abbr -a nv "nvim"
abbr -a ls "lsd"
abbr -a l 'lsd -l'
abbr -a la 'lsd -lA'
abbr -a lt 'lsd --tree'
abbr -a las 'lsd -lA --total-size'

# fzf connect to tmux session (really simple, using tmux prefix + T most of the time)
abbr -a fzfs 'sesh connect $(sesh list | fzf)'

# fzf open to edit in neovim
abbr -a fzfe "fzf --multi --bind 'enter:become(nvim {+})'"

# Launch lazygit with default config
abbr -a lg "lazygit"
# Launch lazygit with config setup to use difftastic
abbr -a lgt "lazygit --use-config-file ~/.config/lazygit/difftastic-config.yml"

# Remove the greeting message.
set -U fish_greeting

# zoxide integration
zoxide init fish | source
abbr -a cd "z"

# fzf shell integration
fzf --fish | source

# direnv integration
direnv hook fish | source
