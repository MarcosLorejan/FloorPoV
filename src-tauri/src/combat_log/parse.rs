use super::{CombatTriggerEvent, ParsedCombatEvent, EVENT_ENCOUNTER_END, EVENT_ENCOUNTER_START};

pub(crate) const PLAYER_AMOUNT_MARKER_MIN: u64 = 1_000_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum CombatAmountKind {
    Damage,
    Heal,
}

#[derive(Debug, Clone)]
pub(crate) struct CombatAmountSample {
    pub(crate) dest_guid: String,
    pub(crate) source: Option<String>,
    pub(crate) target: Option<String>,
    pub(crate) target_kind: Option<String>,
    pub(crate) amount: u64,
    pub(crate) kind: CombatAmountKind,
    pub(crate) persist_as_marker: bool,
    pub(crate) log_timestamp: Option<String>,
    pub(crate) raw_event_type: String,
}

#[derive(Debug, Clone)]
pub(crate) struct ImportantCombatEvent {
    pub(crate) raw_event_type: String,
    pub(crate) log_timestamp: Option<String>,
    pub(crate) event_type: String,
    pub(crate) source: Option<String>,
    pub(crate) target: Option<String>,
    pub(crate) target_kind: Option<String>,
    pub(crate) dest_guid: Option<String>,
    pub(crate) amount: Option<u64>,
    pub(crate) ability_name: Option<String>,
    pub(crate) zone_name: Option<String>,
    pub(crate) encounter_name: Option<String>,
    pub(crate) encounter_category: Option<String>,
    pub(crate) key_level: Option<u32>,
}

#[derive(Debug, Clone)]
pub(crate) struct CombatantInfoSnapshot {
    pub(crate) player_guid: String,
    pub(crate) spec_id: Option<u32>,
    pub(crate) class_name: Option<String>,
    pub(crate) spec_name: Option<String>,
}

#[derive(Debug, Clone)]
pub(crate) struct PlayerIdentity {
    pub(crate) guid: String,
    pub(crate) name: Option<String>,
}

impl ImportantCombatEvent {
    pub(crate) fn into_live_event(
        self,
        recording_elapsed_seconds: Option<f64>,
    ) -> Option<super::CombatEvent> {
        let timestamp = recording_elapsed_seconds?;
        match self.event_type.as_str() {
            "PARTY_KILL"
            | "UNIT_DIED"
            | "BLOODLUST"
            | "COMBAT_RES"
            | "DEFENSIVE"
            | "BIG_HIT"
            | "HEAL"
            | "BOSS_ABILITY"
            | "CROWD_CONTROL"
            | "CROWD_CONTROL_BREAK" => Some(super::CombatEvent {
                timestamp,
                event_type: self.event_type,
                source: self.source,
                target: self.target,
                amount: self.amount,
                ability_name: self.ability_name,
            }),
            _ => None,
        }
    }
}

pub(crate) fn extract_combat_trigger_event(
    event: &ImportantCombatEvent,
) -> Option<CombatTriggerEvent> {
    let (trigger_type, mode, requires_raid_category) = (match event.raw_event_type.as_str() {
        "CHALLENGE_MODE_START" => Some(("start", "mythicPlus", false)),
        "CHALLENGE_MODE_END" => Some(("end", "mythicPlus", false)),
        "ENCOUNTER_START" => Some(("start", "raid", true)),
        "ENCOUNTER_END" => Some(("end", "raid", true)),
        "ARENA_MATCH_START" | "PVP_MATCH_START" | "BATTLEGROUND_START" => {
            Some(("start", "pvp", false))
        }
        "ARENA_MATCH_END" | "PVP_MATCH_COMPLETE" | "BATTLEGROUND_END" => {
            Some(("end", "pvp", false))
        }
        _ => None,
    })?;

    if requires_raid_category && event.encounter_category.as_deref() != Some("raid") {
        return None;
    }

    Some(CombatTriggerEvent {
        trigger_type: trigger_type.to_string(),
        mode: mode.to_string(),
        event_type: event.raw_event_type.clone(),
        encounter_name: event.encounter_name.clone(),
        key_level: event.key_level,
    })
}

pub(crate) fn parse_important_combat_event(
    line: &str,
    context: &mut DebugParseContext,
) -> Option<ImportantCombatEvent> {
    let parsed_line = parse_log_line_fields(line, context.current_encounter.as_deref())?;
    // Vote-to-abandon / hearth never writes CHALLENGE_MODE_END. An outdoor
    // ZONE_CHANGE is the combat-log signal that the key is over.
    let raw_event_type = remap_instance_leave_to_challenge_end(context, &parsed_line);

    update_debug_context(context, &raw_event_type, &parsed_line);

    if let Some(zone_name) = extract_zone_name(&parsed_line.raw_event_type, &parsed_line.fields) {
        // MAP_CHANGE/ZONE_CHANGED fire for dungeon floors (Augurs' Terrace inside Murder
        // Row). Keep the CHALLENGE_MODE_START dungeon name as the M+ zone.
        if parsed_line.raw_event_type == "CHALLENGE_MODE_START" || !context.in_challenge_mode {
            context.current_zone = Some(zone_name);
        }
    }

    let (encounter_name, encounter_category) =
        resolve_encounter_state_for_event(context, &parsed_line);

    if is_guardian_target(parsed_line.target_kind.as_deref()) {
        return None;
    }

    if should_ignore_unconscious_death(&parsed_line) {
        return None;
    }

    Some(ImportantCombatEvent {
        raw_event_type,
        log_timestamp: Some(parsed_line.log_timestamp),
        event_type: parsed_line.normalized_event_type,
        source: parsed_line.source,
        target: parsed_line.target,
        target_kind: parsed_line.target_kind,
        dest_guid: parsed_line.dest_guid,
        amount: None,
        ability_name: parsed_line.ability_name,
        zone_name: context.current_zone.clone(),
        encounter_name,
        encounter_category,
        key_level: context.current_key_level,
    })
}

