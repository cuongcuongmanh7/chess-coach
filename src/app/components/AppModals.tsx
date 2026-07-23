import { GameInsightsModals } from "./GameInsightsModals";
import { ImportSettingsModals } from "./ImportSettingsModals";
import { LibraryAccountModals } from "./LibraryAccountModals";

export function AppModals() {
  return (
    <>
      <GameInsightsModals />
      <LibraryAccountModals />
      <ImportSettingsModals />
    </>
  );
}
