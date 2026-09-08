//! ISO-BMFF helpers for crash-safe live recordings.
//!
//! Live FFmpeg output uses fragmented MP4 (`empty_moov`) so a killed encoder still
//! leaves a playable file. `+faststart` is avoided because it rewrites the whole
//! file at stop and can lose the trailer on a timeout.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

/// How far to walk from the start of the file looking for a movie header.
/// `empty_moov` writes `moov` immediately after `ftyp`, so a small window is enough.
const HEADER_SCAN_LIMIT: u64 = 2 * 1024 * 1024;

pub(crate) const RECORDING_MOVFLAGS: &str = "+frag_keyframe+empty_moov+default_base_moof";

/// Returns true when the file has an ISO-BMFF `moov` or `moof` box near the start.
/// Live recordings write `empty_moov` up front so a killed process still leaves a
/// playable file. Files that only have `ftyp` + `mdat` are treated as unplayable.
pub(crate) fn mp4_has_movie_header(path: &Path) -> bool {
    let Ok(file) = File::open(path) else {
        return false;
    };
    mp4_bytes_have_movie_header(file)
}

fn mp4_bytes_have_movie_header<R: Read + Seek>(mut reader: R) -> bool {
    let Ok(file_len) = reader.seek(SeekFrom::End(0)) else {
        return false;
    };
    if file_len < 8 {
        return false;
    }
    if reader.seek(SeekFrom::Start(0)).is_err() {
        return false;
    }

    let scan_limit = file_len.min(HEADER_SCAN_LIMIT);
    let mut offset = 0_u64;

    while offset + 8 <= scan_limit {
        if reader.seek(SeekFrom::Start(offset)).is_err() {
            return false;
        }

        let mut header = [0_u8; 8];
        if reader.read_exact(&mut header).is_err() {
            return false;
        }

        let mut box_size = u32::from_be_bytes([header[0], header[1], header[2], header[3]]) as u64;
        let box_type = &header[4..8];

        if box_size == 1 {
            let mut large_size = [0_u8; 8];
            if reader.read_exact(&mut large_size).is_err() {
                return false;
            }
            box_size = u64::from_be_bytes(large_size);
            if box_size < 16 {
                return false;
            }
        } else if box_size == 0 {
            box_size = file_len.saturating_sub(offset);
        } else if box_size < 8 {
            return false;
        }

        if box_type == b"moov" || box_type == b"moof" {
            return true;
        }

        let next_offset = offset.saturating_add(box_size);
        if next_offset <= offset {
            return false;
        }
        offset = next_offset;
    }

    false
}

#[cfg(test)]
mod tests {
    use super::{mp4_bytes_have_movie_header, RECORDING_MOVFLAGS};
    use std::io::Cursor;

    fn box_bytes(box_type: &[u8; 4], payload: &[u8]) -> Vec<u8> {
        let size = 8 + payload.len();
        let mut bytes = Vec::with_capacity(size);
        bytes.extend_from_slice(&(size as u32).to_be_bytes());
        bytes.extend_from_slice(box_type);
        bytes.extend_from_slice(payload);
        bytes
    }

    #[test]
    fn recording_movflags_are_fragmented_and_crash_safe() {
        assert!(RECORDING_MOVFLAGS.contains("empty_moov"));
        assert!(RECORDING_MOVFLAGS.contains("frag_keyframe"));
        assert!(!RECORDING_MOVFLAGS.contains("faststart"));
    }

    #[test]
    fn detects_empty_moov_after_ftyp() {
        let mut bytes = box_bytes(b"ftyp", b"isom");
        bytes.extend_from_slice(&box_bytes(b"moov", b""));
        bytes.extend_from_slice(&box_bytes(b"mdat", &[0, 1, 2, 3]));
        assert!(mp4_bytes_have_movie_header(Cursor::new(bytes)));
    }

    #[test]
    fn rejects_mdat_only_recording() {
        let mut bytes = box_bytes(b"ftyp", b"isomiso2avc1mp41");
        bytes.extend_from_slice(&box_bytes(b"mdat", &[0; 64]));
        assert!(!mp4_bytes_have_movie_header(Cursor::new(bytes)));
    }

    #[test]
    fn detects_moof_fragment() {
        let mut bytes = box_bytes(b"ftyp", b"isom");
        bytes.extend_from_slice(&box_bytes(b"moof", b""));
        bytes.extend_from_slice(&box_bytes(b"mdat", &[0, 1, 2, 3]));
        assert!(mp4_bytes_have_movie_header(Cursor::new(bytes)));
    }
}
