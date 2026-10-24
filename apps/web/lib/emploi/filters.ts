import type { CompanyStatus, ReportStatus } from "@sapios/shared";

// Filtres des files du back-office, partagés entre pages serveur et composants client : un module
// "use client" n'exporte vers le serveur que des composants, pas des valeurs.
export const COMPANY_FILTERS: CompanyStatus[] = ["pending", "verified", "suspended", "rejected"];
export const REPORT_FILTERS: ReportStatus[] = ["open", "actioned", "dismissed"];
