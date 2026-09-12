use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub(crate) const RECORDING_METADATA_SCHEMA_VERSION: u32 = 2;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingEncounterMetadata {
    pub name: String,
    pub category: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at_seconds: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ended_at_seconds: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingImportantEventMetadata {
    pub timestamp_seconds: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub log_timestamp: Option<String>,
    pub event_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_kind: Option<String>,
    /// Dispelled aura or interrupted cast, when the combat log reports one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extra_spell_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub zone_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub encounter_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub encounter_category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key_level: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingPlayerMetadata {
    pub guid: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub class_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spec_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spec_id: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingMetadata {
    pub schema_version: u32,
    pub recording_file: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub zone_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub encounter_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub encounter_category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key_level: Option<u32>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub encounters: Vec<RecordingEncounterMetadata>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub important_events: Vec<RecordingImportantEventMetadata>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub important_event_counts: BTreeMap<String, u64>,
    #[serde(default, skip_serializing_if = "is_zero")]
    pub important_events_dropped_count: u64,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub players: Vec<RecordingPlayerMetadata>,
    pub captured_at_unix: u64,
}

#[derive(Debug, Clone)]
pub(crate) struct RecordingEncounterSnapshot {
    pub(crate) name: String,
    pub(crate) category: String,
    pub(crate) started_at_seconds: f64,
    pub(crate) ended_at_seconds: Option<f64>,
}

#[derive(Debug, Clone)]
pub(crate) struct RecordingMetadataSnapshot {
    pub(crate) zone_name: Option<String>,
    pub(crate) encounter_name: Option<String>,
    pub(crate) encounter_category: Option<String>,
    pub(crate) key_level: Option<u32>,
    pub(crate) encounters: Vec<RecordingEncounterSnapshot>,
    pub(crate) important_events: Vec<RecordingImportantEventMetadata>,
    pub(crate) important_event_counts: BTreeMap<String, u64>,
    pub(crate) important_events_dropped_count: u64,
    pub(crate) players: Vec<RecordingPlayerMetadata>,
}

fn is_zero(value: &u64) -> bool {
    *value == 0
}

impl RecordingMetadata {
    pub(crate) fn new(recording_path: &Path) -> Self {
        let recording_file = recording_path
            .file_name()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_else(|| recording_path.to_string_lossy().to_string());

        let captured_at_unix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_secs())
            .unwrap_or(0);

        Self {
            schema_version: RECORDING_METADATA_SCHEMA_VERSION,
            recording_file,
            zone_name: None,
            encounter_name: None,
            encounter_category: None,
            key_level: None,
            encounters: Vec::new(),
            important_events: Vec::new(),
            important_event_counts: BTreeMap::new(),
            important_events_dropped_count: 0,
            players: Vec::new(),
            captured_at_unix,
        }
    }

    pub(crate) fn apply_combat_log_snapshot(&mut self, snapshot: RecordingMetadataSnapshot) {
        self.zone_name = snapshot.zone_name;
        self.encounter_name = snapshot.encounter_name;
        self.encounter_category = snapshot.encounter_category;
        self.key_level = snapshot.key_level;
        self.encounters = snapshot
            .encounters
            .into_iter()
            .map(|encounter| RecordingEncounterMetadata {
                name: encounter.name,
                category: encounter.category,
                started_at_seconds: Some(encounter.started_at_seconds),
                ended_at_seconds: encounter.ended_at_seconds,
            })
            .collect();
        self.important_events = snapshot.important_events;
        self.important_event_counts = snapshot.important_event_counts;
        self.important_events_dropped_count = snapshot.important_events_dropped_count;
        self.players = snapshot.players;
    }

    fn is_mythic_plus(&self) -> bool {
        match self.encounter_category.as_deref() {
            Some("mythicPlus") => true,
            Some("raid") | Some("pvp") => false,
            _ => self.key_level.is_some(),
        }
    }

    /// M+ combat logs report floor names (Augurs' Terrace) after MAP_CHANGE.
    /// Library titles should keep the dungeon from the start of the key.
    pub(crate) fn library_zone_name(&self) -> Option<String> {
        let trimmed_zone_name = |value: Option<&String>| {
            value
                .map(|name| name.trim())
                .filter(|name| !name.is_empty())
                .map(str::to_string)
        };

        if !self.is_mythic_plus() {
            return trimmed_zone_name(self.zone_name.as_ref());
        }

        self.important_events
            .iter()
            .find_map(|event| trimmed_zone_name(event.zone_name.as_ref()))
            .or_else(|| trimmed_zone_name(self.zone_name.as_ref()))
    }

    fn apply_library_zone_name(&mut self) {
        if let Some(zone_name) = self.library_zone_name() {
            self.zone_name = Some(zone_name);
        }
    }
}

impl RecordingMetadataSnapshot {
    pub(crate) fn has_content(&self) -> bool {
        self.zone_name.is_some()
            || self.encounter_name.is_some()
            || self.encounter_category.is_some()
            || self.key_level.is_some()
            || !self.encounters.is_empty()
            || !self.important_events.is_empty()
            || !self.important_event_counts.is_empty()
            || self.important_events_dropped_count > 0
            || !self.players.is_empty()
    }
}

pub(crate) fn metadata_sidecar_path(recording_path: &Path) -> PathBuf {
    recording_path.with_extension("meta.json")
}

pub(crate) fn read_recording_metadata(
    recording_path: &Path,
) -> Result<Option<RecordingMetadata>, String> {
    let sidecar_path = metadata_sidecar_path(recording_path);
    let raw_json = match std::fs::read_to_string(&sidecar_path) {
        Ok(content) => content,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            return Err(format!(
                "Failed to read recording metadata '{}': {error}",
                sidecar_path.display()
            ));
        }
    };

    let mut metadata = serde_json::from_str::<RecordingMetadata>(&raw_json).map_err(|error| {
        format!(
            "Failed to parse recording metadata '{}': {error}",
            sidecar_path.display()
        )
    })?;
    metadata.apply_library_zone_name();

    Ok(Some(metadata))
}

