"""Draws the app icons (pure Python, no dependencies): the form's four colored
tiles on the dark purple background. Run: python3 scripts/make-icons.py"""
import struct, zlib

BG = (0x1a, 0x10, 0x33)
TILES = [(0xe8, 0x29, 0x4b), (0x1f, 0x6f, 0xeb), (0xf2, 0xb0, 0x1e), (0x1f, 0xa8, 0x55)]  # red blue yellow green
SS = 3  # supersampling for smooth corners


def inside_round_rect(x, y, x0, y0, x1, y1, r):
    if not (x0 <= x <= x1 and y0 <= y <= y1):
        return False
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def render(size, inset, full_bleed_bg=True):
    """inset = fraction of the canvas left empty around the tile grid."""
    pad = size * inset
    gap = size * 0.04
    tile = (size - 2 * pad - gap) / 2
    rad = tile * 0.22
    rects = []
    for i in range(4):
        col, row = i % 2, i // 2
        x0 = pad + col * (tile + gap)
        y0 = pad + row * (tile + gap)
        rects.append((x0, y0, x0 + tile, y0 + tile))
    rows = []
    for py in range(size):
        line = bytearray([0])
        for px in range(size):
            acc = [0, 0, 0]
            for sy in range(SS):
                for sx in range(SS):
                    x = px + (sx + .5) / SS
                    y = py + (sy + .5) / SS
                    c = BG
                    for i, (x0, y0, x1, y1) in enumerate(rects):
                        if inside_round_rect(x, y, x0, y0, x1, y1, rad):
                            c = TILES[i]
                            break
                    acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]
            n = SS * SS
            line += bytes((acc[0] // n, acc[1] // n, acc[2] // n))
        rows.append(bytes(line))
    return rows


def write_png(path, size, rows):
    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(b"".join(rows), 9)) + chunk(b"IEND", b"")
    open(path, "wb").write(png)


# "any" icons use a modest margin; maskable keeps everything inside the central 80% safe zone.
for name, size, inset in [
    ("icon-192.png", 192, 0.16), ("icon-512.png", 512, 0.16),
    ("icon-maskable-512.png", 512, 0.26), ("apple-touch-icon.png", 180, 0.20),
]:
    write_png(f"public/{name}", size, render(size, inset))
    print("wrote", name)
