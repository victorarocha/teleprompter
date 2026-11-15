import { deflateSync } from "node:zlib"
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"

function crc32(buffer) {
  let crc = ~0
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return ~crc >>> 0
}

function chunk(type, data) {
  const name = Buffer.from(type)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])))
  return Buffer.concat([length, name, data, checksum])
}

function icon(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  const margin = Math.round(size * 0.18)
  const lineXs = [margin + size * 0.1, size - margin - size * 0.1]
  const lineYs = [0.4, 0.52, 0.64]
  const thickness = Math.max(2, Math.round(size * 0.018))
  const readingY = margin + Math.round((size - margin * 2) * 0.24)

  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1)
    raw[row] = 0
    for (let x = 0; x < size; x += 1) {
      const pixel = row + 1 + x * 4
      let red = 0
      let green = 0
      let blue = 0
      const inside =
        x >= margin && x < size - margin && y >= margin && y < size - margin
      if (inside) {
        red = green = blue = 14
        for (const ratio of lineYs) {
          const lineY = Math.round(size * ratio)
          if (
            Math.abs(y - lineY) <= thickness &&
            x >= lineXs[0] &&
            x <= lineXs[1]
          ) {
            red = green = blue = 255
          }
        }
        if (Math.abs(y - readingY) <= Math.max(1, Math.round(thickness / 2))) {
          red = 255
          green = 255
          blue = 255
        }
      }
      raw[pixel] = red
      raw[pixel + 1] = green
      raw[pixel + 2] = blue
      raw[pixel + 3] = 255
    }
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8
  header[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

const directory = path.join(process.cwd(), "public", "icons")
mkdirSync(directory, { recursive: true })
writeFileSync(path.join(directory, "icon-192.png"), icon(192))
writeFileSync(path.join(directory, "icon-512.png"), icon(512))
