import type {
  CommercialManagerCompany,
  Contact,
  ISMManagerCompany,
  ShipOwnerCompany,
  Vessel,
} from "@marimail/db";

type CompanyLike = Pick<
  ShipOwnerCompany | ISMManagerCompany | CommercialManagerCompany,
  "id" | "companyName" | "email" | "phone" | "website" | "country" | "fleetSize" | "verified"
>;

type VesselWithCompanies = Vessel & {
  shipOwnerCompany: CompanyLike | null;
  ismManagerCompany: CompanyLike | null;
  commercialManagerCompany: CompanyLike | null;
};

export const vesselInclude = {
  shipOwnerCompany: {
    select: {
      id: true,
      companyName: true,
      email: true,
      phone: true,
      website: true,
      country: true,
      fleetSize: true,
      verified: true,
    },
  },
  ismManagerCompany: {
    select: {
      id: true,
      companyName: true,
      email: true,
      phone: true,
      website: true,
      country: true,
      fleetSize: true,
      verified: true,
    },
  },
  commercialManagerCompany: {
    select: {
      id: true,
      companyName: true,
      email: true,
      phone: true,
      website: true,
      country: true,
      fleetSize: true,
      verified: true,
    },
  },
} as const;

export function serializeCompany(company: CompanyLike | null) {
  if (!company) {
    return null;
  }

  return {
    id: company.id,
    companyName: company.companyName,
    email: company.email,
    phone: company.phone,
    website: company.website,
    country: company.country,
    fleetSize: company.fleetSize,
    verified: company.verified,
  };
}

