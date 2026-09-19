const express = require("express");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const { isDayUnlocked, unlockDateISO, unlockAtMs, getTodayParts } = require("../utils/time");
const { getBonusDoor, bonusDoorUnlocked, BONUS_DOOR_DAY, BONUS_REFERRALS_NEEDED } = require("../utils/access");

// Public view of the secret door 25, mirroring publicDayView's rules.
function bonusDayView(calendar, user) {
  const bonus = getBonusDoor(calendar);
  let isOpened = bonus.opened;
  if (calendar.companyMode) {
    const userState = user && calendar.userStates && calendar.userStates[user];
    isOpened = Boolean(userState && userState.openedDays && userState.openedDays.includes(BONUS_DOOR_DAY));
  }
  const base = { day: BONUS_DOOR_DAY, bonus: true, unlockDate: null, unlocked: true, opened: isOpened, filled: true, isLocked: false, lockHint: null };
  return isOpened ? { ...base, contentType: bonus.contentType, content: bonus.content } : base;
}

// Rudi's coins, purchases and worn items. Normally they live in the visitor's
// browser; in company mode every employee gets their own copy in the database
// so the state follows them from device to device like the opened doors do.
const ECONOMY_MAX_ITEMS = 100;
function cleanIdList(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.filter((x) => typeof x === "string" && /^[\w:-]{1,32}$/.test(x)))].slice(0, ECONOMY_MAX_ITEMS);
}
function economyView(calendar, user) {
  const eco = (user && calendar.userStates && calendar.userStates[user] && calendar.userStates[user].economy) || {};
  return {
    coins: Number.isFinite(eco.coins) ? eco.coins : 0,
    inventory: cleanIdList(eco.inventory),
    worn: cleanIdList(eco.worn),
    claimed: cleanIdList(eco.claimed),
  };
}

const router = express.Router();

const tokenLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
});
router.use(tokenLimiter);

function publicDayView(calendar, door, user = null) {
  const unlocked = calendar.strictMode ? isDayUnlocked(calendar.year, door.day) : true;
  const isLocked = door.content?.lockPassword ? true : false;
  
  let isOpened = door.opened;
  if (calendar.companyMode && user) {
    const userState = calendar.userStates && calendar.userStates[user];
    isOpened = userState && userState.openedDays && userState.openedDays.includes(door.day);
  } else if (calendar.companyMode && !user) {
    isOpened = false;
  }
  
  if (isOpened) {
    return {
      day: door.day,
      unlockDate: unlockDateISO(calendar.year, door.day),
      unlocked,
      opened: true,
      filled: Boolean(door.contentType),
      contentType: door.contentType,
      content: door.content,
      isLocked,
      lockHint: door.content?.lockHint || null
    };
  }

  // If requiresLocation is set and not opened yet, send location data so frontend can verify
  let locationData = null;
  if (door.contentType === "location" && door.content) {
    locationData = {
      requiresLocation: true,
      targetLat: door.content.lat,
      targetLng: door.content.lng,
      locationHint: door.content.hint || ""
    };
  }

  return {
    day: door.day,
    unlockDate: unlockDateISO(calendar.year, door.day),
    unlockAt: unlockAtMs(calendar.year, door.day),
    unlocked,
    opened: false,
    filled: Boolean(door.contentType),
    ...locationData,
    isLocked,
    lockHint: door.content?.lockHint || null,
    sensorLock: door.content?.sensorLock || null,
    geoLat: door.content?.geoLat || null,
    geoLon: door.content?.geoLon || null,
    reqChoiceDay: door.content?.reqChoiceDay || null,
    reqChoiceOpt: door.content?.reqChoiceOpt || null
  };
}