pub(crate) fn write_recording_metadata(
    recording_path: &Path,
    metadata: &RecordingMetadata,
) -> Result<PathBuf, String> {
    let sidecar_path = metadata_sidecar_path(recording_path);
    if let Some(parent_directory) = sidecar_path.parent() {
        std::fs::create_dir_all(parent_directory).map_err(|error| {
            format!(
                "Failed to create recording metadata directory '{}': {error}",
                parent_directory.display()
            )
        })?;
    }

    let temp_path = temporary_sidecar_path(&sidecar_path);
    let serialized = serde_json::to_string_pretty(metadata)
        .map_err(|error| format!("Failed to serialize recording metadata: {error}"))?;

    std::fs::write(&temp_path, serialized).map_err(|error| {
        format!(
            "Failed to write temporary recording metadata '{}': {error}",
            temp_path.display()
        )
    })?;

    if sidecar_path.exists() {
        std::fs::remove_file(&sidecar_path).map_err(|error| {
            format!(
                "Failed to replace existing recording metadata '{}': {error}",
                sidecar_path.display()
            )
        })?;
    }

    if let Err(error) = std::fs::rename(&temp_path, &sidecar_path) {
        let cleanup_error = std::fs::remove_file(&temp_path).err();
        if let Some(cleanup_error) = cleanup_error {
            return Err(format!(
                "Failed to finalize recording metadata '{}': {error}; temporary cleanup failed '{}': {cleanup_error}",
                sidecar_path.display(),
                temp_path.display()
            ));
        }

        return Err(format!(
            "Failed to finalize recording metadata '{}': {error}",
            sidecar_path.display()
        ));
    }

    Ok(sidecar_path)
}

pub(crate) fn delete_recording_metadata(recording_path: &Path) -> Result<(), String> {
    let sidecar_path = metadata_sidecar_path(recording_path);
    match std::fs::remove_file(&sidecar_path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!(
            "Failed to delete recording metadata '{}': {error}",
            sidecar_path.display()
        )),
    }
}