fn resolve_encounter_state_for_event(
    context: &mut DebugParseContext,
    parsed_line: &ParsedLogLine,
) -> (Option<String>, Option<String>) {
    let mut encounter_name = context.current_encounter.clone();
    let mut encounter_category = context.current_encounter_category.clone();

    match parsed_line.raw_event_type.as_str() {
        EVENT_ENCOUNTER_START => {
            if let Some(new_encounter_name) = extract_encounter_name(&parsed_line.fields) {
                context.current_encounter = Some(new_encounter_name.clone());
                encounter_name = Some(new_encounter_name);
            }
            let category = classify_encounter_category(context, &parsed_line.fields).to_string();
            context.current_encounter_category = Some(category.clone());
            encounter_category = Some(category);
            // Store the log timestamp so we can use it as anchor when recording starts mid-encounter
            context.current_encounter_log_timestamp = Some(parsed_line.log_timestamp.clone());
        }
        EVENT_ENCOUNTER_END => {
            if let Some(finished_encounter_name) = extract_encounter_name(&parsed_line.fields) {
                encounter_name = Some(finished_encounter_name);
            }
            if encounter_category.is_none() {
                encounter_category =
                    Some(classify_encounter_category(context, &parsed_line.fields).to_string());
            }
            context.current_encounter = None;
            context.current_encounter_category = None;
            context.current_encounter_log_timestamp = None;
        }
        _ => {}
    }

    (encounter_name, encounter_category)
}

pub(crate) fn parse_important_log_line(
    line: &str,
    line_number: u64,
    context: &mut DebugParseContext,
) -> Option<ParsedCombatEvent> {
    let parsed_event = parse_important_combat_event(line, context)?;

    if is_context_only_event(&parsed_event.raw_event_type) {
        return None;
    }

    Some(ParsedCombatEvent {
        line_number,
        log_timestamp: parsed_event.log_timestamp.unwrap_or_default(),
        event_type: parsed_event.event_type,
        source: parsed_event.source,
        target: parsed_event.target,
        target_kind: parsed_event.target_kind,
        ability_name: parsed_event.ability_name,
        zone_name: parsed_event.zone_name,
        encounter_name: parsed_event.encounter_name,
        encounter_category: parsed_event.encounter_category,
        key_level: parsed_event.key_level,
    })
}

#[derive(Debug, Default)]
pub(crate) struct DebugParseContext {
    pub(crate) current_zone: Option<String>,
    pub(crate) current_encounter: Option<String>,
    pub(crate) current_encounter_category: Option<String>,
    pub(crate) current_encounter_log_timestamp: Option<String>,
    pub(crate) current_key_level: Option<u32>,
    pub(crate) challenge_mode_start_log_timestamp: Option<String>,
    pub(crate) pvp_match_start_log_timestamp: Option<String>,
    pub(crate) in_challenge_mode: bool,
    pub(crate) in_pvp_match: bool,
}

#[derive(Debug)]
struct ParsedLogLine {
    raw_event_type: String,
    normalized_event_type: String,
    log_timestamp: String,
    source: Option<String>,
    target: Option<String>,
    target_kind: Option<String>,
    dest_guid: Option<String>,
    ability_name: Option<String>,
    fields: Vec<String>,
}

fn parse_log_line_fields(line: &str, encounter_name: Option<&str>) -> Option<ParsedLogLine> {
    let trimmed_line = line.trim();
    if trimmed_line.is_empty() {
        return None;
    }

    let mut fields = trimmed_line.split(',');
    let header = fields.next()?.trim();
    let raw_event_type = extract_event_type(header)?;
    let remaining_fields = fields
        .map(|value| value.trim().to_string())
        .collect::<Vec<String>>();
    let normalized_event_type =
        normalize_important_event_type(raw_event_type, &remaining_fields, encounter_name)?;

    let source_name = remaining_fields.get(1).map(|value| value.as_str());
    let source_guid = remaining_fields.first().map(|value| value.as_str());
    let source_flags = remaining_fields.get(2).map(|value| value.as_str());
    let dest_guid = remaining_fields.get(4).map(|value| value.as_str());
    let dest_name = remaining_fields.get(5).map(|value| value.as_str());
    let dest_flags = remaining_fields.get(6).map(|value| value.as_str());
    let source_kind = classify_unit_type(source_flags, source_guid).map(str::to_string);
    let target_kind = classify_unit_type(dest_flags, dest_guid).map(str::to_string);
    let ability_name = if normalized_event_type == "DEFENSIVE"
        || normalized_event_type == "BOSS_ABILITY"
        || is_crowd_control_event_type(normalized_event_type)
    {
        extract_spell_name(&remaining_fields)
    } else {
        None
    };

    Some(ParsedLogLine {
        raw_event_type: raw_event_type.to_string(),
        normalized_event_type: normalized_event_type.to_string(),
        log_timestamp: extract_log_timestamp(header),
        source: normalize_entity_name(source_name, source_kind.as_deref()),
        target: normalize_entity_name(dest_name, target_kind.as_deref()),
        target_kind,
        dest_guid: normalize_name(dest_guid),
        ability_name,
        fields: remaining_fields,
    })
}

pub(crate) fn parse_combat_amount_sample(line: &str) -> Option<CombatAmountSample> {
    let trimmed_line = line.trim();
    if trimmed_line.is_empty() {
        return None;
    }

    let mut fields = trimmed_line.split(',');
    let header = fields.next()?.trim();
    let raw_event_type = extract_event_type(header)?;
    let remaining_fields = fields.map(|value| value.trim()).collect::<Vec<&str>>();

    let (kind, amount_index, overkill_index) = amount_field_layout(raw_event_type)?;
    let amount = parse_combat_amount_field(remaining_fields.get(amount_index).copied())?;
    if amount == 0 {
        return None;
    }

    let dest_guid = normalize_name(remaining_fields.get(4).copied())?;
    let dest_name = remaining_fields.get(5).copied();
    let dest_flags = remaining_fields.get(6).copied();
    let target_kind = classify_unit_type(dest_flags, Some(dest_guid.as_str())).map(str::to_string);
    if is_guardian_target(target_kind.as_deref()) {
        return None;
    }

    let source_guid = remaining_fields.first().copied();
    let source_name = remaining_fields.get(1).copied();
    let source_flags = remaining_fields.get(2).copied();
    let source_kind = classify_unit_type(source_flags, source_guid);

    // Combat log overkill is -1 when the target survives. 0 is an exact killing blow.
    let overkill = overkill_index
        .map(|index| parse_combat_overkill_field(remaining_fields.get(index).copied()))
        .unwrap_or(-1);
    let is_killing_blow = kind == CombatAmountKind::Damage && overkill >= 0;
    let persist_as_marker = target_kind.as_deref() == Some("PLAYER")
        && amount >= PLAYER_AMOUNT_MARKER_MIN
        && is_amount_marker_event(raw_event_type)
        && !is_killing_blow;

    Some(CombatAmountSample {
        dest_guid,
        source: normalize_entity_name(source_name, source_kind),
        target: normalize_entity_name(dest_name, target_kind.as_deref()),
        target_kind,
        amount,
        kind,
        persist_as_marker,
        log_timestamp: Some(extract_log_timestamp(header)),
        raw_event_type: raw_event_type.to_string(),
    })
}

