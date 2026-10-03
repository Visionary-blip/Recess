"""Draws the app icons (pure Python, no dependencies): five silhouettes holding hands in a ring,
like ring around the rosie, in the app's colors on the dark purple background.
Run: python3 scripts/make-icons.py"""
import math, struct, zlib

BG = (0x1a, 0x10, 0x33)
COLORS = [(0xe8, 0x29, 0x4b), (0x1f, 0x6f, 0xeb), (0xf2, 0xb0, 0x1e), (0x1f, 0xa8, 0x55), (0x8a, 0x3f, 0xfc)]
SS = 3          # supersampling for smooth edges
RX, RY = 0.29, 0.17   # the ring seen at a slight angle: wide and shallow, so neighbors face sideways
F = 1.45              # figure size
CY = 0.50             # vertical center of the ring


def figures(scale):
    """Capsules (ax, ay, bx, by, radius, color) for the whole icon, back to front. scale shrinks it about the center."""
    def T(x, y):  # unit coords, shrunk about the canvas center
        return (0.5 + (x - 0.5) * scale, 0.5 + (y - 0.5) * scale)

    pos = []
    for k in range(5):
        a = math.radians(-90 + 72 * k)
        pos.append((0.5 + RX * math.cos(a), CY + RY * math.sin(a)))
    # Figures nearer the viewer (lower on the ring) are a little bigger.
    size = [F * (1 + 0.22 * (y - CY) / RY) for _, y in pos]
    shoulders = [(x, y - 0.03 * size[k]) for k, (x, y) in enumerate(pos)]

    out = []
    for k in sorted(range(5), key=lambda k: pos[k][1]):  # back to front
        x, y = pos[k]; f = size[k]; c = COLORS[k]
        sx, sy = shoulders[k]
        # Hands meet halfway between neighbors; each figure draws its own arm to that point.
        for other in ((k + 1) % 5, (k - 1) % 5):
            mx = (sx + shoulders[other][0]) / 2
            my = (sy + shoulders[other][1]) / 2 + 0.02 * f
            ax, ay = T(sx, sy); bx, by = T(mx, my)
            out.append((ax, ay, bx, by, 0.015 * f * scale, c))
        hx, hy = T(x, y - 0.085 * f)
        out.append((hx, hy, hx, hy, 0.047 * f * scale, c))
        t1 = T(x, y - 0.04 * f); t2 = T(x, y + 0.03 * f)
        out.append((*t1, *t2, 0.034 * f * scale, c))
        for dx in (-1, 1):
            l1 = T(x + dx * 0.016 * f, y + 0.035 * f); l2 = T(x + dx * 0.024 * f, y + 0.105 * f)
            out.append((*l1, *l2, 0.017 * f * scale, c))
    return out


def seg_dist2(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    l2 = dx * dx + dy * dy
    t = 0.0 if l2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / l2))
    qx, qy = ax + t * dx, ay + t * dy
    return (px - qx) ** 2 + (py - qy) ** 2


def render(size, scale):
    img = [[BG[0], BG[1], BG[2]] for _ in range(size * size)]
    for ax, ay, bx, by, r, col in figures(scale):
        x0 = max(0, int((min(ax, bx) - r) * size) - 1); x1 = min(size - 1, int((max(ax, bx) + r) * size) + 1)
        y0 = max(0, int((min(ay, by) - r) * size) - 1); y1 = min(size - 1, int((max(ay, by) + r) * size) + 1)
        r2 = r * r
        for py in range(y0, y1 + 1):
            for px in range(x0, x1 + 1):
                hit = 0
                for sy in range(SS):
                    for sx in range(SS):
                        x = (px + (sx + .5) / SS) / size
                        y = (py + (sy + .5) / SS) / size
                        if seg_dist2(x, y, ax, ay, bx, by) <= r2:
                            hit += 1
                if hit:
                    cov = hit / (SS * SS)
                    p = img[py * size + px]
                    p[0] += (col[0] - p[0]) * cov; p[1] += (col[1] - p[1]) * cov; p[2] += (col[2] - p[2]) * cov
    rows = []
    for py in range(size):
        line = bytearray([0])
        for px in range(size):
            p = img[py * size + px]
            line += bytes((round(p[0]), round(p[1]), round(p[2])))
        rows.append(bytes(line))
    return rows


def write_png(path, size, rows):
    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(b"".join(rows), 9)) + chunk(b"IEND", b"")
    open(path, "wb").write(png)


# "any" icons fill the canvas; maskable keeps everything inside the central safe zone (phones crop to a circle or squircle).
for name, size, scale in [
    ("icon-192.png", 192, 1.0), ("icon-512.png", 512, 1.0),
    ("icon-maskable-512.png", 512, 0.76), ("apple-touch-icon.png", 180, 0.94),
]:
    write_png(f"public/{name}", size, render(size, scale))
    print("wrote", name)
