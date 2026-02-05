function yx --description "Cut files/directories to persistent clipboard (move on paste)"
    set -l clip_dir ~/.local/share/file-clipboard
    mkdir -p $clip_dir

    if test (count $argv) -eq 0
        echo "Usage: yx <file|dir> ..."
        return 1
    end

    # Resolve to absolute paths and validate
    set -l paths
    for f in $argv
        if not test -e $f
            echo "yx: '$f' does not exist" >&2
            return 1
        end
        set -a paths (realpath $f)
    end

    # Write paths to clipboard
    printf '%s\n' $paths >$clip_dir/entries
    echo cut >$clip_dir/mode

    set -l count (count $paths)
    echo "Yanked $count item"(test $count -gt 1 && echo "s" || echo "")" (cut)"
    for p in $paths[1..100]
        echo "  $p"
    end
    if test $count -gt 100
        echo "  ... and "(math $count - 100)" more"
    end
end
