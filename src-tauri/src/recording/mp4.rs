//! ISO-BMFF helpers for crash-safe live recordings.
//!
//! Live FFmpeg output uses fragmented MP4 (`empty_moov`) so a killed encoder still
//! leaves a playable file. `+faststart` is avoided on the live encode because it
//! rewrites the whole file at stop and can lose the trailer on a timeout. After a
//! clean stop we remux to a regular MP4 so the player gets a real duration.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

/// Walk at most this many top-level boxes. Live fMP4 finds `moov`/`moof` immediately;
/// a remuxed file is `ftyp` + `mdat` + trailing `moov`.
const MAX_TOP_LEVEL_BOXES: usize = 10_000;

pub(crate) const RECORDING_MOVFLAGS: &str = "+frag_keyframe+empty_moov+default_base_moof";

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) struct Mp4Probe {
    pub(crate) has_moov: bool,
    pub(crate) has_moof: bool,
}

impl Mp4Probe {
    /// Live fragment with media. An empty init `moov` alone is not enough.
    pub(crate) fn has_media_fragment(self) -> bool {
        self.has_moof
    }

    /// Regular MP4 with a duration-bearing `moov` (no live fragments).
    pub(crate) fn is_library_ready(self) -> bool {
        self.has_moov && !self.has_moof
    }

    pub(crate) fn is_usable_segment(self) -> bool {
        self.has_media_fragment() || self.is_library_ready()
    }
}

pub(crate) fn probe_mp4(path: &Path) -> Mp4Probe {
    let Ok(file) = File::open(path) else {
        return Mp4Probe::default();
    };
    probe_mp4_reader(file)
}

fn probe_mp4_reader<R: Read + Seek>(mut reader: R) -> Mp4Probe {
    let Ok(file_len) = reader.seek(SeekFrom::End(0)) else {
        return Mp4Probe::default();
    };
    if file_len < 8 {
        return Mp4Probe::default();
    }

    let mut probe = Mp4Probe::default();
    let mut offset = 0_u64;

    for _ in 0..MAX_TOP_LEVEL_BOXES {
        if offset + 8 > file_len {
            break;
        }
        if reader.seek(SeekFrom::Start(offset)).is_err() {
            break;
        }

        let mut header = [0_u8; 8];
        if reader.read_exact(&mut header).is_err() {
            break;
        }

        let mut box_size = u32::from_be_bytes([header[0], header[1], header[2], header[3]]) as u64;
        let box_type = &header[4..8];
        let mut header_len = 8_u64;

        if box_size == 1 {
            let mut large_size = [0_u8; 8];
            if reader.read_exact(&mut large_size).is_err() {
                break;
            }
            box_size = u64::from_be_bytes(large_size);
            header_len = 16;
            if box_size < header_len {
                break;
            }
        } else if box_size == 0 {
            box_size = file_len.saturating_sub(offset);
        } else if box_size < 8 {
            break;
        }

        if box_type == b"moov" {
            probe.has_moov = true;
        } else if box_type == b"moof" {
            probe.has_moof = true;
        }

        if probe.has_moov && probe.has_moof {
            break;
        }

        let next_offset = offset.saturating_add(box_size);
        if next_offset <= offset {
            break;
        }
        offset = next_offset;
    }

    probe
}

#[cfg(test)]
mod tests {
    use super::{probe_mp4_reader, Mp4Probe, RECORDING_MOVFLAGS};
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
    fn empty_moov_without_moof_is_not_library_ready() {
        let mut bytes = box_bytes(b"ftyp", b"isom");
        bytes.extend_from_slice(&box_bytes(b"moov", b""));
        let probe = probe_mp4_reader(Cursor::new(bytes));
        assert!(probe.has_moov);
        assert!(!probe.has_media_fragment());
        assert!(!probe.is_library_ready());
        assert!(!probe.is_usable_segment());
    }

    #[test]
    fn live_fragments_are_usable_segments() {
        let mut bytes = box_bytes(b"ftyp", b"isom");
        bytes.extend_from_slice(&box_bytes(b"moov", b""));
        bytes.extend_from_slice(&box_bytes(b"moof", b""));
        bytes.extend_from_slice(&box_bytes(b"mdat", &[0, 1, 2, 3]));
        let probe = probe_mp4_reader(Cursor::new(bytes));
        assert!(probe.has_media_fragment());
        assert!(probe.is_usable_segment());
        assert!(!probe.is_library_ready());
    }

    #[test]
    fn trailing_moov_after_mdat_is_library_ready() {
        let mut bytes = box_bytes(b"ftyp", b"isom");
        bytes.extend_from_slice(&box_bytes(b"mdat", &[0; 64]));
        bytes.extend_from_slice(&box_bytes(b"moov", b"mvhd"));
        let probe = probe_mp4_reader(Cursor::new(bytes));
        assert_eq!(
            probe,
            Mp4Probe {
                has_moov: true,
                has_moof: false,
            }
        );
        assert!(probe.is_library_ready());
    }

    #[test]
    fn rejects_mdat_only_recording() {
        let mut bytes = box_bytes(b"ftyp", b"isomiso2avc1mp41");
        bytes.extend_from_slice(&box_bytes(b"mdat", &[0; 64]));
        let probe = probe_mp4_reader(Cursor::new(bytes));
        assert_eq!(probe, Mp4Probe::default());
    }
}
