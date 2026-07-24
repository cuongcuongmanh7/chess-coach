import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { requireFirestore } from "./firebaseClient";

const DIRTY_KEY = "kypho-sync-preferences-dirty";

export type SyncedPreferences = {
  ai_provider: "openai" | "gemini";
  openai_model: string;
  gemini_model: string;
  auto_explain_mode: "off" | "mistakes" | "visited";
  include_inaccuracies: boolean;
};

const OPENAI_MODELS = new Set(["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]);
const GEMINI_MODELS = new Set(["gemini-3.5-flash-lite", "gemini-3.6-flash"]);

function readLocalPreferences(): SyncedPreferences {
  const provider = localStorage.getItem("kypho-ai-provider");
  const autoMode = localStorage.getItem("kypho-ai-auto-mode");
  const openaiModel = localStorage.getItem("kypho-ai-model-openai");
  const geminiModel = localStorage.getItem("kypho-ai-model-gemini");
  return {
    ai_provider: provider === "gemini" ? "gemini" : "openai",
    openai_model: openaiModel && OPENAI_MODELS.has(openaiModel)
      ? openaiModel
      : "gpt-5.6-sol",
    gemini_model: geminiModel && GEMINI_MODELS.has(geminiModel)
      ? geminiModel
      : "gemini-3.5-flash-lite",
    auto_explain_mode: autoMode === "off" || autoMode === "visited" ? autoMode : "mistakes",
    include_inaccuracies: localStorage.getItem("kypho-training-inaccuracies") === "true",
  };
}

function parseRemotePreferences(value: unknown): SyncedPreferences | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (
    !["openai", "gemini"].includes(String(raw.ai_provider))
    || !OPENAI_MODELS.has(String(raw.openai_model))
    || !GEMINI_MODELS.has(String(raw.gemini_model))
    || !["off", "mistakes", "visited"].includes(String(raw.auto_explain_mode))
    || typeof raw.include_inaccuracies !== "boolean"
  ) return null;
  return {
    ai_provider: raw.ai_provider as SyncedPreferences["ai_provider"],
    openai_model: String(raw.openai_model),
    gemini_model: String(raw.gemini_model),
    auto_explain_mode: raw.auto_explain_mode as SyncedPreferences["auto_explain_mode"],
    include_inaccuracies: raw.include_inaccuracies,
  };
}

function applyRemotePreferences(preferences: SyncedPreferences) {
  localStorage.setItem("kypho-ai-provider", preferences.ai_provider);
  localStorage.setItem("kypho-ai-model-openai", preferences.openai_model);
  localStorage.setItem("kypho-ai-model-gemini", preferences.gemini_model);
  localStorage.setItem("kypho-ai-auto-mode", preferences.auto_explain_mode);
  localStorage.setItem(
    "kypho-training-inaccuracies",
    String(preferences.include_inaccuracies),
  );
  window.dispatchEvent(new CustomEvent("kypho-cloud-preferences", {
    detail: preferences,
  }));
}

export function markSyncedPreferencesChanged() {
  localStorage.setItem(DIRTY_KEY, "true");
}

export async function syncCloudPreferences(uid: string) {
  const db = requireFirestore();
  const reference = doc(db, "users", uid, "preferences", "app");
  const snapshot = await getDoc(reference);
  const remote = snapshot.exists() ? parseRemotePreferences(snapshot.data()) : null;
  const local = readLocalPreferences();
  const dirty = localStorage.getItem(DIRTY_KEY) === "true";

  if (remote && !dirty) {
    applyRemotePreferences(remote);
    return remote;
  }
  await setDoc(reference, {
    ...local,
    schemaVersion: 1,
    updatedAt: serverTimestamp(),
  });
  localStorage.removeItem(DIRTY_KEY);
  return local;
}