router.get("/:token", async (req, res) => {
  const calendar = await db.getCalendarByToken(req.params.token);
  if (!calendar) return res.status(404).json({ error: "Dieser Kalender existiert nicht." });

  if (calendar.customConfig && calendar.customConfig.password) {
    const providedPwd = req.headers["x-calendar-password"];
    if (providedPwd !== calendar.customConfig.password) {
      return res.status(401).json({ error: "Passwort erforderlich.", requirePassword: true });
    }
  }

  // Company mode identifies employees by e-mail only; anything else is ignored.
  const rawUser = String(req.query.user || "").trim().toLowerCase();
  const user = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(rawUser) ? rawUser : null;

  // Calculate streak based on openedAt or user state
  let streak = 0;
  const todayNum = getTodayParts().day;
  const month = getTodayParts().month;
  
  if (month === 12 && todayNum <= 24) {
    let currentDay = todayNum;
    while (currentDay > 0) {
      const door = calendar.days.find(d => d.day === currentDay);
      let isOpened = door && door.opened;
      if (calendar.companyMode && user) {
        const userState = calendar.userStates && calendar.userStates[user];
        isOpened = userState && userState.openedDays && userState.openedDays.includes(currentDay);
      } else if (calendar.companyMode && !user) {
        isOpened = false;
      }

      if (isOpened) {
        streak++;
        currentDay--;
      } else if (currentDay === todayNum) {
        // if today is not opened, check yesterday
        currentDay--;
      } else {
        break;
      }
    }
  }

  res.json({
    id: calendar.id,
    referrals: calendar.referrals || 0,
    choices: calendar.choices || {},
    recipientName: calendar.recipientName,
    ownerName: calendar.ownerName,
    theme: calendar.theme,
    customConfig: calendar.customConfig,
    randomLayout: calendar.randomLayout,
    syncOpen: calendar.syncOpen,
    companyMode: calendar.companyMode || false,
    companyName: calendar.companyMode ? await require("../utils/access").resolveCompanyName(calendar) : null,
    communityCanvas: require("../utils/access").communityCanvasEnabled(calendar),
    rudiEnabled: calendar.rudiEnabled !== false,
    metaPuzzle: calendar.metaPuzzle,
    playlist: calendar.playlist || [],
    spotifyConnected: Boolean(calendar.spotify?.refreshToken),
    hasCoins: calendar.days.some((d) => d.contentType === "coins"),
    year: calendar.year,
    today: getTodayParts(),
    serverNow: Date.now(),
    streak: streak,
    leaderboard: calendar.leaderboard || [],
    economy: calendar.companyMode && user ? economyView(calendar, user) : null,
    bonusReferralsNeeded: BONUS_REFERRALS_NEEDED,
    days: [
      ...calendar.days.map((d) => publicDayView(calendar, d, user)),
      ...(bonusDoorUnlocked(calendar) ? [bonusDayView(calendar, user)] : []),
    ],
  });
});

router.post("/:token/days/:day/open", async (req, res) => {
  const calendar = await db.getCalendarByToken(req.params.token);
  if (!calendar) return res.status(404).json({ error: "Dieser Kalender existiert nicht." });

  const dayNum = parseInt(req.params.day, 10);
  const isBonus = dayNum === BONUS_DOOR_DAY;
  const door = isBonus ? getBonusDoor(calendar) : calendar.days.find((d) => d.day === dayNum);
  if (!door) return res.status(400).json({ error: "Ungültiges Türchen." });

  if (isBonus && !bonusDoorUnlocked(calendar)) {
    return res.status(403).json({ error: `Das geheime Türchen öffnet sich erst, wenn ${BONUS_REFERRALS_NEEDED} Freunde eingeladen wurden.` });
  }

  // Server-side-only truth: never trust any date the client might send.
  const unlocked = isBonus ? true : calendar.strictMode ? isDayUnlocked(calendar.year, dayNum) : true;
  if (!unlocked) {
    return res.status(403).json({
      error: "Noch nicht so weit! Dieses Türchen öffnet sich erst am " + unlockDateISO(calendar.year, dayNum) + ".",
      unlockDate: unlockDateISO(calendar.year, dayNum),
    });
  }

  if (calendar.metaPuzzle && calendar.metaPassword && calendar.metaPassword.length >= dayNum) {
    if (dayNum < 24) {
      // Days 1-23: reveal a letter
      if (!door.content) door.content = {};
      door.content.metaLetter = calendar.metaPassword[dayNum - 1];
    } else if (dayNum === 24) {
      const provided = req.body.metaPassword;
      if (!provided || provided.toLowerCase().trim() !== calendar.metaPassword.toLowerCase().trim()) {
        return res.status(403).json({ error: "Das Master-Passwort ist leider falsch!", locked: true });
      }
    }
  }
  
  // Für die Escape-Room Passwörter
  if (door.content && door.content.lockPassword) {
    const provided = req.body.password;
    if (!provided || provided.toLowerCase().trim() !== door.content.lockPassword.toLowerCase().trim()) {
      return res.status(403).json({ error: "Falsches Passwort!", locked: true });
    }
  }

  const rawUser = String(req.body.user || "").trim().toLowerCase();
  const user = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(rawUser) ? rawUser : null;
  if (calendar.companyMode && !user) {
    return res.status(400).json({ error: "Bitte melde dich mit deiner E-Mail-Adresse an." });
  }

  const updated = await db.updateCalendar(calendar.id, (cal) => {
    if (cal.companyMode && user) {
      if (!cal.userStates) cal.userStates = {};
      if (!cal.userStates[user]) cal.userStates[user] = { openedDays: [] };
      if (!cal.userStates[user].openedDays.includes(dayNum)) {
        cal.userStates[user].openedDays.push(dayNum);
      }
    } else if (isBonus) {
      cal.bonusDoor = { ...(cal.bonusDoor || {}), opened: true, openedAt: (cal.bonusDoor && cal.bonusDoor.openedAt) || new Date().toISOString() };
    } else {
      const d = cal.days.find((x) => x.day === dayNum);
      if (d) {
        d.opened = true;
        if (!d.openedAt) {
          d.openedAt = new Date().toISOString();
        }
      }
    }
    return cal;
  });

  if (isBonus) {
    const bonus = getBonusDoor(updated);
    return res.json({ day: BONUS_DOOR_DAY, contentType: bonus.contentType, content: bonus.content });
  }

  // Check if day 24 was just opened and trigger postcard!
  if (dayNum === 24) {
    const postcard = require("../services/postcard");
    postcard.sendPostcard(calendar.recipientName, calendar.title || "Dein Adventskalender", door.content).catch(console.error);
  }

  const openedDoor = updated.days.find((d) => d.day === dayNum);
  res.json({
    day: openedDoor.day,
    contentType: openedDoor.contentType || "empty",
    content: openedDoor.content,
  });
});

