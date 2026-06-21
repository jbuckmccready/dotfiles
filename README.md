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

## Machine-Local Config

Some settings are machine-specific and not tracked in this repo. Git is configured to include `~/.gitconfig.local` for per-machine overrides (e.g., SSH signing key):

```sh
# ~/.gitconfig.local
[user]
	signingkey = key::ssh-ed25519 <your-key-here>
```

## Install Notes

### Neovim Plugins

**nvim-treesitter**:
Requires `tree-sitter` CLI to be installed:

```sh
cargo install --locked tree-sitter-cli
```

**snacks.nvim**:
Image preview in the file picker requires ImageMagick (`magick`/`identify`):

```sh
brew install imagemagick
```

### Fish

Dotfiles:

```sh
stow fish
```

Install:

```sh
# macOS
brew install fish

# Omarchy/Arch
omarchy pkg add fish
```

Do not change the account shell on Omarchy. Keep bash as the default shell and launch fish from Ghostty instead.

Init completions:

```sh
fish_update_completions
```

Install Fisher and plugins from `~/.config/fish/fish_plugins`:

```fish
curl -sL https://raw.githubusercontent.com/jorgebucaran/fisher/main/functions/fisher.fish | source
fisher install jorgebucaran/fisher
fisher update
```

Currently tracked fish plugins:

```text
jorgebucaran/fisher
jorgebucaran/hydro
```

### Tmux

Create the config directory before stowing so GNU Stow links `tmux.conf` into a real local directory. This keeps TPM plugins out of the dotfiles repo.

```sh
mkdir -p ~/.config/tmux
stow --no-folding tmux
```

Install TPM under the XDG tmux config directory:

```sh
mkdir -p ~/.config/tmux/plugins
git clone https://github.com/tmux-plugins/tpm ~/.config/tmux/plugins/tpm
```

Install plugins from inside tmux with prefix + I. The prefix is ctrl-a:

```sh
tmux
```

```text
ctrl-a I
```

#### Windows Terminal (WSL)

Windows Terminal doesn't natively send CSI-u key sequences for modified keys like Shift+Enter. To make Shift+Enter work correctly in Pi (for inserting newlines), add this keybinding to your Windows Terminal `settings.json` (`Ctrl+Shift+,`):

```json
{
  "command": {
    "action": "sendInput",
    "input": "\u001b[13;2u"
  },
  "keys": "shift+enter"
}
```

### Bat

```sh
stow bat
bat cache --build
```
