if not contains "$HOME/Downloads/Antigravity/.tools/bin" $PATH
    # Prepending path in case a system-installed binary needs to be overridden
    set -x PATH "$HOME/Downloads/Antigravity/.tools/bin" $PATH
end
