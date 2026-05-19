const parseId = (value) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

export const getDashboardOwnerUserId = (user) => {
  const ownId = parseId(user?.id || user?.user_id || user?.userId);
  if (ownId) return ownId;

  const envOwnerId = parseId(process.env.NEXT_PUBLIC_DASHBOARD_OWNER_USER_ID);
  return envOwnerId || null;
};

