"""Fail when POP Pro's medication tables drift from the Script Navigator's.

The navigator owns MEDS and MED_FOR. The Product Wizard already enforces this against
the same file; POP Pro is the third copy and needs the same guard, or a medication added
to the navigator quietly stops lifting its condition here.
"""
import re
import sys


def block(src, name):
    m = re.search(r"\b(?:var|const|let)\s+%s\s*=\s*" % name, src)
    if not m:
        return None
    i = m.end()
    depth = 0
    j = i
    while j < len(src):
        if src[j] in "{[":
            depth += 1
        elif src[j] in "}]":
            depth -= 1
            if depth == 0:
                break
        j += 1
    return re.sub(r"\s+", "", src[i:j + 1])


def main():
    nav = open(sys.argv[1], encoding="utf-8").read()
    pop = open(sys.argv[2], encoding="utf-8").read()
    bad = 0
    for name in ("MEDS", "MED_FOR"):
        a, b = block(nav, name), block(pop, name)
        if a is None:
            print("parity: %s missing from the navigator" % name); bad = 1; continue
        if b is None:
            print("parity: %s missing from POP Pro" % name); bad = 1; continue
        if a != b:
            print("parity: %s DIFFERS from the navigator (%d vs %d chars)."
                  % (name, len(a), len(b)))
            print("        Edit the navigator, then re-run the port. Never edit it here.")
            bad = 1
        else:
            print("parity: %-8s matches the navigator (%d chars)" % (name, len(a)))
    sys.exit(bad)


if __name__ == "__main__":
    main()