fn amount_field_layout(raw_event_type: &str) -> Option<(CombatAmountKind, usize, Option<usize>)> {
    match raw_event_type {
        "SPELL_DAMAGE"
        | "SPELL_PERIODIC_DAMAGE"
        | "RANGE_DAMAGE"
        | "DAMAGE_SHIELD"
        | "DAMAGE_SPLIT" => Some((CombatAmountKind::Damage, 11, Some(12))),
        "SWING_DAMAGE" | "SWING_DAMAGE_LANDED" => Some((CombatAmountKind::Damage, 8, Some(9))),
        "ENVIRONMENTAL_DAMAGE" => Some((CombatAmountKind::Damage, 9, Some(10))),
        "SPELL_HEAL" | "SPELL_PERIODIC_HEAL" => Some((CombatAmountKind::Heal, 11, None)),
        _ => None,
    }
}

fn is_amount_marker_event(raw_event_type: &str) -> bool {
    matches!(
        raw_event_type,
        "SPELL_DAMAGE" | "RANGE_DAMAGE" | "SWING_DAMAGE" | "SPELL_HEAL"
    )
}

fn parse_combat_amount_field(value: Option<&str>) -> Option<u64> {
    let raw = value?.trim().trim_matches('"');
    if raw.is_empty() || raw == "nil" {
        return None;
    }

    if let Ok(amount) = raw.parse::<u64>() {
        return Some(amount);
    }

    raw.parse::<f64>()
        .ok()
        .filter(|amount| amount.is_finite() && *amount >= 0.0)
        .map(|amount| amount as u64)
}

fn parse_combat_overkill_field(value: Option<&str>) -> i64 {
    let Some(raw) = value else {
        return -1;
    };
    let raw = raw.trim().trim_matches('"');
    if raw.is_empty() || raw == "nil" {
        return -1;
    }

    if let Ok(overkill) = raw.parse::<i64>() {
        return overkill;
    }

    raw.parse::<f64>()
        .ok()
        .filter(|amount| amount.is_finite())
        .map(|amount| amount as i64)
        .unwrap_or(-1)
}

fn normalize_important_event_type(
    event_type: &str,
    fields: &[String],
    encounter_name: Option<&str>,
) -> Option<&'static str> {
    match event_type {
        "PARTY_KILL" => Some("PARTY_KILL"),
        "UNIT_DIED" | "UNIT_DESTROYED" => Some("UNIT_DIED"),
        "SPELL_INTERRUPT" => Some("SPELL_INTERRUPT"),
        "SPELL_DISPEL" => Some("SPELL_DISPEL"),
        "SPELL_RESURRECT" => Some("COMBAT_RES"),
        "SPELL_CAST_SUCCESS" => classify_cast_success_event(fields, encounter_name),
        "SPELL_AURA_APPLIED" | "SPELL_AURA_BROKEN" | "SPELL_AURA_BROKEN_SPELL" => {
            classify_crowd_control_event(event_type, fields)
        }
        "ENCOUNTER_START" => Some("ENCOUNTER_START"),
        "ENCOUNTER_END" => Some("ENCOUNTER_END"),
        event_type if is_zone_context_event_type(event_type) => Some("ZONE_CONTEXT"),
        "CHALLENGE_MODE_START" | "CHALLENGE_MODE_END" => Some("CHALLENGE_CONTEXT"),
        "ARENA_MATCH_START" | "ARENA_MATCH_END" | "PVP_MATCH_START" | "PVP_MATCH_COMPLETE"
        | "BATTLEGROUND_START" | "BATTLEGROUND_END" => Some("PVP_CONTEXT"),
        _ => None,
    }
}

fn classify_cast_success_event(
    fields: &[String],
    encounter_name: Option<&str>,
) -> Option<&'static str> {
    if let Some(spell_id) = extract_spell_id(fields) {
        if is_bloodlust_spell_id(spell_id) {
            return Some("BLOODLUST");
        }

        if is_player_source(fields) && is_defensive_spell_id(spell_id) {
            return Some("DEFENSIVE");
        }
    }

    if is_boss_ability_cast(fields, encounter_name) {
        return Some("BOSS_ABILITY");
    }

    None
}

fn extract_spell_id(fields: &[String]) -> Option<u32> {
    fields.get(8)?.trim_matches('"').parse().ok()
}

fn extract_spell_name(fields: &[String]) -> Option<String> {
    normalize_name(fields.get(9).map(|value| value.as_str()))
}

fn is_player_source(fields: &[String]) -> bool {
    let source_guid = fields.first().map(|value| value.as_str());
    let source_flags = fields.get(2).map(|value| value.as_str());
    classify_unit_type(source_flags, source_guid) == Some("PLAYER")
}

fn is_boss_ability_cast(fields: &[String], encounter_name: Option<&str>) -> bool {
    let Some(encounter_name) = encounter_name.filter(|name| !name.is_empty()) else {
        return false;
    };

    let source_guid = fields.first().map(|value| value.as_str());
    let source_name_raw = fields.get(1).map(|value| value.as_str());
    let source_flags = fields.get(2).map(|value| value.as_str());
    if classify_unit_type(source_flags, source_guid) != Some("NPC") {
        return false;
    }

    let Some(source_name) = normalize_name(source_name_raw) else {
        return false;
    };
    let Some(spell_name) = extract_spell_name(fields) else {
        return false;
    };
    if is_ignored_ability_name(&spell_name) {
        return false;
    }

    is_encounter_relevant_boss(&source_name, encounter_name, source_guid)
}

fn is_ignored_ability_name(spell_name: &str) -> bool {
    matches!(
        spell_name.to_ascii_lowercase().as_str(),
        "melee" | "auto attack" | "attack" | "weapon" | "shoot"
    )
}

fn is_encounter_relevant_boss(
    source_name: &str,
    encounter_name: &str,
    source_guid: Option<&str>,
) -> bool {
    if is_trash_like_unit_name(source_name) {
        return false;
    }

    if names_are_encounter_related(source_name, encounter_name) {
        return true;
    }

    if source_guid.is_some_and(|guid| guid.starts_with("Vehicle-")) {
        return true;
    }

    is_multi_boss_encounter(encounter_name)
}

