# Draws the app icon (build/icon.png, 1024x1024): a pixel-art "S" on a dark rounded tile.
import struct, zlib, os

N = 1024
INSET, RADIUS = 100, 185
BG_TOP, BG_BOTTOM = (40, 44, 58), (20, 21, 26)
FACE, SHADOW, SHINE = (108, 140, 255), (52, 66, 150), (190, 205, 255)
S = [
    "..######..",
    ".########.",
    "###....###",
    "###.......",
    ".#######..",
    "..#######.",
    ".......###",
    "###....###",
    ".########.",
    "..######..",
]
CELL = 56
GRID = len(S) * CELL
OX = OY = (N - GRID) // 2 - CELL // 4

def filled(gx, gy):
    return 0 <= gy < len(S) and 0 <= gx < len(S[0]) and S[gy][gx] == '#'

def inside_tile(x, y):
    lo, hi = INSET, N - INSET
    if not (lo <= x < hi and lo <= y < hi):
        return False
    cx = min(max(x, lo + RADIUS), hi - RADIUS)
    cy = min(max(y, lo + RADIUS), hi - RADIUS)
    return (x - cx) ** 2 + (y - cy) ** 2 <= RADIUS ** 2

rows = []
for y in range(N):
    row = bytearray([0])
    t = (y - INSET) / (N - 2 * INSET)
    bg = tuple(int(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * min(max(t, 0), 1)) for i in range(3))
    for x in range(N):
        if not inside_tile(x, y):
            row += bytes(4)
            continue
        gx, gy = (x - OX) // CELL, (y - OY) // CELL
        sx, sy = (x - OX - CELL // 2) // CELL, (y - OY - CELL // 2) // CELL
        if x >= OX and y >= OY and filled(gx, gy):
            lx, ly = (x - OX) % CELL, (y - OY) % CELL
            # A bright pixel-corner highlight on blocks with open space above-left.
            shine = lx < CELL // 3 and ly < CELL // 3 and not filled(gx - 1, gy) and not filled(gx, gy - 1)
            color = SHINE if shine else FACE
        elif x >= OX + CELL // 2 and y >= OY + CELL // 2 and filled(sx, sy):
            color = SHADOW  # drop shadow, offset by half a block
        else:
            color = bg
        row += bytes((*color, 255))
    rows.append(bytes(row))

def chunk(tag, data):
    return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

out = os.path.join(os.path.dirname(__file__), '..', 'build', 'icon.png')
with open(out, 'wb') as f:
    f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', N, N, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(b''.join(rows), 9)) + chunk(b'IEND', b''))
print('wrote', os.path.normpath(out))