const LIBRARY_ZONE_SLUG_MAX_CHARS: usize = 48;

pub(crate) fn rename_finalized_recording_if_named(output_path: &str) -> String {
    match try_rename_finalized_recording(Path::new(output_path)) {
        Ok(Some(renamed_path)) => renamed_path.to_string_lossy().to_string(),
        Ok(None) => output_path.to_string(),
        Err(error) => {
            tracing::warn!(
                output_path,
                "Failed to rename recording from combat metadata: {error}"
            );
            output_path.to_string()
        }
    }
}

fn try_rename_finalized_recording(output_path: &Path) -> Result<Option<PathBuf>, String> {
    if !output_path.exists() {
        return Ok(None);
    }

    let Some(metadata) = read_recording_metadata(output_path)? else {
        return Ok(None);
    };

    let Some(key_level) = metadata.key_level else {
        return Ok(None);
    };
    let Some(zone_name) = metadata.library_zone_name() else {
        return Ok(None);
    };

    let timestamp_label = timestamp_label_from_recording_path(output_path);
    let Some(stem) = library_filename_stem(&zone_name, key_level, &timestamp_label) else {
        return Ok(None);
    };

    let parent_directory = output_path.parent().ok_or_else(|| {
        format!(
            "Recording path '{}' has no parent directory",
            output_path.display()
        )
    })?;
    let target_path = unique_library_path(parent_directory, output_path, &stem);
    if target_path == output_path {
        return Ok(None);
    }

    std::fs::rename(output_path, &target_path).map_err(|error| {
        format!(
            "Failed to rename recording '{}' to '{}': {error}",
            output_path.display(),
            target_path.display()
        )
    })?;

    let source_sidecar = metadata_sidecar_path(output_path);
    let target_sidecar = metadata_sidecar_path(&target_path);
    if source_sidecar.exists() {
        if let Err(error) = std::fs::rename(&source_sidecar, &target_sidecar) {
            tracing::warn!(
                source = %source_sidecar.display(),
                target = %target_sidecar.display(),
                "Failed to rename recording metadata sidecar after library rename: {error}"
            );
        }
    }

    if let Ok(Some(mut renamed_metadata)) = read_recording_metadata(&target_path) {
        if let Some(file_name) = target_path.file_name().and_then(|value| value.to_str()) {
            renamed_metadata.recording_file = file_name.to_string();
            if let Err(error) = write_recording_metadata(&target_path, &renamed_metadata) {
                tracing::warn!(
                    target = %target_path.display(),
                    "Failed to update recording_file after library rename: {error}"
                );
            }
        }
    }

    Ok(Some(target_path))
}

fn unique_library_path(parent_directory: &Path, current_path: &Path, stem: &str) -> PathBuf {
    let first_candidate = parent_directory.join(format!("{stem}.mp4"));
    if !first_candidate.exists() || first_candidate == current_path {
        return first_candidate;
    }

    for index in 2..100 {
        let candidate = parent_directory.join(format!("{stem}-{index}.mp4"));
        if !candidate.exists() {
            return candidate;
        }
    }

    parent_directory.join(format!(
        "{stem}-{}.mp4",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis())
            .unwrap_or(0)
    ))
}

fn timestamp_label_from_recording_path(path: &Path) -> String {
    path.file_stem()
        .and_then(|value| value.to_str())
        .and_then(timestamp_label_from_stem)
        .unwrap_or_else(|| chrono::Local::now().format("%Y%m%d-%H%M").to_string())
}

fn timestamp_label_from_stem(stem: &str) -> Option<String> {
    let date_start = stem.len().checked_sub(15)?;
    let date = stem.get(date_start..date_start + 8)?;
    let separator = stem.as_bytes().get(date_start + 8)?;
    let time = stem.get(date_start + 9..)?;
    if *separator != b'_'
        || !date.chars().all(|character| character.is_ascii_digit())
        || time.len() < 4
        || !time
            .chars()
            .take(4)
            .all(|character| character.is_ascii_digit())
    {
        return None;
    }

    Some(format!("{date}-{}", &time[..4]))
}

