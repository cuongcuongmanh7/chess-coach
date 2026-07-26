import { AppControllerProvider } from "./app/AppControllerContext";
import { AppChrome } from "./app/components/AppChrome";
import { AppModals } from "./app/components/AppModals";
import { AnalysisWorkspace } from "./app/components/AnalysisWorkspace";
import { useAppController } from "./app/hooks/useAppController";
import { StartupWorkspace } from "./features/home/components/StartupWorkspace";

function App() {
  const controller = useAppController();

  return (
    <AppControllerProvider value={controller}>
      <div className={`app-shell ${controller.sidebarCollapsed ? "sidebar-collapsed" : ""} ${controller.candidateState.active ? "candidate-focus-mode" : ""}`}>
        <AppChrome />
        {controller.workspaceMode === "analysis"
          ? <AnalysisWorkspace />
          : <StartupWorkspace />}
        <AppModals />
      </div>
    </AppControllerProvider>
  );
}

export default App;
