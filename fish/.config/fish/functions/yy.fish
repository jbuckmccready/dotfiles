function yy --description "Yank (copy) files/directories to persistent clipboard"
    set -l clip_dir ~/.local/share/file-clipboard
    mkdir -p $clip_dir

    if test (count $argv) -eq 0
        echo "Usage: yy <file|dir> ..."
        return 1
    end

    # Resolve to absolute paths and validate
    set -l paths
    for f in $argv
        if not test -e $f
            echo "yy: '$f' does not exist" >&2
            return 1
        end
        set -a paths (realpath $f)
    end

    # Write paths to clipboard
    printf '%s\n' $paths >$clip_dir/entries
    echo copy >$clip_dir/mode

    set -l count (count $paths)
    echo "Yanked $count item"(test $count -gt 1 && echo "s" || echo "")" (copy)"
    for p in $paths[1..100]
        echo "  $p"
    end
    if test $count -gt 100
        echo "  ... and "(math $count - 100)" more"
    end
end
