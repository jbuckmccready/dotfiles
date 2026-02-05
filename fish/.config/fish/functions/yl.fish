function yl --description "List files/directories in persistent clipboard"
    set -l clip_dir ~/.local/share/file-clipboard
    set -l entries_file $clip_dir/entries
    set -l mode_file $clip_dir/mode

    if not test -f $entries_file
        echo "Clipboard is empty"
        return 0
    end

    set -l paths (cat $entries_file)
    if test (count $paths) -eq 0
        echo "Clipboard is empty"
        return 0
    end

    set -l mode copy
    if test -f $mode_file
        set mode (cat $mode_file)
    end

    echo "Clipboard ($mode):"
    for p in $paths
        if test -e $p
            echo "  $p"
        else
            echo "  $p (missing!)"
        end
    end
end
