set -gx XDG_CONFIG_HOME $HOME/.config
fish_add_path --path /opt/homebrew/bin
fish_add_path --path $HOME/.cargo/bin
fish_add_path --path $HOME/bin
set -gx GOPATH $HOME/go
fish_add_path --path $HOME/go/bin
fish_add_path --path $HOME/bin/clickhouse-server/usr/bin
fish_add_path --path $HOME/bin/clickhouse-server/usr/local/bin
fish_add_path --path /Applications/Docker.app/Contents/Resources/bin
fish_add_path --path /opt/homebrew/opt/node@20/bin
set -gx GOROOT /opt/homebrew/opt/go@1.22/libexec
fish_add_path --path /opt/homebrew/opt/go@1.22/libexec/bin
