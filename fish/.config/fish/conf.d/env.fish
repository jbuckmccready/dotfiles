set -gx EDITOR nvim
set -gx KUBE_EDITOR nvim
set -gx SUDO_EDITOR $EDITOR
set -gx MANROFFOPT -c
set -gx MANPAGER "sh -c 'col -bx | bat -l man -p'"

set -gx GOPATH $HOME/go

set -gx FZF_DEFAULT_OPTS "--color=bg+:#313244,bg:#1e1e2e,spinner:#f5e0dc,hl:#f38ba8 --color=fg:#cdd6f4,header:#f38ba8,info:#cba6f7,pointer:#f5e0dc --color=marker:#b4befe,fg+:#cdd6f4,prompt:#cba6f7,hl+:#f38ba8 --color=selected-bg:#45475a --multi"

fish_add_path $HOME/.local/bin
fish_add_path $HOME/.cargo/bin
fish_add_path $HOME/bin
fish_add_path $GOPATH/bin

if test -d $HOME/.bun/bin
    fish_add_path $HOME/.bun/bin
end

if test -d $HOME/bin/clickhouse-server/usr/bin
    fish_add_path $HOME/bin/clickhouse-server/usr/bin
end

if test -d $HOME/bin/clickhouse-server/usr/local/bin
    fish_add_path $HOME/bin/clickhouse-server/usr/local/bin
end

switch (uname)
    case Darwin
        if test -d /Applications/Docker.app/Contents/Resources/bin
            fish_add_path /Applications/Docker.app/Contents/Resources/bin
        end

        if test -d /opt/homebrew/bin
            fish_add_path /opt/homebrew/bin
        end

        if test -d /opt/homebrew/opt/node@22/bin
            fish_add_path /opt/homebrew/opt/node@22/bin
        end

        if test -d /opt/homebrew/opt/go@1.24/libexec
            set -gx GOROOT /opt/homebrew/opt/go@1.24/libexec
            fish_add_path $GOROOT/bin
        end

        if test -d /opt/homebrew/opt/e2fsprogs/sbin
            fish_add_path /opt/homebrew/opt/e2fsprogs/sbin
        end

        if test -f $HOME/.local/bin/env.fish
            source $HOME/.local/bin/env.fish
        end
    case Linux
        if test -d $HOME/.local/share/omarchy
            set -gx OMARCHY_PATH $HOME/.local/share/omarchy
            fish_add_path $OMARCHY_PATH/bin
        end
end
