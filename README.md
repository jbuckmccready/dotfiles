## Summary

Dotfiles managed using [GNU stow](https://www.gnu.org/software/stow/)

## Usage

```sh
# each stow command will add symlink to file system according to path in the stow package
stow nvim
stow tmux
# etc., `stow {package}` for each one you want to install
```

## Tools Notes

- ghostty terminal with Zed Mono Nerd Font
- fzf (from shell and used by neovim plugins)
- ripgrep (also used from neovim)
- fd (also used from neovim)
- zoxide
- fish shell
- tmux with vim-tmux-navigator plugin
- neovim
- lazygit
- delta and difftastic for diffs

## Install Notes

### Neovim Plugins

**nvim-treesitter**:
Requires `tree-sitter` CLI to be installed:
```sh
cargo install --locked tree-sitter-cli
```


### Fish

Dotfiles:

```sh
stow fish
```

Install:

```sh
brew install fish
```

Set default shell (NOTE: using zsh for easier compatibility with some tools):

```sh
which zsh
# /bin/zsh
chsh -s /bin/zsh
```

Init completions:

```sh
fish_update_completions
```

Install Fisher:

```sh
curl -sL https://raw.githubusercontent.com/jorgebucaran/fisher/main/functions/fisher.fish | source && fisher install jorgebucaran/fisher
```

Install hydro prompt:

```sh
fisher install jorgebucaran/hydro
```

### Tmux

```sh
stow tmux
```

Follow instructions [here](https://github.com/tmux-plugins/tpm)

```sh
git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm
```

Install plugins (from in tmux run prefix + I):

```sh
tmux
ctrl-a I
```

### Bat

```sh
stow bat
bat cache --build
```