fn library_filename_stem(zone_name: &str, key_level: u32, timestamp_label: &str) -> Option<String> {
    let slug = slugify_library_name(zone_name);
    if slug.is_empty() {
        return None;
    }

    Some(format!("{slug}-{key_level}-{timestamp_label}"))
}

fn slugify_library_name(input: &str) -> String {
    let mut slug = String::new();
    let mut last_was_hyphen = false;

    for character in input.chars() {
        if character.is_ascii_alphanumeric() {
            slug.push(character.to_ascii_lowercase());
            last_was_hyphen = false;
            continue;
        }

        if !last_was_hyphen && !slug.is_empty() {
            slug.push('-');
            last_was_hyphen = true;
        }
    }

    let trimmed = slug.trim_end_matches('-').to_string();
    trimmed.chars().take(LIBRARY_ZONE_SLUG_MAX_CHARS).collect()
}

fn temporary_sidecar_path(sidecar_path: &Path) -> PathBuf {
    let Some(file_name) = sidecar_path.file_name().and_then(|value| value.to_str()) else {
        return sidecar_path.with_extension("meta.json.tmp");
    };

    sidecar_path.with_file_name(format!("{file_name}.tmp"))
}

#[cfg(test)]
mod tests {
    use super::{
        delete_recording_metadata, library_filename_stem, metadata_sidecar_path,
        read_recording_metadata, rename_finalized_recording_if_named, slugify_library_name,
        timestamp_label_from_stem, write_recording_metadata, RecordingImportantEventMetadata,
        RecordingMetadata,
    };
    use std::path::Path;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_directory() -> std::path::PathBuf {
        let timestamp_nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        let process_id = std::process::id();
        std::env::temp_dir().join(format!(
            "floorpov_metadata_test_{process_id}_{timestamp_nanos}"
        ))
    }

    #[test]
    fn derives_sidecar_path_from_recording_path() {
        let recording_path = Path::new(r"C:\Recordings\capture.mp4");
        let sidecar_path = metadata_sidecar_path(recording_path);

        assert_eq!(
            sidecar_path.to_string_lossy(),
            r"C:\Recordings\capture.meta.json"
        );
    }

    #[test]
    fn writes_reads_and_deletes_recording_metadata() {
        let temp_directory = unique_temp_directory();
        std::fs::create_dir_all(&temp_directory)
            .expect("Failed to create temporary metadata test directory");

        let recording_path = temp_directory.join("screen_recording_20260222_153012.mp4");
        std::fs::write(&recording_path, b"test")
            .expect("Failed to create test recording file for metadata roundtrip");

        let mut metadata = RecordingMetadata::new(&recording_path);
        metadata.zone_name = Some("Nerub-ar Palace".to_string());
        metadata.encounter_name = Some("Queen Ansurek".to_string());
        metadata.encounter_category = Some("raid".to_string());
        metadata.key_level = Some(12);

        write_recording_metadata(&recording_path, &metadata)
            .expect("Expected metadata write to succeed");

        let loaded_metadata = read_recording_metadata(&recording_path)
            .expect("Expected metadata read to succeed")
            .expect("Expected metadata sidecar to exist");

        assert_eq!(loaded_metadata.zone_name, metadata.zone_name);
        assert_eq!(loaded_metadata.encounter_name, metadata.encounter_name);
        assert_eq!(
            loaded_metadata.encounter_category,
            metadata.encounter_category
        );
        assert_eq!(loaded_metadata.key_level, metadata.key_level);
        assert_eq!(
            loaded_metadata.important_events_dropped_count,
            metadata.important_events_dropped_count
        );

        delete_recording_metadata(&recording_path).expect("Expected metadata delete to succeed");
        let sidecar_path = metadata_sidecar_path(&recording_path);
        assert!(!sidecar_path.exists());

        std::fs::remove_file(&recording_path).expect("Failed to remove test recording file");
        std::fs::remove_dir_all(&temp_directory)
            .expect("Failed to remove temporary metadata test directory");
    }

