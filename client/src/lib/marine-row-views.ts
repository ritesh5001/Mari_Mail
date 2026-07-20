export type MarineVesselRowView = {
  vesselId: string;
  imoNumber: string | null;
  vesselName: string;
  schemaValues: Record<string, string>;
  associatedContactCount: number;
  matchedValues: string[];
  matchedRoles: string[];
  matchedSources: string[];
  matchConfidences: string[];
};

export type MarineVesselSummaryView = {
  totalVessels: number;
  displayedVessels: number;
  totalContactsMatched: number;
  totalDomainsMatched: number;
};

export type MarineVesselPaginationView = {
  page: number;
  pageSize: number;
  totalPages: number;
  total: number;
};

export type MarineVesselContactView = {
  contactId: string;
  fullName: string;
  email: string | null;
  companyName: string | null;
  jobTitle: string | null;
  marineRole: string | null;
  country: string | null;
  website: string | null;
  matchedValue: string;
  matchedSource: string;
  confidence: string;
  matchedCompanies: Array<{ companyName: string; role: string }>;
};

export type MarineVesselContactsResponse = {
  rows: MarineVesselContactView[];
};

export type AssociatedVesselView = {
  vesselId: string;
  imoNumber: string;
  vesselName: string;
  vesselType: string;
  flag: string | null;
  dwt: number | null;
  currentPortUnlocode: string | null;
  commercialManagerName: string | null;
  ismManagerName: string | null;
  operatorName: string | null;
  matchedValue: string;
  matchedRole: string;
  matchedSource: string;
  confidence: string;
  matchedCompanies: Array<{ companyName: string; role: string }>;
};

export type AssociatedVesselsResponse = {
  rows: AssociatedVesselView[];
};

export type AssociationCountsResponse = {
  counts: Record<string, number>;
};