fn is_multi_boss_encounter(encounter_name: &str) -> bool {
    // Match official council-style encounter titles only. Do not treat every
    // "X and Y" name as "all NPCs are bosses" — named bosses already match via
    // names_are_encounter_related after "and"/"&" split into words.
    let lower = encounter_name.to_ascii_lowercase();
    lower.contains("twins")
        || name_ends_with_word(&lower, "council")
        || name_ends_with_word(&lower, "court")
        || name_ends_with_word(&lower, "assembly")
        || name_ends_with_word(&lower, "trio")
}

fn name_ends_with_word(name: &str, word: &str) -> bool {
    name == word
        || name
            .strip_suffix(word)
            .is_some_and(|prefix| prefix.ends_with([' ', '-', '\'']))
}

fn is_trash_like_unit_name(source_name: &str) -> bool {
    const TRASH_TOKENS: &[&str] = &[
        "spawn",
        "remnant",
        "fragment",
        "echo",
        "image",
        "illusion",
        "totem",
        "trap",
        "mine",
        "orb",
        "stalker",
        "bunny",
        "controller",
        "trigger",
        "missile",
        "swarmer",
        "hatchling",
        "egg",
        "larva",
        "maggot",
        "minion",
        "familiar",
        "dummy",
        "spark",
        "shard",
        "globule",
        "droplet",
        "voidling",
        "oozeling",
        "wisp",
        "add",
    ];

    compare_name_words(source_name)
        .iter()
        .any(|token| TRASH_TOKENS.contains(&token.as_str()))
}

fn names_are_encounter_related(source_name: &str, encounter_name: &str) -> bool {
    let source_words = compare_name_words(source_name);
    let encounter_words = compare_name_words(encounter_name);
    if source_words.is_empty() || encounter_words.is_empty() {
        return false;
    }

    source_words == encounter_words
        || contains_contiguous_words(&encounter_words, &source_words)
        || contains_contiguous_words(&source_words, &encounter_words)
}

fn compare_name_words(name: &str) -> Vec<String> {
    name.chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character.to_ascii_lowercase()
            } else {
                ' '
            }
        })
        .collect::<String>()
        .split_whitespace()
        .filter(|word| word.len() >= 2)
        .map(str::to_string)
        .collect()
}

fn contains_contiguous_words(haystack: &[String], needle: &[String]) -> bool {
    if needle.is_empty() || needle.len() > haystack.len() {
        return false;
    }

    haystack
        .windows(needle.len())
        .any(|window| window == needle)
}

fn is_crowd_control_event_type(event_type: &str) -> bool {
    matches!(event_type, "CROWD_CONTROL" | "CROWD_CONTROL_BREAK")
}

fn classify_crowd_control_event(event_type: &str, fields: &[String]) -> Option<&'static str> {
    if !is_player_dest(fields) {
        return None;
    }

    let spell_id = extract_spell_id(fields)?;
    if !is_review_worthy_crowd_control_spell_id(spell_id) {
        return None;
    }

    if !is_debuff_aura(event_type, fields) {
        return None;
    }

    match event_type {
        "SPELL_AURA_APPLIED" => Some("CROWD_CONTROL"),
        "SPELL_AURA_BROKEN" | "SPELL_AURA_BROKEN_SPELL" => Some("CROWD_CONTROL_BREAK"),
        _ => None,
    }
}

fn is_player_dest(fields: &[String]) -> bool {
    let dest_guid = fields.get(4).map(|value| value.as_str());
    let dest_flags = fields.get(6).map(|value| value.as_str());
    classify_unit_type(dest_flags, dest_guid) == Some("PLAYER")
}

fn extract_aura_type<'a>(event_type: &str, fields: &'a [String]) -> Option<&'a str> {
    let index = match event_type {
        "SPELL_AURA_BROKEN_SPELL" => 14,
        _ => 11,
    };

    fields
        .get(index)
        .map(|value| value.trim().trim_matches('"'))
        .filter(|value| !value.is_empty() && *value != "nil")
}

fn is_debuff_aura(event_type: &str, fields: &[String]) -> bool {
    match extract_aura_type(event_type, fields) {
        Some("DEBUFF") | None => true,
        Some(_) => false,
    }
}

fn is_review_worthy_crowd_control_spell_id(spell_id: u32) -> bool {
    matches!(
        spell_id,
        // Death Knight
        221562 |   // Asphyxiate
        108194 |   // Asphyxiate (Unholy)
        47476 |    // Strangulate
        47481 |    // Gnaw
        91797 |    // Monstrous Blow
        91800 |    // Gnaw (ghoul)
        204085 |   // Deathchill
        377048 |   // Absolute Zero
        // Demon Hunter
        179057 |   // Chaos Nova
        211881 |   // Fel Eruption
        205630 |   // Illidan's Grasp
        208618 |   // Illidan's Grasp (throw)
        204490 |   // Sigil of Silence
        207682 |   // Sigil of Silence (talent)
        202137 |   // Sigil of Silence (cast)
        // Druid
        5211 |     // Mighty Bash
        22570 |    // Maim
        203123 |   // Maim (stun aura)
        163505 |   // Rake (stun)
        202246 |   // Overrun
        339 |      // Entangling Roots
        102359 |   // Mass Entanglement
        78675 |    // Solar Beam
        81261 |    // Solar Beam (silence)
        // Evoker
        355689 |   // Landslide
        358385 |   // Landslide (aura)
        372245 |   // Terror of the Skies
        // Hunter
        19577 |    // Intimidation
        24394 |    // Intimidation (pet stun)
        117526 |   // Binding Shot
        162488 |   // Steel Trap
        162480 |   // Steel Trap (root)
        190925 |   // Harpoon
        212638 |   // Tracker's Net
        // Mage
        122 |      // Frost Nova
        33395 |    // Freeze
        157997 |   // Ice Nova
        82691 |    // Ring of Frost
        102051 |   // Frostjaw
        // Monk
        119381 |   // Leg Sweep
        116706 |   // Disable
        // Paladin
        853 |      // Hammer of Justice
        255941 |   // Wake of Ashes
        // Priest
        15487 |    // Silence
        64044 |    // Psychic Horror
        88625 |    // Holy Word: Chastise
        200200 |   // Holy Word: Chastise (stun)
        205369 |   // Mind Bomb
        226943 |   // Mind Bomb (stun)
        108920 |   // Void Tendrils
        114404 |   // Void Tendrils (root)
        // Rogue
        1833 |     // Cheap Shot
        408 |      // Kidney Shot
        199804 |   // Between the Eyes
        315341 |   // Between the Eyes (talent)
        1330 |     // Garrote (silence)
        // Shaman
        118345 |   // Capacitor Totem (stun)
        118905 |   // Static Charge
        192058 |   // Capacitor Totem
        204399 |   // Earthfury
        51485 |    // Earthgrab Totem
        64695 |    // Earthgrab
        204437 |   // Lightning Lasso
        305483 |   // Lightning Lasso (aura)
        197214 |   // Sundering
        // Warlock
        30283 |    // Shadowfury
        89766 |    // Axe Toss
        19647 |    // Spell Lock
        119910 |   // Spell Lock (command)
        132409 |   // Spell Lock (grimoire)
        171138 |   // Shadow Lock
        171140 |   // Shadow Lock (command)
        115781 |   // Optical Blast
        119911 |   // Optical Blast (command)
        22703 |    // Infernal Awakening
        // Warrior
        107570 |   // Storm Bolt
        132169 |   // Storm Bolt (stun)
        46968 |    // Shockwave
        132168 |   // Shockwave (stun)
        376080 |   // Champion's Spear (root)
        105771 |   // Charge (root)
        // Mythic+ affixes that lock players down
        240447 |   // Quaking
        408556 // Entangling
    )
}