    #[test]
    fn library_zone_prefers_the_mythic_plus_start_zone_over_later_floors() {
        let mut metadata = RecordingMetadata::new(Path::new("augurs-terrace-13.mp4"));
        metadata.zone_name = Some("Augurs' Terrace".to_string());
        metadata.encounter_category = Some("mythicPlus".to_string());
        metadata.key_level = Some(13);
        metadata
            .important_events
            .push(RecordingImportantEventMetadata {
                timestamp_seconds: 17.0,
                log_timestamp: None,
                event_type: "BLOODLUST".to_string(),
                source: None,
                target: None,
                target_kind: None,
                zone_name: Some("Murder Row".to_string()),
                encounter_name: None,
                encounter_category: Some("mythicPlus".to_string()),
                key_level: Some(13),
            });
        metadata
            .important_events
            .push(RecordingImportantEventMetadata {
                timestamp_seconds: 1600.0,
                log_timestamp: None,
                event_type: "SPELL_INTERRUPT".to_string(),
                source: None,
                target: None,
                target_kind: None,
                zone_name: Some("Augurs' Terrace".to_string()),
                encounter_name: None,
                encounter_category: Some("mythicPlus".to_string()),
                key_level: Some(13),
            });

        assert_eq!(metadata.library_zone_name().as_deref(), Some("Murder Row"));
    }

    #[test]
    fn roundtrips_important_events_and_counts() {
        let temp_directory = unique_temp_directory();
        std::fs::create_dir_all(&temp_directory)
            .expect("Failed to create temporary metadata test directory");

        let recording_path = temp_directory.join("screen_recording_20260222_153013.mp4");
        std::fs::write(&recording_path, b"test")
            .expect("Failed to create test recording file for metadata roundtrip");

        let mut metadata = RecordingMetadata::new(&recording_path);
        metadata
            .important_events
            .push(RecordingImportantEventMetadata {
                timestamp_seconds: 12.5,
                log_timestamp: Some("2/22 20:15:11.000".to_string()),
                event_type: "SPELL_INTERRUPT".to_string(),
                source: Some("PlayerOne".to_string()),
                target: Some("Boss".to_string()),
                target_kind: Some("NPC".to_string()),
                extra_spell_name: Some("Void Bolt".to_string()),
                zone_name: Some("Test Zone".to_string()),
                encounter_name: Some("Test Encounter".to_string()),
                encounter_category: Some("raid".to_string()),
                key_level: None,
            });
        metadata
            .important_events
            .push(RecordingImportantEventMetadata {
                timestamp_seconds: 30.0,
                log_timestamp: Some("2/22 20:15:29.000".to_string()),
                event_type: "SPELL_DISPEL".to_string(),
                source: Some("PlayerTwo".to_string()),
                target: Some("PlayerThree".to_string()),
                target_kind: Some("PLAYER".to_string()),
                extra_spell_name: Some("Fear".to_string()),
                zone_name: Some("Test Zone".to_string()),
                encounter_name: Some("Test Encounter".to_string()),
                encounter_category: Some("raid".to_string()),
                key_level: None,
            });
        metadata
            .important_event_counts
            .insert("SPELL_INTERRUPT".to_string(), 42);
        metadata
            .important_event_counts
            .insert("SPELL_DISPEL".to_string(), 7);
        metadata.important_events_dropped_count = 5;

        write_recording_metadata(&recording_path, &metadata)
            .expect("Expected metadata write to succeed");

        let loaded_metadata = read_recording_metadata(&recording_path)
            .expect("Expected metadata read to succeed")
            .expect("Expected metadata sidecar to exist");

        assert_eq!(loaded_metadata.important_events.len(), 2);
        assert_eq!(
            loaded_metadata
                .important_event_counts
                .get("SPELL_INTERRUPT")
                .copied(),
            Some(42)
        );
        assert_eq!(
            loaded_metadata
                .important_event_counts
                .get("SPELL_DISPEL")
                .copied(),
            Some(7)
        );
        assert_eq!(
            loaded_metadata.important_events[0]
                .extra_spell_name
                .as_deref(),
            Some("Void Bolt")
        );
        assert_eq!(
            loaded_metadata.important_events[1]
                .extra_spell_name
                .as_deref(),
            Some("Fear")
        );
        assert_eq!(loaded_metadata.important_events_dropped_count, 5);

        delete_recording_metadata(&recording_path).expect("Expected metadata delete to succeed");
        let sidecar_path = metadata_sidecar_path(&recording_path);
        assert!(!sidecar_path.exists());

        std::fs::remove_file(&recording_path).expect("Failed to remove test recording file");
        std::fs::remove_dir_all(&temp_directory)
            .expect("Failed to remove temporary metadata test directory");
    }

