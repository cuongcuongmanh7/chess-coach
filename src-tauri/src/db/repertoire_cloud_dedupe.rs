use crate::*;
use std::collections::HashMap;

pub(crate) struct OldRepertoire {
    pub(crate) old_id: String,
    pub(crate) new_id: String,
    pub(crate) profile_id: i64,
    pub(crate) color: String,
    pub(crate) name: String,
    pub(crate) eco: Option<String>,
    pub(crate) source: String,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
    progress_count: i64,
}

pub(crate) struct OldNode {
    pub(crate) position_key: String,
    pub(crate) fen: String,
    pub(crate) move_san: String,
    pub(crate) move_uci: String,
    pub(crate) side_to_move: String,
    pub(crate) is_user_move: i64,
    pub(crate) source: String,
    pub(crate) frequency: i64,
    pub(crate) avg_cpl: Option<f64>,
    pub(crate) comment: Option<String>,
    old_id: String,
    old_repertoire_id: String,
    old_parent_id: Option<String>,
    node_key: String,
    created_at: String,
    updated_at: String,
}

struct OldProgress {
    node_id: String,
    correct_count: i64,
    wrong_count: i64,
    correct_streak: i64,
    status: String,
    interval_days: i64,
    due_at: String,
    last_correct_at: Option<String>,
    updated_at: String,
}

pub(crate) struct TargetNode {
    pub(crate) new_id: String,
    pub(crate) new_repertoire_id: String,
    pub(crate) new_parent_id: Option<String>,
    pub(crate) payload: OldNode,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
    rank: (bool, i64),
}

pub(crate) struct TargetProgress {
    pub(crate) node_id: String,
    pub(crate) profile_id: i64,
    pub(crate) correct_count: i64,
    pub(crate) wrong_count: i64,
    pub(crate) correct_streak: i64,
    pub(crate) status: String,
    pub(crate) interval_days: i64,
    pub(crate) due_at: String,
    pub(crate) last_correct_at: Option<String>,
    pub(crate) updated_at: String,
}

pub(crate) struct RewritePlan {
    pub(crate) repertoires: HashMap<String, OldRepertoire>,
    pub(crate) nodes: HashMap<String, TargetNode>,
    pub(crate) progress: HashMap<String, TargetProgress>,
}

/// Tính trạng thái đích của cả ba bảng repertoire sau khi đổi sang doc id
/// deterministic: gộp các bản trùng family và hợp nhất tiến độ bằng MAX.
pub(crate) fn plan_repertoire_rewrite(connection: &Connection) -> rusqlite::Result<RewritePlan> {
    let repertoires = read_old_repertoires(connection)?;
    let nodes = read_old_nodes(connection)?;
    let progress = read_old_progress(connection)?;

    let by_old_id: HashMap<&str, &OldRepertoire> = repertoires
        .iter()
        .map(|item| (item.old_id.as_str(), item))
        .collect();
    let survivors = pick_survivors(&repertoires);
    let target_repertoires = merge_repertoires(&repertoires, &survivors);
    let node_map = build_node_map(&nodes, &by_old_id);
    let target_nodes = merge_nodes(nodes, &by_old_id, &survivors, &node_map);
    let target_progress = merge_progress(progress, &node_map, &target_nodes, &target_repertoires);
    Ok(RewritePlan {
        repertoires: target_repertoires,
        nodes: target_nodes,
        progress: target_progress,
    })
}

/// Repertoire có `profile_id` không còn hồ sơ thì bị loại: row đó đã unreachable
/// vì `list_repertoires` lọc theo `profile_id`, và nếu để lại sẽ làm export cloud
/// không dựng được `profile_key` rồi khoá toàn bộ sync.
fn read_old_repertoires(connection: &Connection) -> rusqlite::Result<Vec<OldRepertoire>> {
    let mut statement = connection.prepare(
        "SELECT r.id, r.profile_id, p.platform, p.username, r.color, r.name, r.eco,
                r.source, r.created_at, r.updated_at,
                (SELECT COUNT(*) FROM repertoire_nodes n
                   JOIN repertoire_progress g ON g.node_id = n.id
                  WHERE n.repertoire_id = r.id)
         FROM repertoires r
         JOIN player_profiles p ON p.id = r.profile_id",
    )?;
    let rows = statement.query_map([], |row| {
        let platform: String = row.get(2)?;
        let username: String = row.get(3)?;
        let color: String = row.get(4)?;
        let name: String = row.get(5)?;
        let profile_key = repertoire_profile_key(&platform, &username);
        let new_id = repertoire_doc_id(&profile_key, &color, &repertoire_family_key(&name));
        Ok(OldRepertoire {
            old_id: row.get(0)?,
            new_id,
            profile_id: row.get(1)?,
            color,
            name,
            eco: row.get(6)?,
            source: row.get(7)?,
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
            progress_count: row.get(10)?,
        })
    })?;
    rows.collect()
}

