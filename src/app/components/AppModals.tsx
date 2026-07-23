import { GameInsightsModals } from "./GameInsightsModals";
import { ImportSettingsModals } from "./ImportSettingsModals";
import { LibraryAccountModals } from "./LibraryAccountModals";
import { TrainingModal } from "../../features/training/components/TrainingModal";

export function AppModals() {
  return (
    <>
      <GameInsightsModals />
      <LibraryAccountModals />
      <ImportSettingsModals />
      <TrainingModal />
    </>
  );
}
