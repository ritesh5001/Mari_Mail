export type AuthUser = {
  id: string;
  name: string | null;
  email: string;
  emailVerified: string | null;
  defaultWorkspaceId: string | null;
  isSuperAdmin: boolean;
  hiddenNavItems: string[];
};

export type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  timezone: string;
  targetPortCountry: string | null;
  onboardedAt: string | null;
};

export type AuthSession = {
  user: AuthUser;
  activeWorkspace: WorkspaceSummary | null;
  workspaces: WorkspaceSummary[];
};

export type ApiEnvelope<T> = {
  data: T;
};

export type ApiError = {
  error: {
    code: string;
    message: string;
  };
};

export type EntityType = "VESSEL" | "CONTACT" | "COMPANY" | "ETA";
export type GroupLogic = "AND" | "OR";
export type SortDirection = "asc" | "desc";

export type FilterCondition = {
  field: string;
  operator: string;
  value?: unknown;
};

export type FilterGroup = {
  conditions: FilterCondition[];
};

export type FilterConfig = {
  entityType: EntityType;
  groupLogic: GroupLogic;
  groups: FilterGroup[];
  sortBy?: {
    field: string;
    direction: SortDirection;
  };
};

export type CompanySummary = {
  id: string;
  companyName: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  country: string | null;
  fleetSize: number;
  verified: boolean;
};

export type VesselSummary = {
  id: string;
  imoNumber: string;
  mmsi: string | null;
  callsign: string | null;
  vesselName: string;
  flag: string | null;
  vesselType: string;
  globalArea: string | null;
  eni: string | null;
  speed: number | null;
  course: number | null;
  draught: number | null;
  navigationalStatus: string | null;
  destination: string | null;
  aisClass: string | null;
  dwt: number | null;
  grossTonnage: number | null;
  netTonnage: number | null;
  builtYear: number | null;
  lengthOverall: number | null;
  breadth: number | null;
  width: number | null;
  draughtMax: number | null;
  draughtMin: number | null;
  yardNumber: string | null;
  vesselTypeDetailed: string | null;
  capacityDwt: number | null;
  capacityGt: number | null;
  capacityTeu: number | null;
  capacityLiquidGas: number | null;
  capacityPassengers: number | null;
  lengthBetweenPerpendiculars: number | null;
  depth: number | null;
  breadthExtreme: number | null;
  capacityLiquidOil: number | null;
  commercialMarket: string | null;
  commercialSizeClass: string | null;
  firstAisPositionDate: string | null;
  currentPortUnlocode: string | null;
  currentPortCountry: string | null;
  commercialManagerName: string | null;
  commercialManagerEmail: string | null;
  commercialManagerCity: string | null;
  commercialManagerCountry: string | null;
  registeredOwnerName: string | null;
  registeredOwnerEmail: string | null;
  registeredOwnerCity: string | null;
  registeredOwnerCountry: string | null;
  beneficialOwnerName: string | null;
  beneficialOwnerEmail: string | null;
  beneficialOwnerCity: string | null;
  beneficialOwnerCountry: string | null;
  technicalManagerName: string | null;
  technicalManagerEmail: string | null;
  technicalManagerCity: string | null;
  technicalManagerCountry: string | null;
  pAndIClubName: string | null;
  pAndIClubEmail: string | null;
  pAndIClubCity: string | null;
  pAndIClubCountry: string | null;
  shipBuilderName: string | null;
  shipBuilderEmail: string | null;
  shipBuilderCity: string | null;
  shipBuilderCountry: string | null;
  classSocietyName: string | null;
  classSocietyEmail: string | null;
  classSocietyCity: string | null;
  classSocietyCountry: string | null;
  engineBuilderName: string | null;
  engineBuilderEmail: string | null;
  engineBuilderCity: string | null;
  engineBuilderCountry: string | null;
  ismManagerName: string | null;
  ismManagerEmail: string | null;
  ismManagerCity: string | null;
  ismManagerCountry: string | null;
  operatorName: string | null;
  operatorEmail: string | null;
  operatorCity: string | null;
  operatorCountry: string | null;
  draft: number | null;
  classificationSociety: string | null;
  status: string;
  verified: boolean;
  shipOwnerCompany: CompanySummary | null;
  ismManagerCompany: CompanySummary | null;
  commercialManagerCompany: CompanySummary | null;
};

export type ContactSummary = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  title: string | null;
  companyId: string | null;
  companyKind: string;
  companyName: string;
  email: string;
  secondaryEmail: string | null;
  department: string[];
  contactOwnerName: string | null;
  mobilePhone: string | null;
  corporatePhone: string | null;
  homePhone: string | null;
  otherPhone: string | null;
  personLinkedinUrl: string | null;
  website: string | null;
  companyLinkedinUrl: string | null;
  country: string | null;
  subsidiaryOf: string | null;
  salesforceId: string | null;
  seniority: string;
  marineRole: string;
  emailStatus: string;
  engagementScore: number;
  tags: string[];
  verified: boolean;
};

export const MARINE_DATA_ROW_FIELDS = [
  "Flag",
  "Vessel Name",
  "Imo",
  "Mmsi",
  "Global Area",
  "Eni",
  "Speed",
  "Course",
  "Draught",
  "Navigational Status",
  "Built",
  "Destination",
  "Ais Class",
  "Length Overall",
  "Width",
  "Capacity - Dwt",
  "Current Port Unlocode",
  "Current Port Country",
  "Callsign",
  "Draught Max",
  "Draught Min",
  "Yard Number",
  "Vessel Type - Detailed",
  "Capacity - Gt",
  "Capacity - Teu",
  "Capacity - Liquid Gas",
  "Capacity - Passengers",
  "Length Between Perpendiculars",
  "Depth",
  "Breadth Extreme",
  "Capacity - Liquid Oil",
  "Commercial Market",
  "Commercial Size Class",
  "First Ais Position Date",
  "Commercial Manager",
  "Commercial Manager Email",
  "Commercial Manager City",
  "Commercial Manager Country",
  "Registered Owner",
  "Registered Owner Email",
  "Registered Owner City",
  "Registered Owner Country",
  "Beneficial Owner",
  "Beneficial Owner Email",
  "Beneficial Owner City",
  "Beneficial Owner Country",
  "Technical Manager",
  "Technical Manager Email",
  "Technical Manager City",
  "Technical Manager Country",
  "P&i Club",
  "P&i Club Email",
  "P&i Club City",
  "P&i Club Country",
  "Ship Builder",
  "Ship Builder Email",
  "Ship Builder City",
  "Ship Builder Country",
  "Class Society",
  "Class Society Email",
  "Class Society City",
  "Class Society Country",
  "Engine Builder",
  "Engine Builder Email",
  "Engine Builder City",
  "Engine Builder Country",
  "Ism Manager",
  "Ism Manager Email",
  "Ism Manager City",
  "Ism Manager Country",
  "Operator",
  "Operator Email",
  "Operator City",
  "Operator Country",
  "First Name",
  "Last Name",
  "Title",
  "Company",
  "Email",
  "Departments",
  "Contact Owner",
  "Home Phone",
  "Mobile Phone",
  "Corporate Phone",
  "Other Phone",
  "Person Linkedin Url",
  "Website",
  "Company Linkedin Url",
  "Country",
  "Subsidiary of",
  "Secondary Email",
  "Salesforce ID",
] as const;

export type MarineDataRowField = (typeof MARINE_DATA_ROW_FIELDS)[number];
