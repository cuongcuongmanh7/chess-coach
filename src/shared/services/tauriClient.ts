import { invoke } from "@tauri-apps/api/core";

export const isTauri = () => "__TAURI_INTERNALS__" in window;

export function invokeCommand<TResult>(
  command: string,
  args?: Record<string, unknown>,
) {
  return invoke<TResult>(command, args);
}