    #[test]
    fn slugs_dungeon_names_for_library_files() {
        assert_eq!(slugify_library_name("Voidscar Arena"), "voidscar-arena");
        assert_eq!(
            slugify_library_name("Magisters' Terrace"),
            "magisters-terrace"
        );
        assert_eq!(slugify_library_name("Nerub-ar Palace"), "nerub-ar-palace");
    }

    #[test]
    fn builds_library_filename_from_dungeon_and_key() {
        assert_eq!(
            library_filename_stem("Voidscar Arena", 14, "20260908-1518").as_deref(),
            Some("voidscar-arena-14-20260908-1518")
        );
        assert_eq!(
            timestamp_label_from_stem("screen_recording_20260908_151832").as_deref(),
            Some("20260908-1518")
        );
    }

    #[test]
    fn renames_finalized_mythic_plus_recording() {
        let temp_directory = unique_temp_directory();
        std::fs::create_dir_all(&temp_directory)
            .expect("Failed to create temporary library rename directory");

        let recording_path = temp_directory.join("screen_recording_20260908_151832.mp4");
        std::fs::write(&recording_path, b"video")
            .expect("Failed to create test recording for library rename");

        let mut metadata = RecordingMetadata::new(&recording_path);
        metadata.zone_name = Some("Voidscar Arena".to_string());
        metadata.key_level = Some(14);
        write_recording_metadata(&recording_path, &metadata)
            .expect("Expected metadata write to succeed");

        let renamed_path = rename_finalized_recording_if_named(
            recording_path.to_str().expect("test path is utf-8"),
        );
        let expected_path = temp_directory.join("voidscar-arena-14-20260908-1518.mp4");

        assert_eq!(Path::new(&renamed_path), expected_path.as_path());
        assert!(expected_path.exists());
        assert!(!recording_path.exists());

        let renamed_metadata = read_recording_metadata(&expected_path)
            .expect("Expected metadata read to succeed")
            .expect("Expected renamed sidecar to exist");
        assert_eq!(
            renamed_metadata.recording_file,
            "voidscar-arena-14-20260908-1518.mp4"
        );

        delete_recording_metadata(&expected_path).expect("Expected metadata delete to succeed");
        std::fs::remove_file(&expected_path).expect("Failed to remove renamed recording");
        std::fs::remove_dir_all(&temp_directory)
            .expect("Failed to remove temporary library rename directory");
    }

    #[test]
    fn keeps_timestamp_name_without_key_metadata() {
        let temp_directory = unique_temp_directory();
        std::fs::create_dir_all(&temp_directory)
            .expect("Failed to create temporary library rename directory");

        let recording_path = temp_directory.join("screen_recording_20260908_151832.mp4");
        std::fs::write(&recording_path, b"video")
            .expect("Failed to create test recording for library rename");

        let metadata = RecordingMetadata::new(&recording_path);
        write_recording_metadata(&recording_path, &metadata)
            .expect("Expected metadata write to succeed");

        let renamed_path = rename_finalized_recording_if_named(
            recording_path.to_str().expect("test path is utf-8"),
        );

        assert_eq!(Path::new(&renamed_path), recording_path.as_path());
        assert!(recording_path.exists());

        delete_recording_metadata(&recording_path).expect("Expected metadata delete to succeed");
        std::fs::remove_file(&recording_path).expect("Failed to remove test recording");
        std::fs::remove_dir_all(&temp_directory)
            .expect("Failed to remove temporary library rename directory");
    }
}