fn read_old_nodes(connection: &Connection) -> rusqlite::Result<Vec<OldNode>> {
    let mut statement = connection.prepare(
        "SELECT id, repertoire_id, parent_id, position_key, fen, move_san, move_uci,
                side_to_move, is_user_move, source, frequency, avg_cpl, comment,
                created_at, updated_at
         FROM repertoire_nodes",
    )?;
    let rows = statement.query_map([], |row| {
        let position_key: String = row.get(3)?;
        let move_uci: String = row.get(6)?;
        Ok(OldNode {
            old_id: row.get(0)?,
            old_repertoire_id: row.get(1)?,
            old_parent_id: row.get(2)?,
            node_key: format!("{position_key}|{move_uci}"),
            position_key,
            fen: row.get(4)?,
            move_san: row.get(5)?,
            move_uci,
            side_to_move: row.get(7)?,
            is_user_move: row.get(8)?,
            source: row.get(9)?,
            frequency: row.get(10)?,
            avg_cpl: row.get(11)?,
            comment: row.get(12)?,
            created_at: row.get(13)?,
            updated_at: row.get(14)?,
        })
    })?;
    rows.collect()
}

fn read_old_progress(connection: &Connection) -> rusqlite::Result<Vec<OldProgress>> {
    let mut statement = connection.prepare(
        "SELECT node_id, correct_count, wrong_count, correct_streak, status,
                interval_days, due_at, last_correct_at, updated_at
         FROM repertoire_progress",
    )?;
    let rows = statement.query_map([], |row| {
        Ok(OldProgress {
            node_id: row.get(0)?,
            correct_count: row.get(1)?,
            wrong_count: row.get(2)?,
            correct_streak: row.get(3)?,
            status: row.get(4)?,
            interval_days: row.get(5)?,
            due_at: row.get(6)?,
            last_correct_at: row.get(7)?,
            updated_at: row.get(8)?,
        })
    })?;
    rows.collect()
}

/// Survivor theo đúng thứ tự của `matching_repertoire_ids`: nhiều tiến độ nhất,
/// rồi `updated_at` mới nhất, rồi id nhỏ nhất để kết quả tất định.
fn pick_survivors(repertoires: &[OldRepertoire]) -> HashMap<String, String> {
    let mut best: HashMap<String, &OldRepertoire> = HashMap::new();
    for item in repertoires {
        let replace = match best.get(&item.new_id) {
            None => true,
            Some(current) => {
                (item.progress_count, &item.updated_at, &current.old_id)
                    > (current.progress_count, &current.updated_at, &item.old_id)
            }
        };
        if replace {
            best.insert(item.new_id.clone(), item);
        }
    }
    best.into_iter()
        .map(|(new_id, item)| (new_id, item.old_id.clone()))
        .collect()
}

fn merge_repertoires(
    repertoires: &[OldRepertoire],
    survivors: &HashMap<String, String>,
) -> HashMap<String, OldRepertoire> {
    let mut merged: HashMap<String, OldRepertoire> = HashMap::new();
    for item in repertoires {
        let is_survivor = survivors.get(&item.new_id) == Some(&item.old_id);
        match merged.get_mut(&item.new_id) {
            None => {
                merged.insert(
                    item.new_id.clone(),
                    OldRepertoire {
                        old_id: item.old_id.clone(),
                        new_id: item.new_id.clone(),
                        profile_id: item.profile_id,
                        color: item.color.clone(),
                        name: repertoire_family_name(&item.name).to_string(),
                        eco: item.eco.clone(),
                        source: item.source.clone(),
                        created_at: item.created_at.clone(),
                        updated_at: item.updated_at.clone(),
                        progress_count: item.progress_count,
                    },
                );
            }
            Some(current) => {
                if item.created_at < current.created_at {
                    current.created_at = item.created_at.clone();
                }
                if item.updated_at > current.updated_at {
                    current.updated_at = item.updated_at.clone();
                }
                if is_survivor {
                    current.name = repertoire_family_name(&item.name).to_string();
                    current.eco = item.eco.clone();
                    current.source = item.source.clone();
                    current.profile_id = item.profile_id;
                }
            }
        }
    }
    merged
}