fn is_bloodlust_spell_id(spell_id: u32) -> bool {
    matches!(
        spell_id,
        2825 |     // Bloodlust
        32182 |    // Heroism
        80353 |    // Time Warp
        90355 |    // Ancient Hysteria
        160452 |   // Netherwinds
        264667 |   // Primal Rage
        272678 |   // Primal Rage (command pet)
        390386 |   // Fury of the Aspects
        178207 |   // Drums of Fury
        230935 |   // Drums of the Mountain
        256740 |   // Drums of the Maelstrom
        309658 |   // Drums of Deathly Ferocity
        381301 |   // Feral Hide Drums
        444257 // Thunderous Drums
    )
}

/// Major personal and external defensives that are worth seeking to on a VOD.
///
/// The set is deliberately narrow. Short-cooldown absorbs and passive mitigation
/// (Ice Barrier, Power Word: Shield, Shield Block) are excluded because they fire
/// often enough to bury the review-worthy casts.
fn is_defensive_spell_id(spell_id: u32) -> bool {
    matches!(
        spell_id,
        // Death Knight
        48707 |    // Anti-Magic Shell
        48792 |    // Icebound Fortitude
        51052 |    // Anti-Magic Zone
        55233 |    // Vampiric Blood
        49028 |    // Dancing Rune Weapon
        49039 |    // Lichborne
        287081 |   // Lichborne (talent id)
        48743 |    // Death Pact
        // Demon Hunter
        198589 |   // Blur
        196718 |   // Darkness
        196555 |   // Netherwalk
        204021 |   // Fiery Brand
        // Druid
        22812 |    // Barkskin
        61336 |    // Survival Instincts
        102342 |   // Ironbark
        200851 |   // Rage of the Sleeper
        // Hunter
        186265 |   // Aspect of the Turtle
        264735 |   // Survival of the Fittest
        281195 |   // Survival of the Fittest (spec)
        272679 |   // Fortitude of the Bear
        53480 |    // Roar of Sacrifice
        // Mage
        45438 |    // Ice Block
        414658 |   // Ice Cold
        110959 |   // Greater Invisibility
        108978 |   // Alter Time
        342245 |   // Alter Time (Arcane)
        55342 |    // Mirror Image
        414660 |   // Mass Barrier
        // Monk
        115203 |   // Fortifying Brew
        243435 |   // Fortifying Brew (Mistweaver/Windwalker)
        122470 |   // Touch of Karma
        122783 |   // Diffuse Magic
        122278 |   // Dampen Harm
        116849 |   // Life Cocoon
        115176 |   // Zen Meditation
        // Paladin
        642 |      // Divine Shield
        498 |      // Divine Protection
        403876 |   // Divine Protection (Retribution)
        1022 |     // Blessing of Protection
        6940 |     // Blessing of Sacrifice
        204018 |   // Blessing of Spellwarding
        31821 |    // Aura Mastery
        31850 |    // Ardent Defender
        86659 |    // Guardian of Ancient Kings
        389539 |   // Sentinel
        387174 |   // Eye of Tyr
        184662 |   // Shield of Vengeance
        // Priest
        19236 |    // Desperate Prayer
        47585 |    // Dispersion
        33206 |    // Pain Suppression
        47788 |    // Guardian Spirit
        62618 |    // Power Word: Barrier
        271466 |   // Luminous Barrier
        108968 |   // Void Shift
        // Rogue
        31224 |    // Cloak of Shadows
        5277 |     // Evasion
        // Shaman
        108271 |   // Astral Shift
        98008 |    // Spirit Link Totem
        198103 |   // Earth Elemental
        108281 |   // Ancestral Guidance
        207399 |   // Ancestral Protection Totem
        198838 |   // Earthen Wall Totem
        108270 |   // Stone Bulwark Totem
        // Warlock
        104773 |   // Unending Resolve
        108416 |   // Dark Pact
        // Warrior
        871 |      // Shield Wall
        118038 |   // Die by the Sword
        184364 |   // Enraged Regeneration
        97462 |    // Rallying Cry
        23920 |    // Spell Reflection
        12975 |    // Last Stand
        383762 |   // Bitter Immunity
        // Evoker
        363916 |   // Obsidian Scales
        374348 |   // Renewing Blaze
        374227 |   // Zephyr
        363534 |   // Rewind
        357170 |   // Time Dilation
        370665 // Rescue
    )
}

fn should_ignore_unconscious_death(parsed_line: &ParsedLogLine) -> bool {
    if parsed_line.normalized_event_type != "UNIT_DIED" {
        return false;
    }

    matches!(
        extract_unconscious_on_death(&parsed_line.fields),
        Some(true)
    )
}

fn extract_unconscious_on_death(fields: &[String]) -> Option<bool> {
    if fields.len() <= 8 {
        return None;
    }

    let extra_count = fields.len().saturating_sub(8);
    let candidate = match extra_count {
        1 => fields.get(8),
        2 => fields.get(9),
        _ => None,
    }?;

    parse_unconscious_flag(candidate)
}