router.post("/:token/days/:day/reaction", async (req, res) => {
  const calendar = await db.getCalendarByToken(req.params.token);
  if (!calendar) return res.status(404).json({ error: "Kalender nicht gefunden" });
  
  const dayNum = parseInt(req.params.day, 10);
  const emoji = req.body.emoji;
  if (!emoji) return res.status(400).json({ error: "Emoji fehlt" });

  await db.updateCalendar(calendar.id, (cal) => {
    const idx = cal.days.findIndex((d) => d.day === dayNum);
    if (!cal.days[idx].feedback) cal.days[idx].feedback = { reactions: [], replies: [] };
    cal.days[idx].feedback.reactions.push(emoji);
    return cal;
  });
  res.json({ success: true });
});

router.post("/:token/days/:day/giveaway", async (req, res) => {
  const calendar = await db.getCalendarByToken(req.params.token);
  if (!calendar) return res.status(404).json({ error: "Kalender nicht gefunden" });
  
  const dayNum = parseInt(req.params.day, 10);
  const email = req.body.email;
  if (!email) return res.status(400).json({ error: "Email fehlt" });

  await db.updateCalendar(calendar.id, (cal) => {
    const idx = cal.days.findIndex((d) => d.day === dayNum);
    if (!cal.days[idx].giveawayEntries) cal.days[idx].giveawayEntries = [];
    if (!cal.days[idx].giveawayEntries.includes(email)) {
      cal.days[idx].giveawayEntries.push(email);
    }
    return cal;
  });
  res.json({ success: true });
});

router.post("/:token/days/:day/reply", async (req, res) => {
  const calendar = await db.getCalendarByToken(req.params.token);
  if (!calendar) return res.status(404).json({ error: "Kalender nicht gefunden" });
  
  const dayNum = parseInt(req.params.day, 10);
  const { type, url, text } = req.body;
  if (!type) return res.status(400).json({ error: "Typ fehlt" });

  await db.updateCalendar(calendar.id, (cal) => {
    const idx = cal.days.findIndex((d) => d.day === dayNum);
    if (!cal.days[idx].feedback) cal.days[idx].feedback = { reactions: [], replies: [] };
    cal.days[idx].feedback.replies.push({ type, url, text, createdAt: new Date().toISOString() });
    return cal;
  });
  res.json({ success: true });
});

router.put("/:token/economy", async (req, res) => {
  const calendar = await db.getCalendarByToken(req.params.token);
  if (!calendar) return res.status(404).json({ error: "Kalender nicht gefunden" });
  if (!calendar.companyMode) return res.status(400).json({ error: "Nur im Firmenmodus verfügbar." });

  const rawUser = String(req.body?.user || "").trim().toLowerCase();
  const user = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(rawUser) ? rawUser : null;
  if (!user) return res.status(400).json({ error: "Bitte melde dich mit deiner E-Mail-Adresse an." });

  const coins = Math.max(0, Math.min(1_000_000, Math.floor(Number(req.body?.coins) || 0)));
  const economy = { coins, inventory: cleanIdList(req.body?.inventory), worn: cleanIdList(req.body?.worn), claimed: cleanIdList(req.body?.claimed) };

  const updated = await db.updateCalendar(calendar.id, (cal) => {
    if (!cal.userStates) cal.userStates = {};
    if (!cal.userStates[user]) cal.userStates[user] = { openedDays: [] };
    cal.userStates[user].economy = { ...economy, updatedAt: new Date().toISOString() };
    return cal;
  });
  res.json({ ok: true, economy: economyView(updated, user) });
});