/// `old_node_id -> new_node_id`, dùng để ánh xạ cả `parent_id` và tiến độ.
fn build_node_map(
    nodes: &[OldNode],
    by_old_id: &HashMap<&str, &OldRepertoire>,
) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for node in nodes {
        if let Some(repertoire) = by_old_id.get(node.old_repertoire_id.as_str()) {
            map.insert(
                node.old_id.clone(),
                repertoire_node_id(&repertoire.new_id, &node.node_key),
            );
        }
    }
    map
}

fn merge_nodes(
    nodes: Vec<OldNode>,
    by_old_id: &HashMap<&str, &OldRepertoire>,
    survivors: &HashMap<String, String>,
    node_map: &HashMap<String, String>,
) -> HashMap<String, TargetNode> {
    let mut merged: HashMap<String, TargetNode> = HashMap::new();
    for node in nodes {
        let Some(repertoire) = by_old_id.get(node.old_repertoire_id.as_str()) else {
            continue;
        };
        let new_repertoire_id = repertoire.new_id.clone();
        let new_id = repertoire_node_id(&new_repertoire_id, &node.node_key);
        let is_survivor = survivors.get(&new_repertoire_id) == Some(&node.old_repertoire_id);
        let rank = (is_survivor, node.frequency);
        let new_parent_id = node
            .old_parent_id
            .as_ref()
            .and_then(|parent| node_map.get(parent).cloned());
        let created_at = node.created_at.clone();
        let updated_at = node.updated_at.clone();
        match merged.get_mut(&new_id) {
            None => {
                merged.insert(
                    new_id.clone(),
                    TargetNode {
                        new_id,
                        new_repertoire_id,
                        new_parent_id,
                        payload: node,
                        created_at,
                        updated_at,
                        rank,
                    },
                );
            }
            Some(current) => {
                if created_at < current.created_at {
                    current.created_at = created_at;
                }
                if updated_at > current.updated_at {
                    current.updated_at = updated_at;
                }
                if rank > current.rank {
                    current.rank = rank;
                    current.new_parent_id = new_parent_id;
                    current.payload = node;
                }
            }
        }
    }
    merged
}

/// Tiến độ của các bản trùng được hợp nhất chứ không bỏ bên thua: bộ đếm lấy MAX,
/// còn trạng thái/lịch lấy từ row có `updated_at` lớn nhất.
fn merge_progress(
    progress: Vec<OldProgress>,
    node_map: &HashMap<String, String>,
    target_nodes: &HashMap<String, TargetNode>,
    target_repertoires: &HashMap<String, OldRepertoire>,
) -> HashMap<String, TargetProgress> {
    let mut merged: HashMap<String, TargetProgress> = HashMap::new();
    for item in progress {
        // node_id ở đây là id CŨ; phải đi qua node_map để ra id mới, vì các bản
        // trùng cùng gộp vào một node và tra trực tiếp sẽ bỏ sót bên thua.
        let Some(node) = node_map
            .get(&item.node_id)
            .and_then(|new_id| target_nodes.get(new_id))
        else {
            continue;
        };
        let Some(repertoire) = target_repertoires.get(&node.new_repertoire_id) else {
            continue;
        };
        let new_id = node.new_id.clone();
        match merged.get_mut(&new_id) {
            None => {
                merged.insert(
                    new_id.clone(),
                    TargetProgress {
                        node_id: new_id,
                        profile_id: repertoire.profile_id,
                        correct_count: item.correct_count,
                        wrong_count: item.wrong_count,
                        correct_streak: item.correct_streak,
                        status: item.status,
                        interval_days: item.interval_days,
                        due_at: item.due_at,
                        last_correct_at: item.last_correct_at,
                        updated_at: item.updated_at,
                    },
                );
            }
            Some(current) => {
                current.correct_count = current.correct_count.max(item.correct_count);
                current.wrong_count = current.wrong_count.max(item.wrong_count);
                current.correct_streak = current.correct_streak.max(item.correct_streak);
                if item.last_correct_at > current.last_correct_at {
                    current.last_correct_at = item.last_correct_at;
                }
                if item.updated_at > current.updated_at {
                    current.status = item.status;
                    current.interval_days = item.interval_days;
                    current.due_at = item.due_at;
                    current.updated_at = item.updated_at;
                }
            }
        }
    }
    merged
}
