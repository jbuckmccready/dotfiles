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
- tmux with tmux-resurrect and vim-tmux-navigator plugins
- neovim
- lazygit
- delta and difftastic for diffs

## Install Notes MacOS

### Fish

Dotfiles:

```sh
stow fish
```

Install:

```sh
brew install fish
```

Set default shell:

```sh
which fish
# /opt/homebrew/bin/fish
echo /opt/homebrew/bin/fish | sudo tee -a /etc/shells
chsh -s /opt/homebrew/bin/fish
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