router.post("/:token/score", async (req, res) => {
  const calendar = await db.getCalendarByToken(req.params.token);
  if (!calendar) return res.status(404).json({ error: "Kalender nicht gefunden" });
  
  const { name, game, score, day } = req.body;
  if (!name || !game || score === undefined) return res.status(400).json({ error: "Daten fehlen" });

  await db.updateCalendar(calendar.id, (cal) => {
    if (!cal.leaderboard) cal.leaderboard = [];
    const existingIdx = cal.leaderboard.findIndex(e => e.name === name && e.game === game);
    if (existingIdx !== -1) {
      cal.leaderboard[existingIdx].score = score;
      cal.leaderboard[existingIdx].day = day;
      cal.leaderboard[existingIdx].updatedAt = new Date().toISOString();
    } else {
      cal.leaderboard.push({
        name,
        game,
        score,
        day,
        createdAt: new Date().toISOString()
      });
    }
    return cal;
  });
  res.json({ success: true });
});

router.post("/:token/refer", async (req, res) => {
  const calendar = await db.getCalendarByToken(req.params.token);
  if (!calendar) return res.status(404).json({ error: "Kalender nicht gefunden." });
  
  await db.updateCalendar(calendar.id, (cal) => {
    cal.referrals = (cal.referrals || 0) + 1;
    return cal;
  });
  
  res.json({ success: true });
});

router.post("/:token/choice", async (req, res) => {
  const calendar = await db.getCalendarByToken(req.params.token);
  if (!calendar) return res.status(404).json({ error: "Kalender nicht gefunden." });
  
  const { day, option } = req.body;
  if (!day || !option) return res.status(400).json({ error: "Missing day or option." });

  await db.updateCalendar(calendar.id, (cal) => {
    if (!cal.choices) cal.choices = {};
    cal.choices[day] = option;
    return cal;
  });
  
  res.json({ success: true });
});

router.post("/:token/capsule", async (req, res) => {
  const calendar = await db.getCalendarByToken(req.params.token);
  if (!calendar) return res.status(404).json({ error: "Kalender nicht gefunden." });
  
  if (!req.body.message) return res.status(400).json({ error: "No message" });

  await db.updateCalendar(calendar.id, (cal) => {
    if (!cal.timeCapsules) cal.timeCapsules = [];
    cal.timeCapsules.push({ message: req.body.message, date: new Date().toISOString() });
    return cal;
  });
  
  // Simulated email delay queue would go here
  res.json({ success: true });
});

router.post("/:token/playlist", async (req, res) => {
  const calendar = await db.getCalendarByToken(req.params.token);
  if (!calendar) return res.status(404).json({ error: "Kalender nicht gefunden." });
  
  const { day, title, artist, trackUri, url, image } = req.body;
  if (!day || !title || !artist) return res.status(400).json({ error: "Missing fields" });

  const updated = await db.updateCalendar(calendar.id, (cal) => {
    if (!cal.playlist) cal.playlist = [];
    cal.playlist.push({ day, title, artist, trackUri: trackUri || null, url: url || null, image: image || null, addedAt: new Date().toISOString() });
    return cal;
  });

  // Mirror the wish into the real Spotify playlist when the owner linked an account.
  const spotify = require("../services/spotify");
  const door = updated.days.find((d) => d.day === Number(day));
  const result = await spotify.addTrackForCalendar(updated, door?.content?.playlistUrl, trackUri, `${title} – ${artist}`);
  if (result.added) {
    await db.updateCalendar(calendar.id, (cal) => {
      const entry = cal.playlist[cal.playlist.length - 1];
      if (entry && entry.trackUri === trackUri) entry.spotifySynced = true;
      return cal;
    });
  }
  res.json({ success: true, spotify: result });
});

router.get("/:token/vapidPublicKey", (req, res) => {
  const { getVapidPublicKey } = require("../push");
  res.json({ publicKey: getVapidPublicKey() });
});

router.post("/:token/subscribe", async (req, res) => {
  const calendar = await db.getCalendarByToken(req.params.token);
  if (!calendar) return res.status(404).json({ error: "Kalender nicht gefunden." });
  
  const subscription = req.body;
  if (!subscription || !subscription.endpoint) return res.status(400).json({ error: "Invalid subscription" });

  await db.updateCalendar(calendar.id, (cal) => {
    if (!cal.subscriptions) cal.subscriptions = [];
    // Only add if not already present
    const exists = cal.subscriptions.find(s => s.endpoint === subscription.endpoint);
    if (!exists) {
      cal.subscriptions.push(subscription);
    }
    return cal;
  });
  
  res.status(201).json({ success: true });
});

module.exports = router;
