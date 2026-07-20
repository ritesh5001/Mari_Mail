import bcrypt from "bcryptjs";
import { prisma } from "../src/index.js";

const demoEmail = "demo@marimail.local";

async function main() {
  const passwordHash = await bcrypt.hash("Password123!", 12);

  const user = await prisma.user.upsert({
    where: { email: demoEmail },
    update: { passwordHash, emailVerified: new Date() },
    create: {
      name: "Demo User",
      email: demoEmail,
      passwordHash,
      emailVerified: new Date(),
    },
  });

  const workspace = await prisma.workspace.upsert({
    where: { slug: "demo-marine-services" },
    update: {},
    create: {
      name: "Demo Marine Services",
      slug: "demo-marine-services",
      ownerId: user.id,
      primaryService: "Hold cleaning",
      timezone: "UTC",
    },
  });

  await prisma.workspaceMember.upsert({
    where: {
      userId_workspaceId: {
        userId: user.id,
        workspaceId: workspace.id,
      },
    },
    update: { role: "OWNER" },
    create: {
      userId: user.id,
      workspaceId: workspace.id,
      role: "OWNER",
    },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { defaultWorkspaceId: workspace.id },
  });

  const shipOwner = await prisma.shipOwnerCompany.upsert({
    where: { id: "seed_ship_owner_pacific_carriers" },
    update: {},
    create: {
      id: "seed_ship_owner_pacific_carriers",
      companyName: "Pacific Carriers Ltd.",
      email: "ops@pacific-carriers.example",
      phone: "+65 6000 0101",
      website: "https://pacific-carriers.example",
      country: "SG",
      city: "Singapore",
      orgType: "SHIP_OWNER",
      fleetSize: 42,
      vesselTypesOwned: ["BULK_CARRIER", "GENERAL_CARGO"],
      flagStatesUsed: ["LR", "SG", "PA"],
      portsFrequentlyUsed: ["SGSIN", "AEFUJ"],
      workspaceId: workspace.id,
      verified: true,
    },
  });

  const ismManager = await prisma.iSMManagerCompany.upsert({
    where: { id: "seed_ism_oceanic_technical" },
    update: {},
    create: {
      id: "seed_ism_oceanic_technical",
      companyName: "Oceanic Technical Management",
      email: "technical@oceanic.example",
      phone: "+30 210 000 0101",
      website: "https://oceanic.example",
      country: "GR",
      city: "Athens",
      orgType: "TECHNICAL_MANAGER",
      fleetSize: 58,
      vesselTypesOwned: ["BULK_CARRIER", "TANKER_PRODUCT"],
      specializations: ["BULK", "TANKER"],
      fleetManagedCount: 58,
      workspaceId: workspace.id,
      verified: true,
    },
  });

  const commercialManager = await prisma.commercialManagerCompany.upsert({
    where: { id: "seed_commercial_bluewater" },
    update: {},
    create: {
      id: "seed_commercial_bluewater",
      companyName: "Bluewater Chartering",
      email: "chartering@bluewater.example",
      phone: "+44 20 0000 0101",
      website: "https://bluewater.example",
      country: "GB",
      city: "London",
      orgType: "OPERATOR",
      fleetSize: 23,
      tradeTypes: ["DRY_BULK", "TRAMP"],
      workspaceId: workspace.id,
      verified: true,
    },
  });

  await prisma.shipOwnerCompany.upsert({
    where: { id: "seed_ship_owner_marubeni" },
    update: {},
    create: {
      id: "seed_ship_owner_marubeni",
      companyName: "Marubeni Corporation",
      email: "marine@marubeni.example",
      website: "https://marubeni.example",
      country: "JP",
      city: "Tokyo",
      orgType: "SHIP_OWNER",
      fleetSize: 67,
      vesselTypesOwned: ["BULK_CARRIER", "TANKER_PRODUCT"],
      flagStatesUsed: ["PA", "JP", "MH"],
      portsFrequentlyUsed: ["SGSIN", "JPYOK"],
      workspaceId: workspace.id,
      verified: true,
    },
  });

  await prisma.vessel.upsert({
    where: { imoNumber: "9781234" },
    update: {},
    create: {
      imoNumber: "9781234",
      mmsi: "563123456",
      callsign: "9VPE",
      vesselName: "Pacific Eagle",
      flag: "LR",
      vesselType: "BULK_CARRIER",
      dwt: 82000,
      grossTonnage: 45000,
      netTonnage: 27000,
      builtYear: 2018,
      lengthOverall: 229,
      breadth: 32.2,
      draft: 14.4,
      classificationSociety: "DNV",
      shipOwnerCompanyId: shipOwner.id,
      ismManagerCompanyId: ismManager.id,
      commercialManagerCompanyId: commercialManager.id,
      workspaceId: workspace.id,
      source: "INTERNAL",
      verified: true,
    },
  });

  const contacts = [
    {
      id: "seed_contact_james_ward",
      firstName: "James",
      lastName: "Ward",
      title: "Fleet Manager",
      companyId: shipOwner.id,
      companyKind: "SHIP_OWNER" as const,
      companyName: shipOwner.companyName,
      email: "james.ward@pacific-carriers.example",
      secondaryEmail: "capt.ward@example.com",
      department: ["OPERATIONS", "TECHNICAL"],
      contactOwnerId: user.id,
      mobilePhone: "+65 9000 0101",
      corporatePhone: "+65 6000 0102",
      personLinkedinUrl: "https://linkedin.example/james-ward",
      website: shipOwner.website,
      companyLinkedinUrl: "https://linkedin.example/company/pacific-carriers",
      country: "SG",
      salesforceId: "SF-PC-001",
      seniority: "MANAGER" as const,
      marineRole: "FLEET_MANAGER" as const,
      emailStatus: "VALID" as const,
      engagementScore: 74,
      tags: ["bulk", "hold-cleaning"],
    },
    {
      id: "seed_contact_elena_pappas",
      firstName: "Elena",
      lastName: "Pappas",
      title: "Technical Superintendent",
      companyId: ismManager.id,
      companyKind: "ISM_MANAGER" as const,
      companyName: ismManager.companyName,
      email: "elena.pappas@oceanic.example",
      department: ["TECHNICAL"],
      contactOwnerId: user.id,
      mobilePhone: "+30 690 000 0101",
      corporatePhone: "+30 210 000 0102",
      personLinkedinUrl: "https://linkedin.example/elena-pappas",
      website: ismManager.website,
      country: "GR",
      seniority: "SENIOR" as const,
      marineRole: "SHIP_SUPERINTENDENT" as const,
      emailStatus: "VALID" as const,
      engagementScore: 86,
      tags: ["technical", "greece"],
    },
    {
      id: "seed_contact_amrita_nair",
      firstName: "Amrita",
      lastName: "Nair",
      title: "Chartering Director",
      companyId: commercialManager.id,
      companyKind: "COMMERCIAL_MANAGER" as const,
      companyName: commercialManager.companyName,
      email: "amrita.nair@bluewater.example",
      department: ["CHARTERING", "COMMERCIAL"],
      contactOwnerId: user.id,
      corporatePhone: "+44 20 0000 0102",
      website: commercialManager.website,
      country: "GB",
      salesforceId: "SF-BW-044",
      seniority: "DIRECTOR" as const,
      marineRole: "CHARTERING_MANAGER" as const,
      emailStatus: "RISKY" as const,
      engagementScore: 49,
      tags: ["chartering"],
    },
  ];

  for (const contact of contacts) {
    await prisma.contact.upsert({
      where: { email_workspaceId: { email: contact.email, workspaceId: workspace.id } },
      update: contact,
      create: {
        ...contact,
        workspaceId: workspace.id,
        source: "INTERNAL",
        verified: true,
      },
    });
  }

  const smartList = await prisma.contactList.upsert({
    where: { id: "seed_list_technical_superintendents" },
    update: {},
    create: {
      id: "seed_list_technical_superintendents",
      workspaceId: workspace.id,
      name: "Technical Superintendents",
      type: "SMART",
      color: "#0077B6",
      icon: "ship-wheel",
      filterConfig: {
        entityType: "CONTACT",
        groupLogic: "AND",
        groups: [
          {
            conditions: [
              { field: "department", operator: "includes_any_of", value: ["TECHNICAL"] },
              { field: "marineRole", operator: "equals", value: "SHIP_SUPERINTENDENT" },
            ],
          },
        ],
      },
      contactCount: 1,
    },
  });

  await prisma.savedFilter.upsert({
    where: { id: "seed_filter_fleet_managers_middle_east" },
    update: {},
    create: {
      id: "seed_filter_fleet_managers_middle_east",
      workspaceId: workspace.id,
      name: "Fleet Managers in Middle East",
      entityType: "CONTACT",
      createdById: user.id,
      filterConfig: {
        entityType: "CONTACT",
        groupLogic: "AND",
        groups: [
          {
            conditions: [
              { field: "marineRole", operator: "equals", value: "FLEET_MANAGER" },
              { field: "companyCountry", operator: "is_any_of", value: ["AE", "SA", "QA", "OM", "BH", "KW"] },
            ],
          },
        ],
      },
    },
  });

  await prisma.listContact.upsert({
    where: {
      listId_contactId: {
        listId: smartList.id,
        contactId: "seed_contact_elena_pappas",
      },
    },
    update: {},
    create: {
      listId: smartList.id,
      contactId: "seed_contact_elena_pappas",
    },
  });

  await prisma.vessel.upsert({
    where: { imoNumber: "9795678" },
    update: {},
    create: {
      imoNumber: "9795678",
      mmsi: "563987654",
      callsign: "9VBT",
      vesselName: "Bluewater Trader",
      flag: "PA",
      vesselType: "GENERAL_CARGO",
      dwt: 32000,
      grossTonnage: 21000,
      netTonnage: 12600,
      builtYear: 2015,
      lengthOverall: 180,
      breadth: 28,
      draft: 10.2,
      classificationSociety: "Lloyd's Register",
      shipOwnerCompanyId: shipOwner.id,
      ismManagerCompanyId: ismManager.id,
      commercialManagerCompanyId: commercialManager.id,
      workspaceId: workspace.id,
      source: "INTERNAL",
      verified: true,
    },
  });

  const ports = [
    ["SGSIN", "Singapore", "SG", "Singapore", "SOUTHEAST_ASIA", 1.264, 103.84, ["COMMERCIAL", "ANCHORAGE"], ["Hull cleaning", "Tank cleaning", "Bunkering"]],
    ["AEFUJ", "Fujairah Anchorage", "AE", "United Arab Emirates", "MIDDLE_EAST", 25.16, 56.36, ["ANCHORAGE", "COMMERCIAL"], ["Hold cleaning", "Tank cleaning", "Rope access"]],
    ["INKAN", "Kandla", "IN", "India", "INDIAN_SUBCONTINENT", 23.03, 70.22, ["COMMERCIAL"], ["Port agency", "OPA support", "Hold cleaning"]],
    ["INBOM", "Mumbai", "IN", "India", "INDIAN_SUBCONTINENT", 18.95, 72.83, ["COMMERCIAL"], ["Ship agency", "Crew change", "Port logistics"]],
    ["INNSA", "Nhava Sheva / JNPT", "IN", "India", "INDIAN_SUBCONTINENT", 18.95, 72.95, ["COMMERCIAL", "CONTAINER"], ["Container logistics", "Port agency", "Port logistics"]],
    ["INMUN", "Mundra", "IN", "India", "INDIAN_SUBCONTINENT", 22.74, 69.71, ["COMMERCIAL", "CONTAINER"], ["Port agency", "Bulk cargo", "Container logistics"]],
    ["INPAV", "Pipavav", "IN", "India", "INDIAN_SUBCONTINENT", 20.92, 71.51, ["COMMERCIAL", "CONTAINER"], ["Port agency", "Container logistics", "Bulk cargo"]],
    ["INMAA", "Chennai", "IN", "India", "INDIAN_SUBCONTINENT", 13.08, 80.29, ["COMMERCIAL", "CONTAINER"], ["Port agency", "Crew change", "Container logistics"]],
    ["INENR", "Ennore / Kamarajar", "IN", "India", "INDIAN_SUBCONTINENT", 13.25, 80.34, ["COMMERCIAL", "BULK"], ["Bulk cargo", "Port agency", "Coal terminal services"]],
    ["INCOK", "Cochin", "IN", "India", "INDIAN_SUBCONTINENT", 9.97, 76.24, ["COMMERCIAL"], ["Ship agency", "Hull cleaning", "Port logistics"]],
    ["INNML", "New Mangalore", "IN", "India", "INDIAN_SUBCONTINENT", 12.92, 74.81, ["COMMERCIAL"], ["Bulk cargo", "Port agency", "Port logistics"]],
    ["INVTZ", "Visakhapatnam", "IN", "India", "INDIAN_SUBCONTINENT", 17.69, 83.29, ["COMMERCIAL", "BULK"], ["Bulk cargo", "Hold cleaning", "Port agency"]],
    ["INGGV", "Gangavaram", "IN", "India", "INDIAN_SUBCONTINENT", 17.62, 83.24, ["COMMERCIAL", "BULK"], ["Bulk cargo", "Port agency", "Port logistics"]],
    ["INPRT", "Paradip", "IN", "India", "INDIAN_SUBCONTINENT", 20.27, 86.68, ["COMMERCIAL", "BULK"], ["Bulk cargo", "Hold cleaning", "Port agency"]],
    ["INDHM", "Dhamra", "IN", "India", "INDIAN_SUBCONTINENT", 20.79, 86.95, ["COMMERCIAL", "BULK"], ["Bulk cargo", "Port agency", "Port logistics"]],
    ["INCCU", "Kolkata", "IN", "India", "INDIAN_SUBCONTINENT", 22.57, 88.36, ["COMMERCIAL"], ["River port agency", "Bulk cargo", "Port logistics"]],
    ["INHAL", "Haldia", "IN", "India", "INDIAN_SUBCONTINENT", 22.03, 88.06, ["COMMERCIAL"], ["River port agency", "Bulk cargo", "Port logistics"]],
    ["INMRM", "Mormugao", "IN", "India", "INDIAN_SUBCONTINENT", 15.41, 73.8, ["COMMERCIAL"], ["Bulk cargo", "Ship agency", "Port logistics"]],
    ["INTUT", "Tuticorin", "IN", "India", "INDIAN_SUBCONTINENT", 8.75, 78.22, ["COMMERCIAL"], ["Port agency", "Container logistics", "Bulk cargo"]],
    ["AEDXB", "Dubai / Jebel Ali", "AE", "United Arab Emirates", "MIDDLE_EAST", 25.07, 55.13, ["COMMERCIAL", "DRY_DOCK"], ["Ship repair", "Dry dock", "Agency"]],
    ["NLRTM", "Rotterdam", "NL", "Netherlands", "EUROPE", 51.92, 4.48, ["COMMERCIAL", "DRY_DOCK"], ["Ship repair", "Drydock", "Cargo services"]],
    ["DEHAM", "Hamburg", "DE", "Germany", "EUROPE", 53.55, 9.99, ["COMMERCIAL"], ["Container services", "Ship repair"]],
    ["GIGIB", "Gibraltar", "GI", "Gibraltar", "EUROPE", 36.14, -5.35, ["COMMERCIAL", "ANCHORAGE"], ["Robot hold cleaning", "Bunkering"]],
    ["USHOU", "Houston", "US", "United States", "AMERICAS", 29.74, -95.36, ["COMMERCIAL", "LNG_TERMINAL"], ["Energy terminal services", "LNG/LPG"]],
    ["BRSSZ", "Santos", "BR", "Brazil", "AMERICAS", -23.96, -46.33, ["COMMERCIAL"], ["Tank cleaning", "Agency", "Bulk cargo"]],
    ["AUPHI", "Port Hedland", "AU", "Australia", "OCEANIA", -20.31, 118.58, ["COMMERCIAL"], ["Bulk carrier services", "Iron ore"]],
    ["CNSHA", "Shanghai", "CN", "China", "EAST_ASIA", 31.23, 121.47, ["COMMERCIAL", "DRY_DOCK"], ["Ship repair", "Container services"]],
    ["KRBUS", "Busan", "KR", "South Korea", "EAST_ASIA", 35.09, 129.04, ["COMMERCIAL", "DRY_DOCK"], ["Ship repair", "Hull cleaning"]],
    ["JPYOK", "Yokohama", "JP", "Japan", "EAST_ASIA", 35.45, 139.64, ["COMMERCIAL"], ["Ship repair", "Bulk carrier services"]],
    ["ZADUR", "Durban", "ZA", "South Africa", "AFRICA", -29.86, 31.03, ["COMMERCIAL"], ["Port agency", "Bulk cargo", "Hull cleaning"]],
  ] as const;

  for (const [portCode, portName, country, countryName, region, latitude, longitude, portType, defaultServices] of ports) {
    await prisma.port.upsert({
      where: { portCode },
      update: {
        portName,
        country,
        countryName,
        region,
        latitude,
        longitude,
        portType: [...portType],
        defaultServices: [...defaultServices],
      },
      create: {
        portCode,
        portName,
        country,
        countryName,
        region,
        latitude,
        longitude,
        portType: [...portType],
        defaultServices: [...defaultServices],
        avgTurnaroundHours: 36,
      },
    });
  }

  const campaigns = [
    {
      id: "seed_campaign_underwater_hull_cleaning_sgsin",
      name: "Underwater Hull Cleaning — Singapore",
      description: "Hull cleaning, underwater inspection, propeller polishing for vessels arriving Singapore.",
      triggerType: "PORT_BASED" as const,
      defaultDaysBefore: [5, 3, 1, 0],
    },
    {
      id: "seed_campaign_hold_cleaning_fujairah",
      name: "Hold Cleaning & Rope Access — Fujairah",
      description: "Hold cleaning, rope access and inspection campaign keyed to bulk/general cargo arrivals at Fujairah.",
      triggerType: "PORT_BASED" as const,
      defaultDaysBefore: [5, 3, 1, 0],
    },
    {
      id: "seed_campaign_tank_cleaning_fujairah",
      name: "Tank Cleaning — Fujairah",
      description: "Tank cleaning, sludge removal and gas freeing for tanker arrivals at Fujairah.",
      triggerType: "PORT_BASED" as const,
      defaultDaysBefore: [5, 3, 1, 0],
    },
    {
      id: "seed_campaign_grain_standard_hold_cleaning",
      name: "Grain-Standard Hold Cleaning",
      description: "Triggered when cargo changes to grain — coal/iron-ore/bauxite/any → grain.",
      triggerType: "CARGO_CHANGE" as const,
      defaultDaysBefore: [5, 3, 1, 0],
    },
    {
      id: "seed_campaign_opa_support_kandla",
      name: "OPA / Agency Support — Kandla",
      description: "Port agency, OPA provider, husbandry support at Kandla.",
      triggerType: "PORT_BASED" as const,
      defaultDaysBefore: [5, 3, 1, 0],
    },
  ];

  for (const campaign of campaigns) {
    await prisma.campaign.upsert({
      where: { id: campaign.id },
      update: {
        name: campaign.name,
        description: campaign.description,
        triggerType: campaign.triggerType,
        defaultDaysBefore: campaign.defaultDaysBefore,
        status: "ACTIVE",
      },
      create: {
        id: campaign.id,
        workspaceId: workspace.id,
        name: campaign.name,
        description: campaign.description,
        triggerType: campaign.triggerType,
        defaultDaysBefore: campaign.defaultDaysBefore,
        status: "ACTIVE",
      },
    });
  }

  const portRules = [
    {
      id: "seed_port_rule_sgsin_bulk_hull_cleaning",
      portCode: "SGSIN",
      vesselTypes: ["BULK_CARRIER", "CONTAINER", "GENERAL_CARGO"] as const,
      campaignId: "seed_campaign_underwater_hull_cleaning_sgsin",
      priority: 10,
    },
    {
      id: "seed_port_rule_aefuj_bulk_hold_cleaning",
      portCode: "AEFUJ",
      vesselTypes: ["BULK_CARRIER", "GENERAL_CARGO"] as const,
      campaignId: "seed_campaign_hold_cleaning_fujairah",
      priority: 10,
    },
    {
      id: "seed_port_rule_aefuj_tanker_tank_cleaning",
      portCode: "AEFUJ",
      vesselTypes: ["TANKER_CRUDE", "TANKER_PRODUCT", "TANKER_CHEMICAL"] as const,
      campaignId: "seed_campaign_tank_cleaning_fujairah",
      priority: 10,
    },
    {
      id: "seed_port_rule_inkan_all",
      portCode: "INKAN",
      vesselTypes: [] as const,
      campaignId: "seed_campaign_opa_support_kandla",
      priority: 20,
    },
  ];

  for (const rule of portRules) {
    await prisma.portCampaignRule.upsert({
      where: { id: rule.id },
      update: {
        portCode: rule.portCode,
        vesselTypes: [...rule.vesselTypes],
        campaignId: rule.campaignId,
        priority: rule.priority,
        autoEnroll: true,
      },
      create: {
        id: rule.id,
        workspaceId: workspace.id,
        portCode: rule.portCode,
        vesselTypes: [...rule.vesselTypes],
        campaignId: rule.campaignId,
        priority: rule.priority,
        autoEnroll: true,
      },
    });
  }

  const cargoRules = [
    {
      id: "seed_cargo_rule_coal_to_grain",
      previousCargo: ["COAL"],
      nextCargo: ["GRAIN"],
      campaignId: "seed_campaign_grain_standard_hold_cleaning",
    },
    {
      id: "seed_cargo_rule_iron_ore_to_grain",
      previousCargo: ["IRON_ORE"],
      nextCargo: ["GRAIN"],
      campaignId: "seed_campaign_grain_standard_hold_cleaning",
    },
    {
      id: "seed_cargo_rule_bauxite_to_grain",
      previousCargo: ["BAUXITE"],
      nextCargo: ["GRAIN"],
      campaignId: "seed_campaign_grain_standard_hold_cleaning",
    },
    {
      id: "seed_cargo_rule_any_to_grain",
      previousCargo: [],
      nextCargo: ["GRAIN"],
      campaignId: "seed_campaign_grain_standard_hold_cleaning",
    },
  ];

  for (const rule of cargoRules) {
    await prisma.cargoChangeTrigger.upsert({
      where: { id: rule.id },
      update: {
        previousCargo: rule.previousCargo,
        nextCargo: rule.nextCargo,
        campaignId: rule.campaignId,
        autoEnroll: true,
      },
      create: {
        id: rule.id,
        workspaceId: workspace.id,
        previousCargo: rule.previousCargo,
        nextCargo: rule.nextCargo,
        campaignId: rule.campaignId,
        autoEnroll: true,
      },
    });
  }

  const pacificEagle = await prisma.vessel.findUnique({ where: { imoNumber: "9781234" } });
  if (pacificEagle) {
    const fiveDaysOut = new Date();
    fiveDaysOut.setUTCDate(fiveDaysOut.getUTCDate() + 5);
    fiveDaysOut.setUTCHours(8, 0, 0, 0);
    await prisma.vesselETA.upsert({
      where: { id: "seed_eta_pacific_eagle_sgsin" },
      update: {},
      create: {
        id: "seed_eta_pacific_eagle_sgsin",
        vesselId: pacificEagle.id,
        destinationPort: "SGSIN",
        destinationPortName: "Singapore",
        eta: fiveDaysOut,
        etaSource: "MANUAL_ENTRY",
        etaConfidence: "CONFIRMED",
        previousPort: "AUPHI",
        previousCargo: "IRON_ORE",
        nextCargo: "GRAIN",
        voyageStatus: "AT_SEA",
        speedOverGround: 12.4,
        currentLat: -8.5,
        currentLon: 110.2,
        lastAISUpdate: new Date(),
        workspaceId: workspace.id,
      },
    });
  }

  await seedPhase7Analytics(workspace.id, user.id);
  await seedPhase8Billing(workspace.id, user.id);
}

