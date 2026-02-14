function pp --description "Paste files/directories from persistent clipboard"
    argparse s/sudo -- $argv
    or return

    set -l use_sudo 0
    if set -q _flag_sudo
        set use_sudo 1
    end

    # Optional destination directory (default: current directory)
    set -l target_dir .
    if test (count $argv) -ge 1
        set target_dir $argv[1]
        if not test -d $target_dir
            mkdir -p $target_dir
            or begin
                echo "pp: failed to create directory: $target_dir" >&2
                return 1
            end
        end
    end

    set -l clip_dir ~/.local/share/file-clipboard
    set -l entries_file $clip_dir/entries
    set -l mode_file $clip_dir/mode

    if not test -f $entries_file
        echo "pp: clipboard is empty" >&2
        return 1
    end

    set -l paths (cat $entries_file)
    if test (count $paths) -eq 0
        echo "pp: clipboard is empty" >&2
        return 1
    end

    set -l mode copy
    if test -f $mode_file
        set mode (cat $mode_file)
    end

    # Validate all sources exist before doing anything
    for src in $paths
        if not test -e $src
            echo "pp: source no longer exists: $src" >&2
            return 1
        end
    end

    set -l failed 0
    for src in $paths
        set -l basename (basename $src)
        set -l dest $target_dir/$basename

        # Handle name collisions
        if test -e $dest
            set -l base (string replace -r '\.[^.]+$' '' $basename)
            set -l ext (string match -r '\.[^.]+$' $basename)
            set -l i 1
            while test -e $dest
                set dest $target_dir/{$base}_$i"$ext"
                set i (math $i + 1)
            end
            echo "pp: '$basename' exists, saving as '$(basename $dest)'"
        end

        set -l cmd
        if test $mode = cut
            set cmd mv $src $dest
        else
            set cmd cp -R $src $dest
        end

        if test $use_sudo -eq 1
            if not sudo $cmd
                set failed (math $failed + 1)
            end
        else
            if not $cmd
                set failed (math $failed + 1)
            end
        end
    end

    set -l count (count $paths)
    set -l action (test $mode = cut && echo "Moved" || echo "Copied")
    set -l abs_target (realpath $target_dir)
    echo "$action $count item"(test $count -gt 1 && echo "s" || echo "")" to $abs_target"
    for src in $paths[1..100]
        echo "  $(basename $src) from $(dirname $src)"
    end
    if test $count -gt 100
        echo "  ... and "(math $count - 100)" more"
    end

    # Clear clipboard after cut-paste (source is gone)
    if test $mode = cut
        rm -f $entries_file $mode_file
    end

    if test $failed -gt 0
        return 1
    end
end
