const { Server } = require("socket.io");
const db = require("./db");

let io;

// Clients identify a calendar either by its share token (recipients) or by
// its id (admin preview). Rooms are always keyed by the calendar id so both
// views share live state.
async function resolveCalendar(idOrToken) {
  if (!idOrToken || typeof idOrToken !== "string") return null;
  return (await db.getCalendarByToken(idOrToken)) || (await db.getCalendarById(idOrToken));
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const GRID_SIZE = 50;

function validPixel(data) {
  return (
    data &&
    Number.isInteger(data.x) && data.x >= 0 && data.x < GRID_SIZE &&
    Number.isInteger(data.y) && data.y >= 0 && data.y < GRID_SIZE &&
    typeof data.color === "string" && HEX_COLOR.test(data.color)
  );
}

function emitRoomCount(room) {
  const clients = io.sockets.adapter.rooms.get(room);
  io.to(room).emit("room_count", clients ? clients.size : 0);
}

function initSocket(server) {
  io = new Server(server, {
    cors: { origin: "*" }
  });

  io.on("connection", (socket) => {
    socket.on("join_calendar", async (idOrToken) => {
      try {
        const cal = await resolveCalendar(idOrToken);
        if (!cal) return;
        socket.data.calendarId = cal.id;
        socket.join(cal.id);
        emitRoomCount(cal.id);
      } catch (err) {
        console.error("[socket] join_calendar fehlgeschlagen:", err.message);
      }
    });

    socket.on("door_ready", (data) => {
      const room = socket.data.calendarId;
      if (room && data) socket.to(room).emit("partner_ready", data.day);
    });

    socket.on("door_opened_sync", (data) => {
      const room = socket.data.calendarId;
      if (room && data) socket.to(room).emit("door_opened_sync", data);
    });

    // Pixel-Art Community Canvas
    socket.on("get_pixels", async (idOrToken) => {
      try {
        const cal = await resolveCalendar(idOrToken);
        if (cal) socket.emit("pixels_state", cal.pixelGrid || {});
      } catch (err) {
        console.error("[socket] get_pixels fehlgeschlagen:", err.message);
      }
    });

    socket.on("put_pixel", async (data) => {
      if (!validPixel(data)) return;
      try {
        const cal = await resolveCalendar(data.calendarId);
        if (!cal) return;
        await db.updateCalendar(cal.id, (c) => {
          if (!c.pixelGrid) c.pixelGrid = {};
          c.pixelGrid[`${data.x},${data.y}`] = data.color;
          return c;
        });
        io.to(cal.id).emit("pixel_update", { x: data.x, y: data.y, color: data.color });
      } catch (err) {
        console.error("[socket] put_pixel fehlgeschlagen:", err.message);
      }
    });

    // Multiplayer Duel
    socket.on("join_duel", async (data) => {
      const cal = await resolveCalendar(data?.calendarId).catch(() => null);
      if (!cal) return;
      const room = `duel_${cal.id}_${data.day}`;
      socket.data.duelRoom = room;
      socket.join(room);
      const clients = io.sockets.adapter.rooms.get(room);
      if (clients && clients.size >= 2) io.to(room).emit("start_duel");
    });

    socket.on("snowball_hit", () => {
      if (socket.data.duelRoom) socket.to(socket.data.duelRoom).emit("opponent_hit");
    });

    socket.on("disconnecting", () => {
      socket.rooms.forEach((room) => {
        if (room !== socket.id) {
          const clients = io.sockets.adapter.rooms.get(room);
          const count = clients ? clients.size - 1 : 0;
          io.to(room).emit("room_count", count);
        }
      });
    });
  });

  return io;
}

function getIo() {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
}

module.exports = { initSocket, getIo };
