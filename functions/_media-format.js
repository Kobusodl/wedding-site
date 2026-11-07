export const MEDIA_HEADER_BYTES = 4096;

const formats = {
  jpeg: { type: 'image', mime: 'image/jpeg', extensions: ['jpg', 'jpeg'], aliases: ['image/jpg', 'image/pjpeg'] },
  png: { type: 'image', mime: 'image/png', extensions: ['png'], aliases: ['image/x-png'] },
  webp: { type: 'image', mime: 'image/webp', extensions: ['webp'], aliases: [] },
  heic: { type: 'image', mime: 'image/heic', extensions: ['heic', 'heif'], aliases: ['image/heif', 'image/heic-sequence', 'image/heif-sequence'] },
  mp4: { type: 'video', mime: 'video/mp4', extensions: ['mp4'], aliases: ['application/mp4', 'video/x-m4v'] },
  mov: { type: 'video', mime: 'video/quicktime', extensions: ['mov'], aliases: ['video/x-quicktime'] }
};

const heicBrands = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs']);
const mp4Brands = new Set(['isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6', 'iso7', 'iso8', 'iso9', 'mp41', 'mp42', 'avc1', 'hvc1', 'hev1', 'M4V ', 'dash']);
const isoImageBrands = new Set(['mif1', 'mif2', 'msf1', 'avif', 'avis']);

function ascii(bytes, offset) {
  return String.fromCharCode(...bytes.subarray(offset, offset + 4));
}

function isoFormat(bytes, view, size) {
  // Inspect complete, bounded top-level boxes; don't search for brand text in arbitrary content.
  for (let offset = 0; offset + 8 <= bytes.length;) {
    const boxSize = view.getUint32(offset);
    const name = ascii(bytes, offset + 4);
    const end = offset + boxSize;
    if (boxSize < 8 || end + 8 > bytes.length || end + 8 > size) return null;
    if (name === 'ftyp') {
      if (boxSize < 16 || boxSize % 4 !== 0) return null;
      const major = ascii(bytes, offset + 8);
      const brands = [major];
      for (let i = offset + 16; i < end; i += 4) brands.push(ascii(bytes, i));
      if (major === 'avif' || major === 'avis') return null;
      if (brands.some((brand) => heicBrands.has(brand))) return formats.heic;
      if (isoImageBrands.has(major)) return null;
      if (major === 'qt  ') return formats.mov;
      if (brands.some((brand) => mp4Brands.has(brand))) return formats.mp4;
      if (brands.includes('qt  ')) return formats.mov;
      return null;
    }
    if (name !== 'free' && name !== 'wide' && name !== 'skip') return null;
    offset = end;
  }
  return null;
}

export function detectMediaFormat(header, size) {
  const bytes = new Uint8Array(header);
  if (bytes.length < 12) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jpegMarker = bytes[3];
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff &&
      (jpegMarker >= 0xc0 && jpegMarker <= 0xcf || jpegMarker === 0xdb ||
       jpegMarker === 0xdd || jpegMarker >= 0xe0 && jpegMarker <= 0xef || jpegMarker === 0xfe) &&
      view.getUint16(4) >= 2 && view.getUint16(4) + 6 < size) return formats.jpeg;

  if (bytes.length >= 33 && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a &&
      view.getUint32(8) === 13 && ascii(bytes, 12) === 'IHDR' &&
      view.getUint32(16) > 0 && view.getUint32(20) > 0) return formats.png;

  if (bytes.length >= 30 && ascii(bytes, 0) === 'RIFF' && ascii(bytes, 8) === 'WEBP' &&
      view.getUint32(4, true) + 8 === size) {
    const chunk = ascii(bytes, 12);
    const length = view.getUint32(16, true);
    if (length + 20 > size) return null;
    if (chunk === 'VP8 ' && length >= 10 && bytes[23] === 0x9d && bytes[24] === 1 && bytes[25] === 0x2a ||
        chunk === 'VP8L' && length >= 5 && bytes[20] === 0x2f ||
        chunk === 'VP8X' && length === 10) return formats.webp;
    return null;
  }
  return isoFormat(bytes, view, size);
}

export async function validateUploadFormat(file) {
  const header = await file.slice(0, MEDIA_HEADER_BYTES).arrayBuffer();
  const format = detectMediaFormat(header, file.size);
  const extension = /\.([a-z0-9]+)$/i.exec(file.name)?.[1].toLowerCase();
  const declaredMime = file.type.toLowerCase();
  if (!format || !format.extensions.includes(extension)) return null;
  if (declaredMime && declaredMime !== 'application/octet-stream' &&
      declaredMime !== format.mime && !format.aliases.includes(declaredMime)) return null;
  return format;
}
