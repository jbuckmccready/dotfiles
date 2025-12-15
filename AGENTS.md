This repository uses [GNU Stow](https://www.gnu.org/software/stow/) to manage dotfiles via symlinks.

## How Stow Works

Each top-level directory in this repository represents a "package" that mirrors the structure of the home directory. When stowed, symlinks are created from the home directory pointing to files in this repository.

For example:

- `nvim/.config/nvim/init.lua` symlinks to `~/.config/nvim/init.lua`
- `git/.gitconfig` symlinks to `~/.gitconfig`
- `fish/.config/fish/config.fish` symlinks to `~/.config/fish/config.fish`

## Reading and Writing Files

**Always read and edit files within this repository, not the symlinked locations in the home directory.**

Even though config files appear to exist at their standard locations (e.g., `~/.config/nvim/init.lua`), the actual source files live here. Reading and writing within this repository ensures:

1. File permissions necessary for operation
2. Changes are tracked by git
3. The repository remains the single source of truth

When asked to modify configuration files, locate and edit them within this dotfiles directory structure rather than at their typical system paths.
