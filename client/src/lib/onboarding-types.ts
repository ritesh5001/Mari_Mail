export type CampaignItineraryStepId =
  | "connect-inbox"
  | "select-vessels"
  | "find-contacts"
  | "prepare-campaign"
  | "build-sequence"
  | "configure-options"
  | "launch-campaign";

export type CampaignItineraryStepStatus = "complete" | "current" | "locked";

export type CampaignItineraryStep = {
  id: CampaignItineraryStepId;
  number: number;
  title: string;
  shortTitle: string;
  description: string;
  why: string;
  action: string;
  href: string;
  status: CampaignItineraryStepStatus;
};

export type CampaignItineraryProgress = {
  available: boolean;
  isComplete: boolean;
  completedCount: number;
  total: number;
  remainingCount: number;
  campaignName: string | null;
  listName: string | null;
  steps: CampaignItineraryStep[];
  nextStep: CampaignItineraryStep | null;
};
