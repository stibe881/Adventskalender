function hasAccess(calendar, user) {
  if (!calendar || !user) return false;
  if (calendar.ownerId === user.id) return true;
  if (calendar.collaborators && calendar.collaborators.includes(user.email)) return true;
  return false;
}

module.exports = { hasAccess };