fn parse_unconscious_flag(value: &str) -> Option<bool> {
    let trimmed = value.trim().trim_matches('"');
    if trimmed.is_empty() || trimmed == "nil" {
        return None;
    }

    match trimmed.to_ascii_lowercase().as_str() {
        "1" | "true" => Some(true),
        "0" | "false" => Some(false),
        _ => None,
    }
}

fn remap_instance_leave_to_challenge_end(
    context: &DebugParseContext,
    parsed_line: &ParsedLogLine,
) -> String {
    if context.in_challenge_mode
        && outdoor_zone_change_left_instance(&parsed_line.raw_event_type, &parsed_line.fields)
    {
        return "CHALLENGE_MODE_END".to_string();
    }

    parsed_line.raw_event_type.clone()
}

fn outdoor_zone_change_left_instance(raw_event_type: &str, fields: &[String]) -> bool {
    if !matches!(
        raw_event_type,
        "ZONE_CHANGE" | "ZONE_CHANGED" | "ZONE_CHANGE_NEW_AREA"
    ) {
        return false;
    }

    matches!(
        fields
            .get(2)
            .map(|value| value.trim().trim_matches('"'))
            .and_then(|value| value.parse::<i64>().ok()),
        Some(0)
    )
}

fn update_debug_context(
    context: &mut DebugParseContext,
    raw_event_type: &str,
    parsed_line: &ParsedLogLine,
) {
    match raw_event_type {
        "CHALLENGE_MODE_START" => {
            context.in_challenge_mode = true;
            context.current_key_level = extract_challenge_mode_key_level(&parsed_line.fields);
            context.challenge_mode_start_log_timestamp = Some(parsed_line.log_timestamp.clone());
        }
        "CHALLENGE_MODE_END" => {
            context.in_challenge_mode = false;
            context.current_key_level = None;
            context.challenge_mode_start_log_timestamp = None;
        }
        "ARENA_MATCH_START" | "PVP_MATCH_START" | "BATTLEGROUND_START" => {
            context.in_pvp_match = true;
            context.pvp_match_start_log_timestamp = Some(parsed_line.log_timestamp.clone());
        }
        "ARENA_MATCH_END" | "PVP_MATCH_COMPLETE" | "BATTLEGROUND_END" => {
            context.in_pvp_match = false;
            context.pvp_match_start_log_timestamp = None;
        }
        _ => {}
    }
}

fn extract_challenge_mode_key_level(fields: &[String]) -> Option<u32> {
    fields.iter().find_map(|value| {
        let trimmed = value.trim_matches('"');
        trimmed
            .parse::<u32>()
            .ok()
            .filter(|&level| level > 0 && level <= 40)
    })
}

pub(crate) fn is_context_only_event(raw_event_type: &str) -> bool {
    is_zone_context_event_type(raw_event_type)
        || matches!(
            raw_event_type,
            "CHALLENGE_MODE_START"
                | "CHALLENGE_MODE_END"
                | "ARENA_MATCH_START"
                | "ARENA_MATCH_END"
                | "PVP_MATCH_START"
                | "PVP_MATCH_COMPLETE"
                | "BATTLEGROUND_START"
                | "BATTLEGROUND_END"
        )
}

fn classify_encounter_category(context: &DebugParseContext, fields: &[String]) -> &'static str {
    if context.in_challenge_mode {
        return "mythicPlus";
    }

    if context.in_pvp_match {
        return "pvp";
    }

    if let Some(difficulty_id) = extract_encounter_difficulty_id(fields) {
        if is_raid_difficulty(difficulty_id) {
            return "raid";
        }
    }

    "unknown"
}

fn extract_encounter_difficulty_id(fields: &[String]) -> Option<u32> {
    fields
        .get(2)
        .and_then(|value| value.trim_matches('"').parse::<u32>().ok())
}

fn is_raid_difficulty(difficulty_id: u32) -> bool {
    matches!(difficulty_id, 3 | 4 | 5 | 6 | 14 | 15 | 16 | 17)
}

fn extract_encounter_name(fields: &[String]) -> Option<String> {
    normalize_name(fields.get(1).map(|value| value.as_str()))
}

fn extract_zone_name(raw_event_type: &str, fields: &[String]) -> Option<String> {
    if !is_zone_context_event_type(raw_event_type) {
        return None;
    }

    fields.iter().find_map(|value| {
        let normalized = normalize_name(Some(value.as_str()))?;
        if is_likely_zone_name(&normalized) {
            Some(normalized)
        } else {
            None
        }
    })
}

fn is_zone_context_event_type(raw_event_type: &str) -> bool {
    matches!(
        raw_event_type,
        "ZONE_CHANGE"
            | "ZONE_CHANGE_NEW_AREA"
            | "ZONE_CHANGED"
            | "ZONE_CHANGED_INDOORS"
            | "PLAYER_ENTERING_WORLD"
            | "MAP_CHANGE"
            | "CHALLENGE_MODE_START"
    )
}

fn is_likely_zone_name(value: &str) -> bool {
    if value.is_empty() {
        return false;
    }

    if value.chars().all(|character| character.is_ascii_digit()) {
        return false;
    }

    value.chars().any(|character| {
        character.is_alphabetic() || character == ' ' || character == '-' || character == '\''
    })
}

fn classify_unit_type(unit_flags: Option<&str>, unit_guid: Option<&str>) -> Option<&'static str> {
    if let Some(flags_value) = parse_combat_log_flags(unit_flags) {
        const TYPE_PLAYER: u32 = 0x0000_0400;
        const TYPE_NPC: u32 = 0x0000_0800;
        const TYPE_PET: u32 = 0x0000_1000;
        const TYPE_GUARDIAN: u32 = 0x0000_2000;
        const TYPE_OBJECT: u32 = 0x0000_4000;

        if flags_value & TYPE_PLAYER != 0 {
            return Some("PLAYER");
        }
        if flags_value & TYPE_PET != 0 {
            return Some("PET");
        }
        if flags_value & TYPE_GUARDIAN != 0 {
            return Some("GUARDIAN");
        }
        if flags_value & TYPE_NPC != 0 {
            return Some("NPC");
        }
        if flags_value & TYPE_OBJECT != 0 {
            return Some("OBJECT");
        }
    }

    let normalized_guid = normalize_name(unit_guid);
    if let Some(guid) = normalized_guid.as_deref() {
        if guid.starts_with("Player-") {
            return Some("PLAYER");
        }
        if guid.starts_with("Pet-") {
            return Some("PET");
        }
        if guid.starts_with("Creature-") || guid.starts_with("Vehicle-") {
            return Some("NPC");
        }
        if guid.starts_with("GameObject-") {
            return Some("OBJECT");
        }

        return Some("UNKNOWN");
    }

    None
}

