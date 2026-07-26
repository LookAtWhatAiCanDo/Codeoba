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

import { GeneralSettings, ThemeSettings } from "../settings/types";

export interface AppModalsCoordinatorProps {
  showSettings: boolean;
  onCloseSettings: () => void;
  generalSettings: GeneralSettings;
  onUpdateGeneralSetting: <K extends keyof GeneralSettings>(
    key: K,
    value: GeneralSettings[K]
  ) => void;
  themeSettings: ThemeSettings;
  onUpdateThemeSetting: <K extends keyof ThemeSettings>(key: K, value: ThemeSettings[K]) => void;
  sources: SourceMetadata[];
  onRefreshSources: () => void;
  onUpdateAvailable: (update: any) => void;
  triggerManualUpdateCheck: () => void;
  selectedSession: Session | null;
  showConsentModal: boolean;
  onConsentDecision: (allowed: boolean) => void;
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
        generalSettings={props.generalSettings}
        onUpdateGeneralSetting={props.onUpdateGeneralSetting}
        themeSettings={props.themeSettings}
        onUpdateThemeSetting={props.onUpdateThemeSetting}
        sources={props.sources}
        onRefreshSources={props.onRefreshSources}
        onUpdateAvailable={props.onUpdateAvailable}
        onCheckUpdates={props.triggerManualUpdateCheck}
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
