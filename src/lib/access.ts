export type Access = {
  full: boolean;
  canDaily: boolean;
  canCostEntry: boolean;
  canReminders: boolean;
  canUsage: boolean;
  canBusinessClients: boolean;
  canBusinessProjects: boolean;
  canBusinessDeals: boolean;
  canProjectAmount: boolean;
};

const FULL_ACCESS_USERS = new Set(["袁晓南", "邹思敏", "黄毅", "陈凯蒂", "侯昭薇"]);
const LIMITED_FULL_BUSINESS_USERS = new Set(["张一", "郑铭"]);

export function getAccess(userName: string): Access {
  const name = String(userName || "").trim();
  if (FULL_ACCESS_USERS.has(name)) {
    return {
      full: true,
      canDaily: true,
      canCostEntry: true,
      canReminders: true,
      canUsage: true,
      canBusinessClients: true,
      canBusinessProjects: true,
      canBusinessDeals: true,
      canProjectAmount: true,
    };
  }

  if (LIMITED_FULL_BUSINESS_USERS.has(name)) {
    return {
      full: false,
      canDaily: false,
      canCostEntry: false,
      canReminders: false,
      canUsage: false,
      canBusinessClients: true,
      canBusinessProjects: true,
      canBusinessDeals: true,
      canProjectAmount: true,
    };
  }

  return {
    full: false,
    canDaily: false,
    canCostEntry: false,
    canReminders: false,
    canUsage: false,
    canBusinessClients: true,
    canBusinessProjects: true,
    canBusinessDeals: false,
    canProjectAmount: false,
  };
}
