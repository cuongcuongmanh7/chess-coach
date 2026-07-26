import { GameInsightsModals } from "./GameInsightsModals";
import { ImportSettingsModals } from "./ImportSettingsModals";
import { LibraryAccountModals } from "./LibraryAccountModals";
import { BatchAnalysisPanel } from "./BatchAnalysisPanel";
import { TrainingModal } from "../../features/training/components/TrainingModal";
import { OpeningTrainerModal } from "../../features/opening-trainer/components/OpeningTrainerModal";

export function AppModals() {
  return (
    <>
      <GameInsightsModals />
      <LibraryAccountModals />
      <ImportSettingsModals />
      <BatchAnalysisPanel />
      <TrainingModal />
      <OpeningTrainerModal />
    </>
  );
}
