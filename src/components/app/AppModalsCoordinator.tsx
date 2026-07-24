import { SettingsDialog } from "../SettingsDialog";
import { LicensesDialog } from "../LicensesDialog";
import { PrivacyDialog } from "../PrivacyDialog";
import { FileViewerDialog } from "../FileViewerDialog";
import { ConsentModal } from "../ConsentModal";
import { UpdateModal } from "../UpdateModal";
import { CheckingUpdatesModal } from "../CheckingUpdatesModal";
import { SourceDetectedModal } from "../SourceDetectedModal";
import FeedbackDialog from "../FeedbackDialog";
import { Session, SourceMetadata } from "../../types";

export interface AppModalsCoordinatorProps {
  showSettings: boolean;
  onCloseSettings: () => void;
  theme: string;
  onThemeChange: (t: string) => void;
  appearance: string;
  onAppearanceChange: (a: string) => void;
  currentCustomTheme: any;
  onCustomThemeChange: (c: any) => void;
  sources: SourceMetadata[];
  onRefreshSources: () => void;
  dateFormat: string;
  onDateFormatChange: (val: string) => void;
  timeFormat: string;
  onTimeFormatChange: (val: string) => void;
  showSeconds: boolean;
  onShowSecondsChange: (val: boolean) => void;
  numberFormat: string;
  onNumberFormatChange: (val: string) => void;
  excludedPaths: string;
  onExcludedPathsChange: (val: string) => void;
  indexSubagents: boolean;
  onIndexSubagentsChange: (val: boolean) => void;
  onUpdateAvailable: (update: any) => void;
  triggerManualUpdateCheck: () => void;
  fontSize: number;
  onFontSizeChange: (val: number) => void;
  selectedSession: Session | null;
  showConsentModal: boolean;
  onConsentDecision: (consented: boolean) => void;
  showUpdateModal: boolean;
  updateManifest: any;
  isUpdating: boolean;
  updateProgress: number;
  updateError: string | null;
  onCloseUpdateModal: () => void;
  onStartUpdate: () => void;
  showCheckingModal: boolean;
  checkingStatus: "checking" | "upToDate" | "error";
  checkingErrorMsg: string | null;
  onCloseCheckingModal: () => void;
  hasDetectedSources: boolean;
  detectedSources: Record<string, boolean>;
  onToggleDetectedSource: (sourceId: string) => void;
  onIgnoreAllDetectedSources: () => void;
  onSaveDetectedSources: () => void;
  getSourceDisplayNameById: (id: string) => string;
  showFeedback: boolean;
  onCloseFeedback: () => void;
  appVersion: string;
  showLicenses: boolean;
  onCloseLicenses: () => void;
  showPrivacy: boolean;
  onClosePrivacy: () => void;
}

export const AppModalsCoordinator = (props: AppModalsCoordinatorProps) => {
  return (
    <>
      {/* Settings Dialog */}
      <SettingsDialog
        isOpen={props.showSettings}
        onClose={props.onCloseSettings}
        theme={props.theme}
        onThemeChange={props.onThemeChange}
        appearance={props.appearance}
        onAppearanceChange={props.onAppearanceChange}
        customTheme={props.currentCustomTheme}
        onCustomThemeChange={props.onCustomThemeChange}
        sources={props.sources}
        onRefreshSources={props.onRefreshSources}
        dateFormat={props.dateFormat}
        onDateFormatChange={props.onDateFormatChange}
        timeFormat={props.timeFormat}
        onTimeFormatChange={props.onTimeFormatChange}
        showSeconds={props.showSeconds}
        onShowSecondsChange={props.onShowSecondsChange}
        numberFormat={props.numberFormat}
        onNumberFormatChange={props.onNumberFormatChange}
        excludedPaths={props.excludedPaths}
        onExcludedPathsChange={props.onExcludedPathsChange}
        indexSubagents={props.indexSubagents}
        onIndexSubagentsChange={props.onIndexSubagentsChange}
        onUpdateAvailable={props.onUpdateAvailable}
        onCheckUpdates={props.triggerManualUpdateCheck}
        fontSize={props.fontSize}
        onFontSizeChange={props.onFontSizeChange}
      />

      {/* File Viewer Dialog */}
      <FileViewerDialog sessionCwd={props.selectedSession?.cwd} />

      {/* GDPR/CCPA Consent Modal */}
      <ConsentModal isOpen={props.showConsentModal} onDecision={props.onConsentDecision} />

      {/* Update Modal Overlay */}
      <UpdateModal
        isOpen={props.showUpdateModal}
        updateManifest={props.updateManifest}
        isUpdating={props.isUpdating}
        updateProgress={props.updateProgress}
        updateError={props.updateError}
        onClose={props.onCloseUpdateModal}
        onStartUpdate={props.onStartUpdate}
      />

      {/* Manual Checking Progress Modal */}
      <CheckingUpdatesModal
        isOpen={props.showCheckingModal}
        status={props.checkingStatus}
        errorMsg={props.checkingErrorMsg}
        onClose={props.onCloseCheckingModal}
      />

      {/* Source Detected Prompt Modal */}
      <SourceDetectedModal
        isOpen={props.hasDetectedSources}
        detectedSources={props.detectedSources}
        onToggleSource={props.onToggleDetectedSource}
        onIgnoreAll={props.onIgnoreAllDetectedSources}
        onSave={props.onSaveDetectedSources}
        getSourceDisplayNameById={props.getSourceDisplayNameById}
      />

      {/* Feedback Modal */}
      <FeedbackDialog
        isOpen={props.showFeedback}
        onClose={props.onCloseFeedback}
        appVersion={props.appVersion}
      />

      {/* Licenses Modal */}
      <LicensesDialog isOpen={props.showLicenses} onClose={props.onCloseLicenses} />

      {/* Privacy Modal */}
      <PrivacyDialog isOpen={props.showPrivacy} onClose={props.onClosePrivacy} />
    </>
  );
};