fn parse_combat_log_flags(raw_flags: Option<&str>) -> Option<u32> {
    let value = raw_flags?.trim();
    if value.is_empty() || value == "nil" {
        return None;
    }

    let unquoted = value.trim_matches('"');
    if let Some(hex_value) = unquoted
        .strip_prefix("0x")
        .or_else(|| unquoted.strip_prefix("0X"))
    {
        return u32::from_str_radix(hex_value, 16).ok();
    }

    unquoted.parse::<u32>().ok()
}

fn is_guardian_target(target_kind: Option<&str>) -> bool {
    matches!(target_kind, Some("GUARDIAN"))
}

fn extract_event_type(header: &str) -> Option<&str> {
    if let Some((_, event_type)) = header.rsplit_once("  ") {
        return Some(event_type.trim());
    }

    header.split_whitespace().last().map(str::trim)
}

pub(crate) fn extract_raw_event_type_from_line(line: &str) -> Option<&str> {
    let header = line.trim().split(',').next()?.trim();
    extract_event_type(header)
}

pub(crate) fn should_reset_player_roster_for_event(raw_event_type: &str) -> bool {
    matches!(
        raw_event_type,
        "ENCOUNTER_START"
            | "CHALLENGE_MODE_START"
            | "ARENA_MATCH_START"
            | "PVP_MATCH_START"
            | "BATTLEGROUND_START"
    )
}

pub(crate) fn extract_log_timestamp(header: &str) -> String {
    if let Some((timestamp, _)) = header.rsplit_once("  ") {
        return timestamp.trim().to_string();
    }

    header
        .split_whitespace()
        .take(2)
        .collect::<Vec<&str>>()
        .join(" ")
}

#[derive(Debug, Clone, Copy)]
#[allow(dead_code)]
pub(crate) struct LogTimestamp {
    pub(crate) month: u32,
    pub(crate) day: u32,
    pub(crate) hour: u32,
    pub(crate) minute: u32,
    pub(crate) second: u32,
    pub(crate) fractional_seconds: f64,
}

impl LogTimestamp {
    pub(crate) fn parse(value: &str) -> Option<Self> {
        let parts: Vec<&str> = value.split_whitespace().collect();
        if parts.len() < 2 {
            return None;
        }

        let date_part = parts[0];
        let time_part = parts[1];

        let date_parts: Vec<&str> = date_part.split('/').collect();
        if date_parts.len() != 2 && date_parts.len() != 3 {
            return None;
        }

        let month: u32 = date_parts[0].parse().ok()?;
        let day: u32 = date_parts[1].parse().ok()?;
        // date_parts[2] would be the year (if present), but we ignore it since we only care about time-of-day

        // Archon and some log exporters append a timezone (`25.067-3`, `25.067+00:00`).
        let time_part = strip_log_timezone_suffix(time_part);
        let time_parts: Vec<&str> = time_part.split(':').collect();
        if time_parts.len() != 3 {
            return None;
        }

        let hour: u32 = time_parts[0].parse().ok()?;
        let minute: u32 = time_parts[1].parse().ok()?;

        let second_and_millis = time_parts[2];
        let (second, fractional) = if let Some((sec, frac_str)) = second_and_millis.split_once('.')
        {
            let sec_val: u32 = sec.parse().ok()?;
            if frac_str.is_empty() {
                (sec_val, 0.0)
            } else {
                let frac_val: f64 = format!("0.{frac_str}").parse().ok()?;
                (sec_val, frac_val)
            }
        } else {
            (second_and_millis.parse().ok()?, 0.0)
        };

        Some(LogTimestamp {
            month,
            day,
            hour,
            minute,
            second,
            fractional_seconds: fractional,
        })
    }

    #[allow(clippy::wrong_self_convention)]
    pub(crate) fn to_seconds_since_midnight(&self) -> f64 {
        (self.hour as f64) * 3600.0
            + (self.minute as f64) * 60.0
            + (self.second as f64)
            + self.fractional_seconds
    }
}

pub(crate) fn log_clock_diff_seconds(origin_seconds: f64, current_seconds: f64) -> f64 {
    let mut diff = current_seconds - origin_seconds;
    // Keep the shortest same-day offset. Only wrap when the recording crossed midnight.
    if diff > 43_200.0 {
        diff -= 86_400.0;
    } else if diff < -43_200.0 {
        diff += 86_400.0;
    }

    diff
}

fn strip_log_timezone_suffix(value: &str) -> &str {
    let without_z = value
        .strip_suffix('Z')
        .or_else(|| value.strip_suffix('z'))
        .unwrap_or(value);

    match without_z.find(['+', '-']) {
        Some(index) => &without_z[..index],
        None => without_z,
    }
}

fn normalize_entity_name(name: Option<&str>, unit_kind: Option<&str>) -> Option<String> {
    let normalized_name = normalize_name(name)?;
    if unit_kind != Some("PLAYER") {
        return Some(normalized_name);
    }

    Some(trim_player_region_suffix(&normalized_name))
}

fn trim_player_region_suffix(name: &str) -> String {
    let Some((without_region, region)) = name.rsplit_once('-') else {
        return name.to_string();
    };

    if !without_region.contains('-') {
        return name.to_string();
    }

    if looks_like_region_code(region) {
        return without_region.to_string();
    }

    name.to_string()
}

fn looks_like_region_code(value: &str) -> bool {
    let length = value.len();
    if !(2..=4).contains(&length) {
        return false;
    }

    value
        .chars()
        .all(|character| character.is_ascii_uppercase())
}

pub(crate) fn normalize_name(name: Option<&str>) -> Option<String> {
    let value = name?.trim();
    if value.is_empty() || value == "nil" {
        return None;
    }

    let normalized = value.trim_matches('"').trim();
    if normalized.is_empty() {
        return None;
    }

    Some(normalized.to_string())
}

