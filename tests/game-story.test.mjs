import assert from "node:assert/strict";
import test from "node:test";
import {
  advantageState,
  buildGameStory,
  evaluationForPerspective,
  MAX_KEY_MOMENTS,
  resolveStoryPerspective,
  scoreForChart,
  scoreForPerspective,
} from "../src/features/game-story/model.ts";

function step(ply, overrides = {}) {
  return {
    ply,
    moveNumber: Math.ceil(ply / 2),
    color: ply % 2 ? "w" : "b",
    san: ply % 2 ? "e4" : "e5",
    tags: [],
    clockSeconds: null,
    thinkTimeSeconds: null,
    isQuickMove: false,
    isTimePressure: false,
    ...overrides,
  };
}

function engine(whiteScoreCp, overrides = {}) {
  return {
    evaluation: whiteScoreCp >= 0 ? `+${(whiteScoreCp / 100).toFixed(2)}` : `−${Math.abs(whiteScoreCp / 100).toFixed(2)}`,
    whiteScoreCp,
    centipawnLoss: 0,
    quality: "good",
    ...overrides,
  };
}

test("chuẩn hóa evaluation và mate theo góc nhìn Trắng", () => {
  assert.equal(scoreForChart(325, false), 3.25);
  assert.equal(scoreForChart(2_000, false), 8);
  assert.equal(scoreForChart(-99_700, true), -8);
  assert.equal(advantageState(149), "balanced");
  assert.equal(advantageState(150), "white");
  assert.equal(advantageState(-150), "black");
});

test("đảo evaluation và mate khi xem theo góc nhìn Đen", () => {
  assert.equal(scoreForPerspective(325, "black"), -325);
  assert.equal(evaluationForPerspective("+3.25", 325, "black"), "−3.25");
  assert.equal(evaluationForPerspective("−1.40", -140, "black"), "+1.40");
  assert.equal(evaluationForPerspective("M3", 99_700, "black"), "−M3");
  assert.equal(evaluationForPerspective("−M2", -99_800, "black"), "M2");
});

test("tự chọn góc nhìn theo hồ sơ người chơi", () => {
  assert.equal(resolveStoryPerspective("Cuongkool", "BradenXLi", "cuongKOOL"), "black");
  assert.equal(resolveStoryPerspective("@BradenXLi", "bradenxli", "Cuongkool"), "white");
  assert.equal(resolveStoryPerspective("KhongKhop", "BradenXLi", "Cuongkool"), "white");
  assert.equal(resolveStoryPerspective(null, "BradenXLi", "Cuongkool"), "white");
});

test("phát hiện bước ngoặt và chuyển trạng thái lợi thế", () => {
  const story = buildGameStory(
    [step(1), step(2)],
    { 1: engine(20), 2: engine(-240, { centipawnLoss: 260, quality: "blunder" }) },
  );
  assert.equal(story.keyMoments.length, 1);
  assert.equal(story.keyMoments[0].title, "Đen tạo bước ngoặt");
  assert.deepEqual(story.keyMoments[0].kinds, ["swing", "state-change"]);
});

test("phân biệt bỏ lỡ mate với thoát lưới chiếu hết", () => {
  const story = buildGameStory(
    [step(1, { color: "b" }), step(2, { color: "w" })],
    {
      1: engine(99_700, { evaluation: "M3" }),
      2: engine(80, { evaluation: "+0.80", quality: "mistake" }),
    },
  );
  const missedMate = story.keyMoments.find((moment) => moment.index === 1);
  assert.equal(missedMate.title, "Bỏ lỡ cơ hội chiếu hết");
  assert.ok(missedMate.kinds.includes("mate"));
});

test("ghi nhận overlay thời gian và gộp sự kiện đặc biệt cùng ply", () => {
  const story = buildGameStory(
    [step(1, {
      san: "e8=Q",
      tags: ["Tốt thông", "Phong cấp"],
      thinkTimeSeconds: 2,
      isQuickMove: true,
      isTimePressure: true,
    })],
    { 1: engine(480, { centipawnLoss: 120, quality: "mistake" }) },
  );
  assert.equal(story.hasTimeData, true);
  assert.equal(story.points[0].isQuickError, true);
  assert.equal(story.points[0].isPressureError, true);
  assert.deepEqual(story.keyMoments[0].kinds, ["promotion", "passed-pawn"]);
});

test("dùng nhãn Brilliant đã chuẩn hóa trong dữ liệu Game Story", () => {
  const story = buildGameStory(
    [step(1)],
    { 1: engine(40, { quality: "best", displayQuality: "brilliant" }) },
  );
  assert.equal(story.points[0].quality, "brilliant");
  assert.equal(story.points[0].isQuickError, false);
});

test("chỉ giữ các key moment quan trọng nhất cho ván dài", () => {
  const steps = Array.from({ length: 16 }, (_, index) => step(index + 1));
  const cache = Object.fromEntries(steps.map((item, index) => [
    item.ply,
    engine(index % 2 ? -300 - index * 10 : 300 + index * 10),
  ]));
  const story = buildGameStory(steps, cache);
  assert.equal(story.keyMoments.length, MAX_KEY_MOMENTS);
  assert.ok(story.keyMoments.every((moment, index, moments) => (
    index === 0 || moments[index - 1].index < moment.index
  )));
});
