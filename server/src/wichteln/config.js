/* All tunables of the Wichteln module in one place. Override selectively via
 * environment variables where it makes sense for an operator. */
const env = (name, fallback) => {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : Number(v);
};

module.exports = {
  // Sizes
  maxParticipants: env("WICHTEL_MAX_PARTICIPANTS", 100),
  maxWishlistItems: 30,
  maxMessages: 2000,
  maxPhotos: 200,
  maxThanks: 300,
  maxPushDevices: 10,
  photoMaxBytes: 8 * 1024 * 1024,
  linkPreviewMaxBytes: 400 * 1024,
  linkPreviewTimeoutMs: 6000,

  // Texts limits
  titleMax: 80,
  nameMax: 60,
  budgetMax: 40,
  mottoMax: 120,
  placeMax: 120,
  descriptionMax: 2000,
  messageMax: 1000,
  thanksMax: 400,
  captionMax: 140,
  hintMax: 300,
  notesMax: 500,

  // Tokens
  inviteTokenBytes: 18,
  participantTokenBytes: 12,

  // Rules
  minParticipantsForDraw: 3,
  retentionOptions: [30, 60, 90, 180],
  retentionDefault: 90,
  wishlistNotifyThrottleMs: 60 * 60 * 1000,
  reminderDaysBefore: 1,
  giftReminderDaysBefore: 7,

  // Rate limits (per minute)
  joinRequestsPerMinute: 20,
  participantRequestsPerMinute: 120,

  giftSteps: {
    personal: ["bought", "wrapped", "ready"],
    post: ["bought", "wrapped", "sent", "delivered"],
  },
  giftStepLabels: {
    bought: "Geschenk besorgt",
    wrapped: "Eingepackt",
    ready: "Bereit zur Übergabe",
    sent: "Verschickt",
    delivered: "Angekommen",
  },
};