pub(crate) fn parse_player_identities_from_log_line(
    line: &str,
) -> Option<(Option<PlayerIdentity>, Option<PlayerIdentity>)> {
    let trimmed_line = line.trim();
    if trimmed_line.is_empty() {
        return None;
    }

    let mut fields = trimmed_line.split(',');
    let header = fields.next()?.trim();
    let event_type = extract_event_type(header)?;
    if event_type == "COMBATANT_INFO" {
        return None;
    }

    let remaining_fields = fields.map(str::trim).collect::<Vec<&str>>();
    if remaining_fields.is_empty() {
        return None;
    }

    let source_identity = parse_player_identity(
        remaining_fields.first().copied(),
        remaining_fields.get(1).copied(),
        remaining_fields.get(2).copied(),
    );
    let target_identity = parse_player_identity(
        remaining_fields.get(4).copied(),
        remaining_fields.get(5).copied(),
        remaining_fields.get(6).copied(),
    );

    if source_identity.is_none() && target_identity.is_none() {
        return None;
    }

    Some((source_identity, target_identity))
}

fn parse_player_identity(
    raw_guid: Option<&str>,
    raw_name: Option<&str>,
    raw_flags: Option<&str>,
) -> Option<PlayerIdentity> {
    let guid = normalize_name(raw_guid)?;
    if classify_unit_type(raw_flags, Some(guid.as_str())) != Some("PLAYER") {
        return None;
    }

    let name = normalize_entity_name(raw_name, Some("PLAYER"));
    Some(PlayerIdentity { guid, name })
}

pub(crate) fn parse_combatant_info_snapshot(line: &str) -> Option<CombatantInfoSnapshot> {
    let trimmed_line = line.trim();
    if trimmed_line.is_empty() {
        return None;
    }

    let mut fields = trimmed_line.split(',');
    let header = fields.next()?.trim();
    let event_type = extract_event_type(header)?;
    if event_type != "COMBATANT_INFO" {
        return None;
    }

    let remaining_fields = fields.map(str::trim).collect::<Vec<&str>>();
    let player_guid = normalize_name(remaining_fields.first().copied())?;
    let spec_id = extract_combatant_info_spec_id(&remaining_fields);
    let (class_name, spec_name) = spec_id
        .and_then(resolve_spec_details)
        .map(|(class_name, spec_name)| (Some(class_name.to_string()), Some(spec_name.to_string())))
        .unwrap_or((None, None));

    Some(CombatantInfoSnapshot {
        player_guid,
        spec_id,
        class_name,
        spec_name,
    })
}

fn extract_combatant_info_spec_id(fields: &[&str]) -> Option<u32> {
    const SPEC_INDEX_CANDIDATES: [usize; 2] = [23, 22];

    let indexed_spec = SPEC_INDEX_CANDIDATES.iter().find_map(|index| {
        let spec_id = parse_u32_field_value(fields.get(*index).copied())?;
        let next_field = fields
            .get(index.saturating_add(1))
            .map(|value| value.trim())
            .unwrap_or_default();
        if !next_field.is_empty() && !next_field.starts_with('(') && !next_field.starts_with('[') {
            return None;
        }

        Some(spec_id)
    });

    if indexed_spec.is_some() {
        return indexed_spec;
    }

    // COMBATANT_INFO payloads can shift between patches. The current spec id is
    // the numeric value immediately before the first list-like segment
    // (class talents or powers block), so use that as a resilient fallback.
    for index in 1..fields.len() {
        let current = fields[index].trim();
        if !current.starts_with('(') && !current.starts_with('[') {
            continue;
        }

        let previous = fields[index - 1].trim();
        if let Some(spec_id) = parse_u32_field_value(Some(previous)) {
            return Some(spec_id);
        }
    }

    None
}

fn parse_u32_field_value(value: Option<&str>) -> Option<u32> {
    let raw = value?.trim().trim_matches('"');
    if raw.is_empty() {
        return None;
    }

    if let Ok(parsed) = raw.parse::<u32>() {
        return Some(parsed);
    }

    let digit_prefix = raw
        .chars()
        .take_while(|character| character.is_ascii_digit())
        .collect::<String>();
    if digit_prefix.is_empty() {
        return None;
    }

    digit_prefix.parse::<u32>().ok()
}

fn resolve_spec_details(spec_id: u32) -> Option<(&'static str, &'static str)> {
    match spec_id {
        62 => Some(("Mage", "Arcane")),
        63 => Some(("Mage", "Fire")),
        64 => Some(("Mage", "Frost")),
        65 => Some(("Paladin", "Holy")),
        66 => Some(("Paladin", "Protection")),
        70 => Some(("Paladin", "Retribution")),
        71 => Some(("Warrior", "Arms")),
        72 => Some(("Warrior", "Fury")),
        73 => Some(("Warrior", "Protection")),
        102 => Some(("Druid", "Balance")),
        103 => Some(("Druid", "Feral")),
        104 => Some(("Druid", "Guardian")),
        105 => Some(("Druid", "Restoration")),
        250 => Some(("Death Knight", "Blood")),
        251 => Some(("Death Knight", "Frost")),
        252 => Some(("Death Knight", "Unholy")),
        253 => Some(("Hunter", "Beast Mastery")),
        254 => Some(("Hunter", "Marksmanship")),
        255 => Some(("Hunter", "Survival")),
        256 => Some(("Priest", "Discipline")),
        257 => Some(("Priest", "Holy")),
        258 => Some(("Priest", "Shadow")),
        259 => Some(("Rogue", "Assassination")),
        260 => Some(("Rogue", "Outlaw")),
        261 => Some(("Rogue", "Subtlety")),
        262 => Some(("Shaman", "Elemental")),
        263 => Some(("Shaman", "Enhancement")),
        264 => Some(("Shaman", "Restoration")),
        265 => Some(("Warlock", "Affliction")),
        266 => Some(("Warlock", "Demonology")),
        267 => Some(("Warlock", "Destruction")),
        268 => Some(("Monk", "Brewmaster")),
        269 => Some(("Monk", "Windwalker")),
        270 => Some(("Monk", "Mistweaver")),
        577 => Some(("Demon Hunter", "Havoc")),
        581 => Some(("Demon Hunter", "Vengeance")),
        1480 => Some(("Demon Hunter", "Devourer")),
        1467 => Some(("Evoker", "Devastation")),
        1468 => Some(("Evoker", "Preservation")),
        1473 => Some(("Evoker", "Augmentation")),
        _ => None,
    }
}