export function serializeVessel(vessel: VesselWithCompanies) {
  return {
    id: vessel.id,
    imoNumber: vessel.imoNumber,
    mmsi: vessel.mmsi,
    callsign: vessel.callsign,
    vesselName: vessel.vesselName,
    flag: vessel.flag,
    vesselType: vessel.vesselType,
    globalArea: vessel.globalArea,
    eni: vessel.eni,
    speed: vessel.speed,
    course: vessel.course,
    draught: vessel.draught,
    navigationalStatus: vessel.navigationalStatus,
    destination: vessel.destination,
    aisClass: vessel.aisClass,
    dwt: vessel.dwt,
    grossTonnage: vessel.grossTonnage,
    netTonnage: vessel.netTonnage,
    builtYear: vessel.builtYear,
    lengthOverall: vessel.lengthOverall,
    breadth: vessel.breadth,
    width: vessel.width,
    draughtMax: vessel.draughtMax,
    draughtMin: vessel.draughtMin,
    yardNumber: vessel.yardNumber,
    vesselTypeDetailed: vessel.vesselTypeDetailed,
    capacityDwt: vessel.capacityDwt,
    capacityGt: vessel.capacityGt,
    capacityTeu: vessel.capacityTeu,
    capacityLiquidGas: vessel.capacityLiquidGas,
    capacityPassengers: vessel.capacityPassengers,
    lengthBetweenPerpendiculars: vessel.lengthBetweenPerpendiculars,
    depth: vessel.depth,
    breadthExtreme: vessel.breadthExtreme,
    capacityLiquidOil: vessel.capacityLiquidOil,
    commercialMarket: vessel.commercialMarket,
    commercialSizeClass: vessel.commercialSizeClass,
    firstAisPositionDate: vessel.firstAisPositionDate,
    currentPortUnlocode: vessel.currentPortUnlocode,
    currentPortCountry: vessel.currentPortCountry,
    commercialManagerName: vessel.commercialManagerName,
    commercialManagerEmail: vessel.commercialManagerEmail,
    commercialManagerCity: vessel.commercialManagerCity,
    commercialManagerCountry: vessel.commercialManagerCountry,
    registeredOwnerName: vessel.registeredOwnerName,
    registeredOwnerEmail: vessel.registeredOwnerEmail,
    registeredOwnerCity: vessel.registeredOwnerCity,
    registeredOwnerCountry: vessel.registeredOwnerCountry,
    beneficialOwnerName: vessel.beneficialOwnerName,
    beneficialOwnerEmail: vessel.beneficialOwnerEmail,
    beneficialOwnerCity: vessel.beneficialOwnerCity,
    beneficialOwnerCountry: vessel.beneficialOwnerCountry,
    technicalManagerName: vessel.technicalManagerName,
    technicalManagerEmail: vessel.technicalManagerEmail,
    technicalManagerCity: vessel.technicalManagerCity,
    technicalManagerCountry: vessel.technicalManagerCountry,
    pAndIClubName: vessel.pAndIClubName,
    pAndIClubEmail: vessel.pAndIClubEmail,
    pAndIClubCity: vessel.pAndIClubCity,
    pAndIClubCountry: vessel.pAndIClubCountry,
    shipBuilderName: vessel.shipBuilderName,
    shipBuilderEmail: vessel.shipBuilderEmail,
    shipBuilderCity: vessel.shipBuilderCity,
    shipBuilderCountry: vessel.shipBuilderCountry,
    classSocietyName: vessel.classSocietyName,
    classSocietyEmail: vessel.classSocietyEmail,
    classSocietyCity: vessel.classSocietyCity,
    classSocietyCountry: vessel.classSocietyCountry,
    engineBuilderName: vessel.engineBuilderName,
    engineBuilderEmail: vessel.engineBuilderEmail,
    engineBuilderCity: vessel.engineBuilderCity,
    engineBuilderCountry: vessel.engineBuilderCountry,
    ismManagerName: vessel.ismManagerName,
    ismManagerEmail: vessel.ismManagerEmail,
    ismManagerCity: vessel.ismManagerCity,
    ismManagerCountry: vessel.ismManagerCountry,
    operatorName: vessel.operatorName,
    operatorEmail: vessel.operatorEmail,
    operatorCity: vessel.operatorCity,
    operatorCountry: vessel.operatorCountry,
    draft: vessel.draft,
    classificationSociety: vessel.classificationSociety,
    status: vessel.status,
    source: vessel.source,
    verified: vessel.verified,
    createdAt: vessel.createdAt.toISOString(),
    updatedAt: vessel.updatedAt.toISOString(),
    shipOwnerCompany: serializeCompany(vessel.shipOwnerCompany),
    ismManagerCompany: serializeCompany(vessel.ismManagerCompany),
    commercialManagerCompany: serializeCompany(vessel.commercialManagerCompany),
  };
}

export function serializeContact(contact: Contact) {
  const cf = (contact.customFields ?? null) as { apolloId?: unknown } | null;
  const apolloId = typeof cf?.apolloId === "string" ? cf.apolloId : null;
  return {
    id: contact.id,
    apolloId,
    firstName: contact.firstName,
    lastName: contact.lastName,
    fullName: `${contact.firstName} ${contact.lastName}`.trim(),
    title: contact.title,
    companyId: contact.companyId,
    companyKind: contact.companyKind,
    companyName: contact.companyName,
    email: contact.email,
    secondaryEmail: contact.secondaryEmail,
    department: contact.department,
    contactOwnerName: contact.contactOwnerName,
    mobilePhone: contact.mobilePhone,
    corporatePhone: contact.corporatePhone,
    homePhone: contact.homePhone,
    otherPhone: contact.otherPhone,
    personLinkedinUrl: contact.personLinkedinUrl,
    website: contact.website,
    companyLinkedinUrl: contact.companyLinkedinUrl,
    country: contact.country,
    subsidiaryOf: contact.subsidiaryOf,
    salesforceId: contact.salesforceId,
    seniority: contact.seniority,
    marineRole: contact.marineRole,
    emailStatus: contact.emailStatus,
    engagementScore: contact.engagementScore,
    tags: contact.tags,
    verified: contact.verified,
    source: contact.source,
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
  };
}