async function seedPhase8Billing(workspaceId: string, userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { isSuperAdmin: true, lastActiveAt: new Date() },
  });

  const workspace = await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      plan: "PRO",
      billingStatus: "ACTIVE",
      vesselLimit: 250,
      emailLimit: 25_000,
      inboxLimit: 5,
      teamLimit: 5,
      onboardedAt: new Date(),
      creditBalance: 2_500,
    },
  });

  await prisma.creditLedger.upsert({
    where: { id: "seed_credit_ledger_pro_replenish" },
    update: {},
    create: {
      id: "seed_credit_ledger_pro_replenish",
      workspaceId: workspace.id,
      delta: 2_500,
      balance: workspace.creditBalance,
      reason: "PLAN_REPLENISH",
      detail: "Pro plan replenish (seed)",
      actorId: userId,
    },
  });

  await prisma.vessel.upsert({
    where: { imoNumber: "9123456" },
    update: {},
    create: {
      imoNumber: "9123456",
      vesselName: "Global Trade Voyager",
      vesselType: "BULK_CARRIER",
      flag: "LR",
      dwt: 76000,
      grossTonnage: 41500,
      builtYear: 2020,
      verified: true,
      source: "INTERNAL",
      workspaceId: null,
    },
  });
}

async function seedPhase7Analytics(workspaceId: string, userId: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id: "seed_campaign_underwater_hull_cleaning_sgsin" } });
  if (!campaign) return;

  const sequenceTemplates: Array<{ id: string; stepOrder: number; subject: string; delayValue: number }> = [
    { id: "seed_seq_sgsin_day_5", stepOrder: 1, subject: "Hull cleaning support before Singapore arrival — {{vessel_name}}", delayValue: 5 },
    { id: "seed_seq_sgsin_day_3", stepOrder: 2, subject: "Following up: {{vessel_name}} ETA Singapore in 3 days", delayValue: 3 },
    { id: "seed_seq_sgsin_day_1", stepOrder: 3, subject: "Final reminder: {{vessel_name}} arriving tomorrow", delayValue: 1 },
    { id: "seed_seq_sgsin_day_0", stepOrder: 4, subject: "Operations team ready: {{vessel_name}} arrival today", delayValue: 0 },
  ];

  for (const template of sequenceTemplates) {
    await prisma.campaignSequence.upsert({
      where: { id: template.id },
      update: {},
      create: {
        id: template.id,
        campaignId: campaign.id,
        stepOrder: template.stepOrder,
        subject: template.subject,
        bodyHtml: "<p>Hi {{first_name}}, MariMail flagged {{vessel_name}} arriving {{eta_port}} on {{eta_date}}. Reply to coordinate hull cleaning.</p>",
        delayType: "DAYS_BEFORE_ETA",
        delayValue: template.delayValue,
        conditionType: template.stepOrder === 1 ? "ALWAYS" : "IF_NOT_REPLIED",
      },
    });
  }

  const vessel = await prisma.vessel.findUnique({ where: { imoNumber: "9781234" } });
  const eta = await prisma.vesselETA.findUnique({ where: { id: "seed_eta_pacific_eagle_sgsin" } });
  if (!vessel || !eta) return;

  const trigger = await prisma.eTATrigger.upsert({
    where: { campaignId_vesselEtaId: { campaignId: campaign.id, vesselEtaId: eta.id } },
    update: {},
    create: {
      workspaceId,
      campaignId: campaign.id,
      vesselId: vessel.id,
      vesselEtaId: eta.id,
      portCode: eta.destinationPort,
      triggerDaysBefore: [5, 3, 1, 0],
      stepFireTimes: sequenceTemplates.map((step) => ({
        stepOrder: step.stepOrder,
        delayValue: step.delayValue,
        fireAt: new Date(eta.eta.getTime() - step.delayValue * 86_400_000).toISOString(),
      })),
      status: "ACTIVE",
      reason: "Phase 7 demo data",
    },
  });

  const contact = await prisma.contact.findFirst({
    where: { workspaceId, email: "james.ward@pacific-carriers.example" },
  });
  if (!contact) return;

  const campaignContact = await prisma.campaignContact.upsert({
    where: { campaignId_contactId: { campaignId: campaign.id, contactId: contact.id } },
    update: {},
    create: {
      workspaceId,
      campaignId: campaign.id,
      contactId: contact.id,
      vesselId: vessel.id,
      etaTriggerId: trigger.id,
      sequenceId: sequenceTemplates[0]?.id,
      status: "SENT",
      currentStep: 1,
    },
  });

  const baseTime = new Date(Date.now() - 12 * 3_600_000);
  const events: Array<{ id: string; type: "SENT" | "OPENED" | "CLICKED" | "REPLIED"; offsetMinutes: number; stepIndex: number }> = [
    { id: "seed_event_sgsin_sent_1", type: "SENT", offsetMinutes: 0, stepIndex: 0 },
    { id: "seed_event_sgsin_opened_1", type: "OPENED", offsetMinutes: 45, stepIndex: 0 },
    { id: "seed_event_sgsin_clicked_1", type: "CLICKED", offsetMinutes: 60, stepIndex: 0 },
    { id: "seed_event_sgsin_replied_1", type: "REPLIED", offsetMinutes: 240, stepIndex: 0 },
  ];

  for (const event of events) {
    await prisma.emailEvent.upsert({
      where: { id: event.id },
      update: {},
      create: {
        id: event.id,
        workspaceId,
        campaignId: campaign.id,
        contactId: contact.id,
        sequenceId: sequenceTemplates[event.stepIndex]?.id,
        campaignContactId: campaignContact.id,
        trackingId: `seed-track-${event.id}`,
        eventType: event.type,
        occurredAt: new Date(baseTime.getTime() + event.offsetMinutes * 60_000),
        metadata: { source: "seed" },
      },
    });
  }

  await prisma.serviceRecord.upsert({
    where: { id: "seed_service_pacific_eagle" },
    update: {},
    create: {
      id: "seed_service_pacific_eagle",
      workspaceId,
      vesselId: vessel.id,
      serviceName: "Underwater hull cleaning",
      portCode: "SGSIN",
      serviceDate: new Date(Date.now() - 30 * 86_400_000),
      notes: "Quoted $12,500 — completed at Singapore anchorage.",
      amount: 12500,
      currency: "USD",
      createdById: userId,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
