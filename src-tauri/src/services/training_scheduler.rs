#[derive(Debug, PartialEq)]
pub(crate) struct ReviewSchedule {
    pub(crate) result: &'static str,
    pub(crate) delay_seconds: i64,
    pub(crate) interval_days: u32,
    pub(crate) next_streak: u32,
    pub(crate) correct: bool,
}

pub(crate) fn schedule_review(
    current_interval_days: u32,
    correct_streak: u32,
    centipawn_loss: f64,
    hints_used: u32,
    failed_attempts: u32,
    duration_ms: u64,
    same_correct_day: bool,
) -> ReviewSchedule {
    if !centipawn_loss.is_finite() || centipawn_loss > 35.0 {
        return ReviewSchedule {
            result: "wrong",
            delay_seconds: 10 * 60,
            interval_days: 0,
            next_streak: 0,
            correct: false,
        };
    }

    let next_streak = if same_correct_day {
        correct_streak
    } else {
        correct_streak.saturating_add(1)
    };
    if hints_used >= 3 {
        return ReviewSchedule {
            result: "revealed",
            delay_seconds: 10 * 60,
            interval_days: 0,
            next_streak: 0,
            correct: false,
        };
    }
    if failed_attempts > 0 || hints_used > 0 {
        return ReviewSchedule {
            result: "assisted",
            delay_seconds: 24 * 60 * 60,
            interval_days: 1,
            next_streak,
            correct: true,
        };
    }
    if duration_ms > 20_000 {
        return ReviewSchedule {
            result: "slow",
            delay_seconds: 3 * 24 * 60 * 60,
            interval_days: 3,
            next_streak,
            correct: true,
        };
    }

    let interval_days = if current_interval_days == 0 {
        7
    } else {
        current_interval_days.saturating_mul(2).min(90)
    };
    ReviewSchedule {
        result: "clean",
        delay_seconds: i64::from(interval_days) * 24 * 60 * 60,
        interval_days,
        next_streak,
        correct: true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn schedules_wrong_and_revealed_for_ten_minutes() {
        assert_eq!(schedule_review(7, 2, 36.0, 0, 0, 1_000, false).delay_seconds, 600);
        assert_eq!(schedule_review(7, 2, 0.0, 3, 0, 1_000, false).delay_seconds, 600);
        assert_eq!(schedule_review(7, 2, 0.0, 3, 0, 1_000, false).next_streak, 0);
    }

    #[test]
    fn schedules_assisted_slow_and_clean_reviews() {
        assert_eq!(schedule_review(0, 0, 10.0, 1, 0, 1_000, false).interval_days, 1);
        assert_eq!(schedule_review(0, 0, 10.0, 0, 0, 20_001, false).interval_days, 3);
        assert_eq!(schedule_review(0, 0, 10.0, 0, 0, 1_000, false).interval_days, 7);
        assert_eq!(schedule_review(60, 2, 10.0, 0, 0, 1_000, false).interval_days, 90);
    }

    #[test]
    fn only_counts_one_correct_streak_per_day() {
        assert_eq!(schedule_review(7, 2, 0.0, 0, 0, 1_000, true).next_streak, 2);
        assert_eq!(schedule_review(7, 2, 0.0, 0, 0, 1_000, false).next_streak, 3);
    }
}
