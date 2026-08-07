function pi --wraps pi
    set -lx TMPDIR $PI_HOST_TMPDIR
    command pi $argv
end
